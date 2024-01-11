import type { Config } from '@nestmtx/config'
import make from '@nestmtx/pando-logger'
import knex from 'knex'
import { createServer } from 'net'

export default async function ignite(config: Config) {
  const { default: Env } = await import('../env')
  const db = knex(config.get('database'))
  const apiSocketLogger = make('core:api')
  const processSocketLogger = make('core:processes')
  const apiSocket = createServer((socket) => {
    apiSocketLogger.info('API has new client connection')
  })
  const processSocket = createServer((socket) => {
    processSocketLogger.info('Processes has new client connection')
  })
  console.log(config.root)
  console.log(Env.get('NESTMTX_SOCKET_PATH'))
  console.log(db)
  console.log(apiSocket)
  console.log(processSocket)
}
