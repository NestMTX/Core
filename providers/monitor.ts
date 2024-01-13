import make from '@nestmtx/pando-logger'
import type { Logger } from 'winston'
import { getCamera, getCameras } from '../app/utilities'
import type { ApplicationInterface } from '../contracts/application'
import type { ProviderInterface } from '../contracts/provider'

const useMonitoring: ProviderInterface = (app: ApplicationInterface) => {
  const monitoringLogger = make('core:monitoring')
  const monitoringCleanupLogger = make('core:monitoring:cleanup')
  const monitoringStartupLogger = make('core:monitoring:startup')
  const monitoringShutdownLogger = make('core:monitoring:shutdown')
  let heartbeatIsWorking = false
  let heartbeatSkipCount = 0
  let lastHeartbeatAt = 0
  app.cron.$on('* * * * * *', async () => {
    if (heartbeatIsWorking) {
      heartbeatSkipCount++
      if (heartbeatSkipCount > 60) {
        monitoringLogger.error('Camera Status Heartbeat Failed. Killing core to force restart.')
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
      promises.push(startCamera(app, cameraId, monitoringStartupLogger))
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
  app.on('termination', async () => {
    monitoringLogger.info('Shutting down all running camerea processes')
    const cameras = await getCameras(app)
    const promises: Promise<void>[] = []
    cameras.forEach((camera) => {
      if (app.processes.has(camera.id)) {
        promises.push(stopCamera(app, camera.id, monitoringShutdownLogger))
      }
    })
    await Promise.all(promises)
    monitoringLogger.end()
    monitoringCleanupLogger.end()
    monitoringStartupLogger.end()
    monitoringShutdownLogger.end()
  })
}

const cleanCamera = async (app: ApplicationInterface, cameraId: number, logger: Logger) => {
  logger.info(`Cleaning up database record for camera ${cameraId}`)
  await app.db('cameras').where('id', cameraId).update({
    is_ready: false,
    child_process_id: null,
  })
  logger.info(`Database record for camera ${cameraId} cleaned up`)
  app.emit('camera:db:updated', cameraId)
}

const startCamera = async (app: ApplicationInterface, cameraId: number, logger: Logger) => {
  logger.info(`Trying to start camera #${cameraId}`)
  const camera = await getCamera(app, cameraId)
  if (!camera) {
    logger.warn(`Camera #${cameraId} not found`)
    return
  }
  logger.info(`Starting camera ${cameraId}`)
  // @todo: actually start the camera
  app.emit('camera:db:updated', cameraId)
}

const stopCamera = async (app: ApplicationInterface, cameraId: number, logger: Logger) => {
  logger.info(`Stopping camera ${cameraId}`)
  // @todo: actually stop the camera
  app.emit('camera:db:updated', cameraId)
}

export default useMonitoring
