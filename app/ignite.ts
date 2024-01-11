import type { Config, Env } from '@nestmtx/config'
import make from '@nestmtx/pando-logger'
import { SocketServer } from '@nestmtx/socket-server'
import { EventEmitter } from 'events'
import type { Knex } from 'knex'
import knex from 'knex'
import { inspect } from 'util'
import type { Logger } from 'winston'

class Application extends EventEmitter {
  public readonly db: Knex
  public readonly api: SocketServer
  public readonly processes: SocketServer
  public readonly logger: Logger
  public readonly config: Config
  public readonly env: Env

  constructor(
    config: Config,
    db: Knex,
    api: SocketServer,
    processes: SocketServer,
    logger: Logger,
    env: Env
  ) {
    super()
    this.config = config
    this.db = db
    this.api = api
    this.processes = processes
    this.logger = logger
    this.env = env
  }

  public async start() {
    this.logger.info('Starting application')
    await Promise.all([this.api.start(), this.processes.start()])
    const onTerminationSignal = () => {
      this.emit('termination')
      this.logger.info('Received termination signal, stopping application')
      this.stop().then(() => {
        this.logger.info('Application stopped')
        process.exit(0)
      })
    }
    const onUncaughtExceptionOrRejection = (error: Error, origin: string) => {
      this.logger.crit(`Uncaught ${origin} exception: ${error.stack}`)
    }
    const onUnhandledRejection = (error: unknown, promise: Promise<unknown>) => {
      if (error instanceof Error) {
        this.logger.crit(`Unhandled rejection at ${promise}: ${error.stack}`)
      } else {
        this.logger.crit(`Unhandled rejection at ${promise}: ${inspect(error)}`)
      }
    }
    const killSignals = [
      'SIGINT',
      'SIGTERM',
      'SIGBREAK',
      'SIGABRT',
      'SIGFPE',
      'SIGKILL',
      'SIGPIPE',
      'SIGPWR',
      'SIGQUIT',
      'SIGSEGV',
      'SIGSTOP',
      'SIGTERM',
      'SIGTTIN',
      'SIGTTOU',
      'SIGXCPU',
    ]
    killSignals.forEach((signal) => process.on(signal, () => onTerminationSignal()))
    process.on('uncaughtException', (error, origin) =>
      onUncaughtExceptionOrRejection(error, origin)
    )
    process.on('unhandledRejection', (error, promise) => onUnhandledRejection(error, promise))
    return this
  }

  public async stop() {
    this.logger.info('Stopping application')
    await Promise.all([
      this.api.stop(),
      this.processes.stop(),
      this.db.destroy(),
      new Promise((resolve) => {
        this.logger.once('finish', resolve)
        setTimeout(() => this.logger.end(), 500)
      }),
    ])
  }
}

export default async function ignite(config: Config) {
  const { default: Env } = await import('../env')
  const db = knex(config.get('database'))
  const apiSocketLogger = make('core:api')
  const processSocketLogger = make('core:processes')
  const apiSocket = new SocketServer(config.get('socket.path'), false)
  apiSocket.on('log', (message, level) => {
    apiSocketLogger[level](message)
  })
  const processSocket = new SocketServer(config.get('processes.path'), false)
  processSocket.on('log', (message, level) => {
    processSocketLogger[level](message)
  })
  const appLogger = make('core')
  const app = new Application(config, db, apiSocket, processSocket, appLogger, Env)
  app.on('termination', () => {
    apiSocketLogger.end()
    processSocketLogger.end()
  })
  return app
}
