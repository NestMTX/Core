import { createCanvas, registerFont } from 'canvas'
import { readdir } from 'fs/promises'
import { join } from 'path'
import type { ExecaModule } from '../esModules'
import type { Logger } from 'winston'
import make from '@nestmtx/pando-logger'
import type SocketServer from './socket'
import type { ExecaChildProcess } from 'execa'

export interface Color {
  r: number
  g: number
  b: number
  a: number
}

export interface MakeOverlayImageOptions {
  title: string
  text?: string | undefined
  width?: number
  height?: number
  background?: Color
  foreground?: Color
  titleSize?: number
  textSize?: number
}

export interface MakeOverlayImageConfig extends MakeOverlayImageOptions {
  title: string
  text?: string | undefined
  width: number
  height: number
  background: Color
  foreground: Color
  titleSize: number
  textSize: number
}

export const makeOverlayImage = async (options: MakeOverlayImageOptions) => {
  const config: MakeOverlayImageConfig = Object.assign(
    {},
    {
      width: 1920,
      height: 1080,
      background: { r: 0, g: 0, b: 62, a: 1 },
      foreground: { r: 255, g: 255, b: 255, a: 1 },
      titleSize: 64,
      textSize: 18,
    },
    options
  )
  // Register the Fonts
  const fontsDir = join(__dirname, '..', '..', 'fonts')
  const fonts = await readdir(fontsDir)
  for (let fi = 0; fi < fonts.length; fi++) {
    const fontFolder = fonts[fi]
    const fontFiles = await readdir(join(fontsDir, fontFolder))
    for (let ff = 0; ff < fontFiles.length; ff++) {
      const fontFile = fontFiles[ff]
      if (fontFile.endsWith('.ttf')) {
        registerFont(join(fontsDir, fontFolder, fontFile), { family: fontFolder })
      }
    }
  }
  // Create a canvas for text rendering
  const canvas = createCanvas(config.width, config.height)
  const ctx = canvas.getContext('2d')
  // Draw the Background
  ctx.fillStyle = `rgba(${[
    config.background.r,
    config.background.g,
    config.background.b,
    config.background.a,
  ].join(',')})`
  ctx.fillRect(0, 0, config.width, config.height)
  // Set the Text Style
  ctx.fillStyle = `rgba(${[
    config.foreground.r,
    config.foreground.g,
    config.foreground.b,
    config.foreground.a,
  ].join(',')})`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // Draw the Title
  ctx.font = `${config.titleSize}px "NotoSansDisplay"`
  ctx.fillText(config.title, config.width / 2, config.height / 2)
  // Draw the Text
  if (config.text) {
    ctx.font = `${config.textSize}px "NotoSansDisplay"`
    ctx.fillText(config.text, config.width / 2, config.height / 2 + config.titleSize)
  }
  // Return the Image Buffer
  return canvas.toBuffer('image/png')
}

export class OverlayStreamer {
  readonly #logger: Logger
  readonly #execa: ExecaModule
  readonly #server: SocketServer
  #process?: ExecaChildProcess
  #abortController: AbortController

  constructor(cameraId: number, execa: ExecaModule, server: SocketServer) {
    this.#logger = make(`core:camera:${cameraId}:overlay`)
    this.#execa = execa
    this.#server = server
    this.#abortController = new AbortController()
  }

  public async write(packet: Buffer) {
    this.#logger.debug('Starting the ffmpeg process')
    if (!this.#process || !this.#process.stdin || !this.#process.stdin.writable) {
      this.#process = this.#execa.execa(
        'ffmpeg',
        [
          '-f',
          'image2pipe',
          '-i',
          '-',
          '-c:v',
          'libx264',
          '-f',
          'mpegts',
          '-movflags',
          'frag_keyframe+empty_moov',
          '-max_packet_size',
          '1300',
          'pipe:1',
        ],
        {
          signal: this.#abortController.signal,
          stdout: 'pipe',
          input: packet,
        }
      )
      if (!this.#process || !this.#process.stdin || !this.#process.stdout) {
        this.#logger.error('Failed to start ffmpeg process')
        return
      }
      this.#process.stdout.on('data', (retPacket) => {
        this.#logger.debug(`Pushing buffer with size ${retPacket.length} to socket server`)
        this.#server.broadcast(retPacket)
      })
      this.#process
        .then(() => {
          this.#process = undefined
        })
        .catch((err) => {
          this.#logger.error(err)
          this.#process = undefined
        })
    } else {
      this.#logger.debug(`Pushing buffer with size ${packet.length} to ffmpeg process`)
      this.#process.stdin.write(packet)
    }
  }

  public async shutdown() {
    this.#abortController.abort()
    await Promise.all([this.#server.close()])
  }
}
