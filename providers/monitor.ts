import make from '@nestmtx/pando-logger'
import { getCameras } from '../app/utilities'
import type { ApplicationInterface } from '../contracts/application'
import type { ProviderInterface } from '../contracts/provider'

const useMonitoring: ProviderInterface = (app: ApplicationInterface) => {
  const monitoringLogger = make('core:monitoring')
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
        (camera.startup_mode === 'always' || camera.is_demanded === true)
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
    monitoringLogger.debug('Camera Status Heartbeat Finished')
    heartbeatIsWorking = false
  })
  app.on('termination', monitoringLogger.end.bind(monitoringLogger))
}

export default useMonitoring
