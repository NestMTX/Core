import type { EnvSchema } from '@nestmtx/config'
import { Env } from '@nestmtx/config'
import Joi from 'joi'

const schema: EnvSchema = {
  APP_KEY: Joi.string().required().min(32),
  NESTMTX_SOCKET_PATH: Joi.string().required(),
  NESTMTX_TMP_DIR: Joi.string().required(),
  DB_CONNECTION: Joi.string()
    .allow('sqlite', 'mysql', 'pg', 'mssql')
    .optional()
    .empty('')
    .default('sqlite'),
  DB_HOST: Joi.string().hostname().optional(),
  DB_PORT: Joi.number().min(0).max(65535).optional(),
  DB_USER: Joi.string().optional(),
  DB_PASSWORD: Joi.string().optional(),
  DB_NAME: Joi.string().optional(),
  DB_SECURE: Joi.boolean().optional().default(false),
  GSTREAMER_LAUNCH_PATH: Joi.string().optional().empty('').default('/usr/bin/gst-launch-1.0'),
  GSTREAMER_INSPECT_PATH: Joi.string().optional().empty('').default('/usr/bin/gst-inspect-1.0'),
}

export default new Env(schema)
