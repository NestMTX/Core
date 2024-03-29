import make from '@nestmtx/pando-logger'
import type { Logger } from 'winston'
import { getCamera, getCameras } from '../app/utilities'
import type { ApplicationInterface, Camera, RTSPStreamInfo } from '../contracts/application'
import type { ProviderInterface } from '../contracts/provider'
import SocketServer from '../app/services/socket'
import { pickPort } from 'pick-port'
import { OverlayStreamer } from '../app/services/overlays'
import type { ExecaChildProcess } from 'execa'
import { UnrecognizedProtocolError, FFMpegProcessFailedToStartError } from '../app/errors'
import startRtspCamera from '../app/services/rtsp'

/**
 * The Monitoring Provider is responsible for managing the camera processes.
 */
const useMonitoring: ProviderInterface = (app: ApplicationInterface) => {
  const monitoringLogger = make('core:monitoring')
  const monitoringCleanupLogger = make('core:monitoring:cleanup')
  const monitoringStartupLogger = make('core:monitoring:startup')
  const monitoringShutdownLogger = make('core:monitoring:shutdown')
  const overlayPortToCameraMap = new Map<number, number | undefined>()
  const overlayCameraToSocketMap = new Map<number, SocketServer>()
  const overlayCameraToOverlayStreamerMap = new Map<number, OverlayStreamer>()
  const getOverlayCameraPort = (cameraId: number) => {
    const port = Array.from(overlayPortToCameraMap.keys()).find(
      (port) => overlayPortToCameraMap.get(port) === cameraId
    )
    return port
  }
  const ensureOverlaySocket = async (cameraId: number) => {
    if (overlayCameraToSocketMap.has(cameraId)) {
      return overlayCameraToSocketMap.get(cameraId)!
    }
    let port = await pickPort({
      type: 'tcp',
      ip: '0.0.0.0',
      reserveTimeout: 15,
    })
    while (overlayPortToCameraMap.has(port) && overlayPortToCameraMap.get(port) !== cameraId) {
      port = await pickPort({
        type: 'tcp',
        ip: '0.0.0.0',
        reserveTimeout: 15,
      })
    }
    const socket: SocketServer = new SocketServer(port)
    overlayPortToCameraMap.set(port, cameraId)
    overlayCameraToSocketMap.set(cameraId, socket)
    return socket
  }
  const ensureOverlayStreamer = async (cameraId: number) => {
    let streamer: OverlayStreamer | undefined
    if (!overlayCameraToOverlayStreamerMap.has(cameraId)) {
      const overlaySocket = await ensureOverlaySocket(cameraId)
      streamer = new OverlayStreamer(cameraId, app.execa, overlaySocket)
      overlayCameraToOverlayStreamerMap.set(cameraId, streamer)
    } else {
      streamer = overlayCameraToOverlayStreamerMap.get(cameraId)
    }
    return streamer
  }

  let heartbeatIsWorking = false
  let heartbeatSkipCount = 0
  let lastHeartbeatAt = 0
  /**
   * The Heartbeat is a cron job which runs every second.
   * It checks the status of each camera and starts or stops the camera processes as needed.
   */
  app.cron.$on('* * * * * *', async () => {
    if (heartbeatIsWorking) {
      heartbeatSkipCount++
      if (heartbeatSkipCount > 60) {
        monitoringLogger.error('Camera Status Heartbeat Failed. Killing core to force restart.')
        console.error('Camera Status Heartbeat Failed. Killing core to force restart.')
        process.exit(1)
      }
      return
    }
    const now = Date.now()
    if (lastHeartbeatAt > 0) {
      const elapsed = now - lastHeartbeatAt
      monitoringLogger.debug(`Time since Last Camera Status Heartbeat: ${elapsed}ms`)
    }
    lastHeartbeatAt = now
    heartbeatIsWorking = true
    heartbeatSkipCount = 0
    monitoringLogger.debug('Camera Status Heartbeat Started')
    const cameras = await getCameras(app)
    // a set of the ids of cameras which should be live but aren't
    const shouldBeLive = new Set<number>()
    // a set of the ids of cameras which should not be live but are
    const shouldBeDead = new Set<number>()
    // a set of the ids of cameras which need to have their `is_ready` and `child_process_id` cleaned
    const shouldBeCleaned = new Set<number>()
    /* Determine which cameras should be live and which should be dead */
    cameras.forEach((camera) => {
      const cameraShouldBeLive =
        'string' === typeof camera.mediamtx_path &&
        camera.mediamtx_path.length > 0 &&
        camera.is_active === true &&
        camera.startup_mode !== 'never' &&
        (camera.startup_mode === 'always_on' || camera.is_demanded === true)
      if (cameraShouldBeLive) {
        if (!app.processes.has(camera.id)) {
          shouldBeLive.add(camera.id)
        }
      } else {
        if (app.processes.has(camera.id)) {
          shouldBeDead.add(camera.id)
        }
        if (camera.is_ready === true || camera.child_process_id !== null) {
          shouldBeCleaned.add(camera.id)
        }
      }
    })
    /* Do the actions for each of the cameras which need to be cleaned up, started, or stopped */
    const promises: Promise<void>[] = [] // @todo add type for execa process
    shouldBeCleaned.forEach((cameraId) =>
      promises.push(cleanCamera(app, cameraId, monitoringCleanupLogger))
    )
    shouldBeLive.forEach((cameraId) =>
      promises.push(
        startCamera(
          app,
          cameraId,
          monitoringStartupLogger,
          ensureOverlayStreamer(cameraId),
          getOverlayCameraPort(cameraId)
        )
      )
    )
    shouldBeDead.forEach((cameraId) =>
      promises.push(stopCamera(app, cameraId, monitoringShutdownLogger))
    )
    /* Wait for all of the actions to complete */
    await Promise.all(promises)
    const finishTime = Date.now()
    const elapsed = finishTime - now
    monitoringLogger.debug(`Camera Status Heartbeat Finished in ${elapsed}ms`)
    heartbeatIsWorking = false
  })
  let overlayerIsWorking = false
  let overlayerSkipCount = 0
  let lastOverlayerAt = 0
  /**
   * The Camera Overlayer is a cron job which runs every 200ms.
   * It checks the status of each camera and writes the appropriate overlay to the named pipe.
   * It pushes overlays at a rate of 5fps, which should be sufficient to keep the ffmpeg pipeline alive.
   */
  app.cron.$on('*/200 * * * * * *', async () => {
    if (overlayerIsWorking) {
      overlayerSkipCount++
      if (overlayerSkipCount > 60) {
        monitoringLogger.error('Camera Overlayer Heartbeat Failed. Killing core to force restart.')
        process.exit(1)
      }
      return
    }
    const now = Date.now()
    if (lastOverlayerAt > 0) {
      const elapsed = now - lastOverlayerAt
      monitoringLogger.debug(`Time since Last Camera Overlayer Heartbeat: ${elapsed}ms`)
    }
    lastOverlayerAt = now
    overlayerIsWorking = true
    overlayerSkipCount = 0
    monitoringLogger.debug('Camera Overlayer Started')
    const cameras = await getCameras(app)
    /* Ensure that there are sockets for the overlays for each camera */
    monitoringLogger.debug('Ensuring that sockets exist for overlays')
    await Promise.all(cameras.map((camera) => ensureOverlaySocket(camera.id)))
    /* Separate each status into its own silo */
    monitoringLogger.debug('Separating cameras into silos')
    const camerasInitializing = new Set<number>()
    const camerasDisabled = new Set<number>()
    const camerasDisconnected = new Set<number>()
    const camerasOffline = new Set<number>()
    const camerasLive = new Set<number>()
    cameras.forEach((camera) => {
      switch (true) {
        case camera.startup_mode === 'never':
          camerasDisabled.add(camera.id)
          break
        case camera.is_active === false:
          camerasDisabled.add(camera.id)
          break
        case camera.is_active === true && camera.child_process_id === null:
          camerasInitializing.add(camera.id)
          break
        case camera.is_active === true && camera.child_process_id !== null && !camera.is_ready:
          camerasDisconnected.add(camera.id)
          break
        case camera.is_active === true &&
          camera.child_process_id !== null &&
          camera.is_ready &&
          app.processes.has(camera.id):
          camerasLive.add(camera.id)
          break
        default:
          camerasOffline.add(camera.id)
          break
      }
    })
    /* Write the overlays for each camera to the appropriate socket */
    monitoringLogger.debug('Writing overlays to sockets')
    const promises: Promise<void>[] = []
    const sendOverlayToSocket = async (cameraId: number, overlay: Buffer) => {
      // const streamer = overlayCameraToOverlayStreamerMap.get(cameraId)
      const streamer = await ensureOverlayStreamer(cameraId)
      if (streamer) {
        await streamer.write(overlay)
      } else {
        monitoringLogger.error(`Overlay streamer for camera ${cameraId} not found`)
      }
    }
    camerasInitializing.forEach((cameraId) =>
      promises.push(sendOverlayToSocket(cameraId, app.overlays.initializing))
    )
    camerasDisabled.forEach((cameraId) =>
      promises.push(sendOverlayToSocket(cameraId, app.overlays.disabled))
    )
    camerasDisconnected.forEach((cameraId) =>
      promises.push(sendOverlayToSocket(cameraId, app.overlays.disconnected))
    )
    camerasOffline.forEach((cameraId) =>
      promises.push(sendOverlayToSocket(cameraId, app.overlays.offline))
    )
    camerasLive.forEach((cameraId) =>
      promises.push(sendOverlayToSocket(cameraId, app.overlays.live))
    )
    await Promise.all(promises)
    const finishTime = Date.now()
    const elapsed = finishTime - now
    monitoringLogger.debug(`Camera Overlayer Finished in ${elapsed}ms`)
    overlayerIsWorking = false
  })
  /**
   * When the application is terminated, we need to shut down all of the camera and logger processes.
   */
  app.on('termination', async () => {
    monitoringLogger.info('Shutting down all running camerea processes')
    const cameras = await getCameras(app)
    const promises: Promise<void>[] = []
    cameras.forEach((camera) => {
      if (app.processes.has(camera.id)) {
        promises.push(stopCamera(app, camera.id, monitoringShutdownLogger))
      }
    })
    overlayCameraToOverlayStreamerMap.forEach((streamer) => {
      promises.push(streamer.shutdown())
    })
    await Promise.all(promises)
    monitoringLogger.end()
    monitoringCleanupLogger.end()
    monitoringStartupLogger.end()
    monitoringShutdownLogger.end()
  })
}

