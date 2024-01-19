import type { MiliCron } from '@jakguru/milicron'
import type { Config, Env } from '@nestmtx/config'
import type { SocketServer } from '@nestmtx/socket-server'
import type { EventEmitter } from 'events'
import type { Knex } from 'knex'
import type { Logger } from 'winston'
import type Encryption from '../app/services/encryption'
import type { ExecaModule } from '../app/esModules'
import type { pickPort } from 'pick-port'
import type { smartdevicemanagement_v1 } from 'googleapis'
import type { GetTokenResponse } from 'google-auth-library/build/src/auth/oauth2client.d.ts'

export interface Overlays {
  initializing: Buffer
  disabled: Buffer
  disconnected: Buffer
  offline: Buffer
  live: Buffer
  missing: Buffer
}

export interface ApplicationInterface extends EventEmitter {
  readonly db: Knex
  readonly api: SocketServer
  readonly processes: Map<number, number>
  readonly logger: Logger
  readonly config: Config
  readonly env: Env
  readonly cron: MiliCron
  readonly encryption: Encryption
  readonly execa: ExecaModule
  readonly pickPort: typeof pickPort
  readonly overlays: Overlays
  start(): Promise<this>
  stop(): Promise<void>
}

export interface Credentials {
  id: number
  description: string
  checksum: string
  oauth_client_id: string | null
  oauth_client_secret: string | null
  dac_project_id: string | null
  tokens: GetTokenResponse | null
}

export interface Camera {
  id: number
  credential_id: number
  uid: string
  room: string
  name: string
  checksum: string
  info: smartdevicemanagement_v1.Schema$GoogleHomeEnterpriseSdmV1Device | null
  mediamtx_path: string | null
  is_active: boolean
  is_ready: boolean
  stream_info: any | null
  child_process_id: number | null
  webrtc_ffmpeg_sdp: string | null
  webrtc_width: number | null
  webrtc_height: number | null
  webrtc_fps: number | null
  webrtc_bitrate_k: number
  startup_mode: 'always_on' | 'on_demand' | 'never'
  is_demanded: boolean
  credentials: Credentials
}
