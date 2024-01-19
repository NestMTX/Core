import make from '@nestmtx/pando-logger'
import type { ApplicationInterface } from '../../contracts/application'

export default async function startRtspCamera(app: ApplicationInterface, camera: any) {
  const logger = make(`core:camera:${camera.id}:rtsp`)
  const { execa } = app.execa
}
