import { MiliCron } from '@jakguru/milicron'
import type { Config, Env } from '@nestmtx/config'
import make from '@nestmtx/pando-logger'
import { SocketServer } from '@nestmtx/socket-server'
import { EventEmitter } from 'events'
import type { Knex } from 'knex'
import knex from 'knex'
import { inspect } from 'util'
import type { Logger } from 'winston'
import type { ApplicationInterface } from '../contracts/application'
import Encryption from './services/encryption'

class Application extends EventEmitter implements ApplicationInterface {
  public readonly db: Knex
  public readonly api: SocketServer
  public readonly processes: Map<number, number>
  public readonly logger: Logger
  public readonly config: Config
  public readonly env: Env
  public readonly cron: MiliCron
  public readonly encryption: Encryption

  constructor(
    config: Config,
    db: Knex,
    api: SocketServer,
    logger: Logger,
    env: Env,
    encryption: Encryption
  ) {
    super()
    this.config = config
    this.db = db
    this.api = api
    this.processes = new Map<number, number>()
    this.logger = logger
    this.env = env
    this.cron = new MiliCron()
    this.encryption = encryption
  }

  public async start() {
    this.logger.info('Starting application')
    await Promise.all([this.api.start(), this.cron.start()])
    return this
  }

  public async stop() {
    this.logger.info('Stopping application')
    const handleError = (error: unknown) => {
      const isOk = (message: string) => ['aborted'].some((code) => message.includes(code))
      if (error instanceof Error) {
        if (!isOk(error.message)) {
          throw error
        }
      } else if ('string' === typeof error) {
        if (!isOk(error)) {
          throw new Error(error)
        }
      } else {
        throw error
      }
    }
    await Promise.all([
      new Promise((resolve) =>
        this.api
          .stop()
          .then(resolve, (reason) => {
            handleError(reason)
          })
          .catch(handleError)
      ),
      new Promise((resolve) =>
        this.db
          .destroy()
          .then(resolve, (reason) => {
            handleError(reason)
          })
          .catch(handleError)
      ),
      this.cron.stop(),
      new Promise((resolve) => {
        this.logger.once('finish', resolve)
        setTimeout(() => this.logger.end(), 500)
      }),
    ])
    this.emit('terminated')
  }

  public async onTerminationSignal(signal: string) {
    this.emit('termination', signal)
    this.logger.info('Received termination signal, stopping application')
    await this.stop()
    process.exit(signal ? parseInt(signal) : 0)
  }

  public onUncaughtExceptionOrRejection(error: Error, origin: string) {
    this.logger.crit(`Uncaught ${origin} exception: ${error.stack}`)
  }

  public onUnhandledRejection(error: unknown, promise: Promise<unknown>) {
    if (error instanceof Error) {
      this.logger.crit(`Unhandled rejection at ${promise}: ${error.stack}`)
    } else {
      this.logger.crit(`Unhandled rejection at ${promise}: ${inspect(error)}`)
    }
  }
}

export default async function ignite(config: Config) {
  const { default: Env } = await import('../env')
  const databaseSocketLogger = make('core:database')
  const dbConfig = Object.assign({}, config.get('database'), {
    debug: true,
    log: {
      warn: databaseSocketLogger.warning.bind(databaseSocketLogger),
      error: databaseSocketLogger.error.bind(databaseSocketLogger),
      deprecate: databaseSocketLogger.warning.bind(databaseSocketLogger),
      debug: databaseSocketLogger.debug.bind(databaseSocketLogger),
    },
  }) as Knex.Config
  const db = knex(dbConfig)
  const apiSocketLogger = make('core:api')
  const apiSocket = new SocketServer(config.get('socket.path'), false)
  apiSocket.on('log', (message, level) => {
    apiSocketLogger[level](message)
  })
  const appLogger = make('core')
  const encryption = new Encryption(config.get('encryption.secret'))
  const app = new Application(config, db, apiSocket, appLogger, Env, encryption)
  app.on('terminated', () => {
    apiSocketLogger.end()
  })
  return app
}
