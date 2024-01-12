import { Config, EnvSchemaValidationError } from '@nestmtx/config'
import make from '@nestmtx/pando-logger'
import { EventEmitter } from 'events'
import { join, resolve } from 'path'
import 'reflect-metadata'
import sourceMapSupport from 'source-map-support'
import ignite from './app/ignite'
import useMonitoring from './providers/monitor'

sourceMapSupport.install({ handleUncaughtExceptions: false })
const base = resolve(__dirname)
const rootEmitter = new EventEmitter()
const killSignals = [
  'SIGINT',
  'SIGTERM',
  'SIGBREAK',
  'SIGABRT',
  'SIGFPE',
  'SIGPWR',
  'SIGQUIT',
  'SIGSEGV',
  'SIGTERM',
  'SIGTTIN',
  'SIGTTOU',
  'SIGXCPU',
  'SIGUSR2',
]

const onTerminationSignal = async (signal: string) => {
  const listeners = rootEmitter.listeners('termination')
  await Promise.all(listeners.map((listener) => listener(signal)))
}

killSignals.forEach((signal) => process.on(signal, onTerminationSignal))

Config.initialize(join(base, 'config'))
  .then(async (config) => {
    const app = await ignite(config)
    rootEmitter.on('termination', app.onTerminationSignal.bind(app))
    useMonitoring(app)
    await app.start()
  })
  .catch((error) => {
    const logger = make('core:initialization')
    if (error instanceof EnvSchemaValidationError && error.messages) {
      logger.crit(error.message + ':\n\n' + error.messages.join('\n'))
    } else {
      logger.crit(error.stack)
    }
    logger.once('finish', () => process.exit(1))
    setTimeout(() => logger.end(), 500)
  })
