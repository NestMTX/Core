import type { ApplicationInterface } from '../contracts/application'

export const getCameras = async (app: ApplicationInterface) => {
  const tableExists = await app.db.schema.hasTable('cameras')
  if (!tableExists) {
    return []
  }
  const fromDb = await app
    .db('cameras')
    .select(
      'id',
      'name',
      'mediamtx_path',
      'startup_mode',
      'is_active',
      'is_ready',
      'is_demanded',
      'child_process_id'
    )
  return fromDb.map((camera) => ({
    ...camera,
    is_active: !!camera.is_active,
    is_ready: !!camera.is_ready,
    is_demanded: !!camera.is_demanded,
  }))
}
