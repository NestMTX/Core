import type { ApplicationInterface, Camera } from '../contracts/application'
import { access, constants } from 'fs/promises'

export const safeJsonParse = (json: string | null | undefined, onFail: any = undefined) => {
  if ('string' !== typeof json) {
    return onFail
  }
  try {
    return JSON.parse(json)
  } catch {
    return onFail
  }
}

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
  const credentials = await app.db('credentials').where('id', fromDb.credential_id).first()
  credentials.oauth_client_id = app.encryption.decrypt(credentials.oauth_client_id)
  credentials.oauth_client_secret = app.encryption.decrypt(credentials.oauth_client_secret)
  credentials.dac_project_id = app.encryption.decrypt(credentials.dac_project_id)
  credentials.tokens = safeJsonParse(
    safeJsonParse(app.encryption.decrypt(credentials.tokens), null),
    null
  )
  return {
    ...fromDb,
    is_active: !!fromDb.is_active,
    is_ready: !!fromDb.is_ready,
    is_demanded: !!fromDb.is_demanded,
    uid: fromDb.uid ? app.encryption.decrypt(fromDb.uid) : null,
    info: fromDb.info ? safeJsonParse(app.encryption.decrypt(fromDb.info), null) : null,
    stream_info: fromDb.info ? safeJsonParse(app.encryption.decrypt(fromDb.stream_info)) : null,
    credentials,
  } as Camera
}

export const fsExists = async (path: string, mode?: number) => {
  try {
    await access(path, mode ?? constants.F_OK)
    return true
  } catch {
    return false
  }
}
