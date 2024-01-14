import { createCanvas, registerFont } from 'canvas'
import { readdir } from 'fs/promises'
import { join } from 'path'

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
  // Return the Buffer
  return canvas.toBuffer('image/png')
}
