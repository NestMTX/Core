import make from '@nestmtx/pando-logger'
import type {
  ApplicationInterface,
  Camera,
  GoogleRTSPStreamInfo,
  RTSPStreamInfo,
} from '../../contracts/application'
import SocketServer from '../../app/services/socket'
import { pickPort } from 'pick-port'
import {
  MissingCredentials,
  IncompleteCredentials,
  CredentialsNotAuthenticated,
  ExecuteGenerateRtspStreamError,
  StreamInfoRetrievalError,
  FFMpegProcessFailedToStartError,
} from '../errors'
import type { ExecaChildProcess } from 'execa'

export default async function startRtspCamera(
  app: ApplicationInterface,
  camera: Camera<RTSPStreamInfo>,
  abortSignal?: AbortSignal
): Promise<() => ExecaChildProcess> {
  const logger = make(`core:camera:${camera.id}:rtsp`)
  const { execa } = app.execa
  const { credentials } = camera
  if (!credentials) {
    throw new MissingCredentials(camera)
  }
  if (
    !credentials.oauth_client_id ||
    !credentials.oauth_client_secret ||
    !credentials.dac_project_id
  ) {
    throw new IncompleteCredentials(credentials)
  }
  let redirectUri: string | null | undefined
  if (camera.stream_info?.redirectUri) {
    redirectUri = camera.stream_info.redirectUri
  } else if (credentials.redirect_uri) {
    redirectUri = credentials.redirect_uri
  }
  if (!credentials.tokens || !redirectUri) {
    throw new CredentialsNotAuthenticated(credentials)
  }
  const { google } = require('googleapis') as typeof import('googleapis')
  const oac = new google.auth.OAuth2(
    credentials.oauth_client_id,
    credentials.oauth_client_secret,
    redirectUri
  )
  oac.setCredentials(credentials.tokens)
  const service = google.smartdevicemanagement({
    version: 'v1',
    auth: oac,
  })
  const port = await pickPort({
    type: 'tcp',
    ip: '0.0.0.0',
    reserveTimeout: 15,
  })
  logger.notice(`Starting streaming server on port ${port}`)
  const socket: SocketServer = new SocketServer(port)
  logger.notice(`Fetching Source RTSP Stream`)
  let streamInfo: RTSPStreamInfo | undefined
  try {
    const {
      data: { results },
    } = await service.enterprises.devices.executeCommand({
      name: camera.uid,
      requestBody: {
        command: 'sdm.devices.commands.CameraLiveStream.GenerateRtspStream',
      },
    })
    streamInfo = results! as GoogleRTSPStreamInfo
  } catch (error) {
    logger.error(error)
    throw new ExecuteGenerateRtspStreamError(error)
  }
  if (!streamInfo) {
    throw new StreamInfoRetrievalError(camera)
  }
  streamInfo.redirectUri = redirectUri
  const process = execa(
    'ffmpeg',
    [
      '-hide_banner',
      '-timeout',
      '5000000',
      //   '-reconnect',
      //   '1',
      //   '-reconnect_streamed',
      //   '1',
      //   '-reconnect_delay_max',
      //   '2',
      '-probesize',
      '32',
      '-analyzeduration',
      '0',
      '-f',
      'rtsp',
      `-i`,
      `${streamInfo.streamUrls.rtspUrl}`,
      '-fflags',
      'nobuffer',
      '-c',
      'copy',
      '-f',
      'mpegts',
      '-movflags',
      'faststart',
      'pipe:1',
    ],
    {
      signal: abortSignal,
      stdout: 'pipe',
    }
  )
  if (!process || !process.stdin || !process.stdout) {
    throw new FFMpegProcessFailedToStartError(camera, process)
  }
  process.stdout.on('data', (retPacket) => {
    logger.debug(`Pushing buffer with size ${retPacket.length} to socket server`)
    socket.broadcast(retPacket)
  })
  process.stderr?.on('data', (chunk) => {
    chunk
      .toString()
      .split('\n')
      .forEach((line) => {
        logger.debug(line)
      })
  })
  return () => process
}
