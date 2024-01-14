import type { ApplicationInterface } from '../contracts/application'
import { access, constants } from 'fs/promises'

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

export const getCamera = async (app: ApplicationInterface, id: number) => {
  const tableExists = await app.db.schema.hasTable('cameras')
  if (!tableExists) {
    return undefined
  }
  const fromDb = await app.db('cameras').where('id', id).first()
  if (!fromDb) {
    return undefined
  }
  return {
    ...fromDb,
    is_active: !!fromDb.is_active,
    is_ready: !!fromDb.is_ready,
    is_demanded: !!fromDb.is_demanded,
    uid: fromDb.uid ? app.encryption.decrypt(fromDb.uid) : null,
    info: fromDb.info ? app.encryption.decrypt(fromDb.info) : null,
    stream_info: fromDb.info ? app.encryption.decrypt(fromDb.stream_info) : null,
  }
}

export const fsExists = async (path: string, mode?: number) => {
  try {
    await access(path, mode ?? constants.F_OK)
    return true
  } catch {
    return false
  }
}
