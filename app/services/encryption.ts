import { randomBytes } from 'node:crypto'

export default class Encryption {
  readonly #secret: string

  constructor(secret: string) {
    this.#secret = secret
  }

  public encrypt(payload: any, expiresIn?: string | number, purpose?: string) {
    const iv = this.#randomString(16)
  }

  public decrypt<T extends any>(value: unknown, purpose?: string): T | null {}

  #randomString(size: number) {
    const bits = (size + 1) * 6
    const buffer = randomBytes(Math.ceil(bits / 8))
    const encoded = Buffer.from(buffer).toString('base64')
    const sanitized = encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/\=/g, '')
    return sanitized.slice(0, size)
  }
}