/**
 * Clean up the database record for a camera.
 */
const cleanCamera = async (app: ApplicationInterface, cameraId: number, logger: Logger) => {
  logger.info(`Cleaning up database record for camera ${cameraId}`)
  await app.db('cameras').where('id', cameraId).update({
    is_ready: false,
    child_process_id: null,
  })
  logger.info(`Database record for camera ${cameraId} cleaned up`)
  app.emit('camera:db:updated', cameraId)
}

/**
 * Start a camera gstreamer process.
 */
const startCamera = async (
  app: ApplicationInterface,
  cameraId: number,
  logger: Logger,
  overlayStreamerPromise: Promise<OverlayStreamer | undefined>,
  overlaySocketPort: number | undefined
) => {
  logger.info(`Trying to start camera #${cameraId}`)
  const camera = await getCamera(app, cameraId)
  if (!camera) {
    logger.warning(`Camera #${cameraId} not found`)
    return
  }
  if (!camera.info) {
    logger.warning(`Camera #${cameraId} is missing required information to be started.`)
    logger.notice(`Removing camera #${cameraId} from startable cameras.`)
    await app.db('cameras').where('id', cameraId).update({
      is_active: false,
      is_ready: false,
      child_process_id: null,
    })
    return
  }
  const overlayStreamer = await overlayStreamerPromise
  if (!overlayStreamer) {
    logger.notice(
      `Overlay Streamer for camera #${cameraId} not found. Camera will not be started yet.`
    )
    return
  }
  if (!overlaySocketPort) {
    logger.notice(
      `Overlay Socket Port for camera #${cameraId} not found. Camera will not be started yet.`
    )
    return
  }
  logger.info(`Starting camera ${cameraId}`)
  const { traits: cameraTraits } = camera.info
  if (!cameraTraits || !cameraTraits['sdm.devices.traits.CameraLiveStream']) {
    logger.warning(`Camera #${cameraId} is missing required traits to be started.`)
    logger.notice(`Removing camera #${cameraId} from startable cameras.`)
    await app.db('cameras').where('id', cameraId).update({
      is_active: false,
      is_ready: false,
      child_process_id: null,
    })
  }
  const cameraLiveStreamTraits = cameraTraits!['sdm.devices.traits.CameraLiveStream']
  if (
    !cameraLiveStreamTraits.supportedProtocols ||
    !Array.isArray(cameraLiveStreamTraits.supportedProtocols) ||
    cameraLiveStreamTraits.supportedProtocols.length === 0
  ) {
    logger.warning(`Camera #${cameraId} is missing required protocol information to be started.`)
    logger.notice(`Removing camera #${cameraId} from startable cameras.`)
    await app.db('cameras').where('id', cameraId).update({
      is_active: false,
      is_ready: false,
      child_process_id: null,
    })
  }
  const cameraSupportedProtocls = cameraLiveStreamTraits.supportedProtocols
  const cameraProtocolToUse = cameraSupportedProtocls[0]
  logger.debug(`Camera ${cameraId} is using protocol ${cameraProtocolToUse}`)
  let processFn: () => ExecaChildProcess | undefined
  try {
    switch (cameraProtocolToUse) {
      case 'RTSP':
        processFn = await startRtspCamera(app, camera as Camera<RTSPStreamInfo>)
        break

      default:
        throw new UnrecognizedProtocolError(cameraProtocolToUse)
    }
  } catch (error) {
    logger.error(`Failed to start camera ${cameraId}`)
    if (!(error instanceof FFMpegProcessFailedToStartError)) {
      logger.notice(`Removing camera #${cameraId} from startable cameras.`)
      await app.db('cameras').where('id', cameraId).update({
        is_active: false,
        is_ready: false,
        child_process_id: null,
      })
    }
    return
  }
  if (!processFn) {
    logger.error(`Failed to start camera ${cameraId}`)
    logger.notice(`Removing camera #${cameraId} from startable cameras.`)
    await app.db('cameras').where('id', cameraId).update({
      is_active: false,
      is_ready: false,
      child_process_id: null,
    })
    return
  }
  const cameraProcess = processFn()
  if (!cameraProcess) {
    logger.error(`Failed to start camera ${cameraId}`)
    await app.db('cameras').where('id', cameraId).update({
      is_ready: false,
      child_process_id: null,
    })
    return
  }
  cameraProcess
    .then((res) => {
      logger.info(`Camera ${cameraId} exited with code ${res.exitCode}`)
      if (!res.isCanceled) {
        app.db('cameras').where('id', cameraId).update({
          is_ready: false,
          child_process_id: null,
        })
      }
      app.processes.delete(cameraId)
      app.emit('camera:db:updated', cameraId)
    })
    .catch((error: any) => {
      if (error instanceof Error) {
        logger.error(`Camera ${cameraId} exited with error`)
        logger.error(error)
      }
      if (error.stderr) {
        logger.error(error.stderr)
      }
      if (error.shortMessage) {
        logger.error(error.shortMessage)
      }
      app.db('cameras').where('id', cameraId).update({
        is_ready: false,
        child_process_id: null,
      })
      app.processes.delete(cameraId)
    })
  await app.db('cameras').where('id', cameraId).update({
    is_ready: true,
    child_process_id: cameraProcess.pid,
  })
  app.processes.set(cameraId, cameraProcess.pid!)
  app.emit('camera:db:updated', cameraId)
}

/**
 * Stop a camera gstreamer process.
 */
const stopCamera = async (app: ApplicationInterface, cameraId: number, logger: Logger) => {
  logger.info(`Stopping camera ${cameraId}`)
  // @todo: actually stop the camera
  app.emit('camera:db:updated', cameraId)
}

export default useMonitoring
