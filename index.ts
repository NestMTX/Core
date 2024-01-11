import { Config, EnvSchemaValidationError } from '@nestmtx/config'
import make from '@nestmtx/pando-logger'
import { join, resolve } from 'path'
import 'reflect-metadata'
import sourceMapSupport from 'source-map-support'
import ignite from './app/ignite'

sourceMapSupport.install({ handleUncaughtExceptions: false })
const base = resolve(__dirname)

Config.initialize(join(base, 'config'))
  .then(async (config) => {
    const app = await ignite(config)
    console.log(app)
  })
  .catch((error) => {
    const logger = make('core:initialization')
    if (error instanceof EnvSchemaValidationError && error.messages) {
      logger.crit(error.message + ':\n\n' + error.messages.join('\n'))
    } else {
      logger.crit(error.message)
    }
    logger.once('finish', () => process.exit(1))
    setTimeout(() => logger.end(), 500)
  })
