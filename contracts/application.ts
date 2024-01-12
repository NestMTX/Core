import type { MiliCron } from '@jakguru/milicron'
import type { Config, Env } from '@nestmtx/config'
import type { SocketServer } from '@nestmtx/socket-server'
import type { EventEmitter } from 'events'
import type { Knex } from 'knex'
import type { Logger } from 'winston'
import type Encryption from '../app/services/encryption'

export interface ApplicationInterface extends EventEmitter {
  readonly db: Knex
  readonly api: SocketServer
  readonly processes: Map<number, number>
  readonly logger: Logger
  readonly config: Config
  readonly env: Env
  readonly cron: MiliCron
  readonly encryption: Encryption
  start(): Promise<this>
  stop(): Promise<void>
}
