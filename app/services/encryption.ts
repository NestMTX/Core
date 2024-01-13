import { parse } from '@lukeed/ms'
import make from '@nestmtx/pando-logger'
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'crypto'
import { configure } from 'safe-stable-stringify'
import { parse as safeJsonParse } from 'secure-json-parse'
import { inspect } from 'util'
import type { Logger } from 'winston'

type JSONReplacer = (this: any, key: string, value: any) => any
type JSONReviver = (this: any, key: string, value: any) => any

const stringify = configure({
  bigint: false,
  circularValue: undefined,
  deterministic: false,
})

function jsonStringifyReplacer(replacer?: JSONReplacer): JSONReplacer {
  return function (key, value) {
    const val = replacer ? replacer.call(this, key, value) : value

    if (typeof val === 'bigint') {
      return val.toString()
    }

    return val
  }
}

function safeStringify(
  value: any,
  replacer?: JSONReplacer,
  space?: string | number
): string | undefined {
  return stringify(value, jsonStringifyReplacer(replacer), space)
}

function safeParse(jsonString: string, reviver?: JSONReviver): any {
  return safeJsonParse(jsonString, reviver, {
    protoAction: 'remove',
    constructorAction: 'remove',
  })
}

class MessageBuilder {
  #parseMs = (duration: string | number) => {
    if (typeof duration === 'number') {
      return duration
    }

    const milliseconds = parse(duration)
    if (milliseconds === undefined) {
      throw new Error(`Invalid duration expression "${duration}"`)
    }

    return milliseconds
  }

  #getExpiryDate(expiresIn?: string | number): undefined | Date {
    if (!expiresIn) {
      return undefined
    }

    const expiryMs = this.#parseMs(expiresIn)
    return new Date(Date.now() + expiryMs)
  }

  /**
   * Returns a boolean telling, if message has been expired or not
   */
  #isExpired(message: any) {
    if (!message.expiryDate) {
      return false
    }

    const expiryDate = new Date(message.expiryDate)
    return Number.isNaN(expiryDate.getTime()) || expiryDate < new Date()
  }

  /**
   * Builds a message by encoding expiry date and purpose inside it.
   */
  public build(message: any, expiresIn?: string | number, purpose?: string): string {
    const expiryDate = this.#getExpiryDate(expiresIn)
    return safeStringify({ message, purpose, expiryDate })!
  }

  /**
   * Verifies the message for expiry and purpose.
   */
  public verify<T extends any>(message: any, purpose?: string): null | T {
    const parsed = safeParse(message)

    /**
     * After JSON.parse we do not receive a valid object
     */
    if (typeof parsed !== 'object' || !parsed) {
      return null
    }

    /**
     * Missing ".message" property
     */
    if (!parsed.message) {
      return null
    }

    /**
     * Ensure purposes are same.
     */
    if (parsed.purpose !== purpose) {
      return null
    }

    /**
     * Ensure isn't expired
     */
    if (this.#isExpired(parsed)) {
      return null
    }

    return parsed.message
  }
}

export default class Encryption {
  readonly #secret: string
  readonly #key: Buffer
  readonly #logger: Logger

  constructor(secret: string) {
    this.#secret = secret
    this.#key = createHash('sha256').update(this.#secret).digest()
    this.#logger = make('core:encryption')
  }

  public encrypt(payload: any, expiresIn?: string | number, purpose?: string) {
    const iv = this.#randomString(16)
    const cipher = createCipheriv('aes-256-cbc', this.#key, iv)
    const encoded = new MessageBuilder().build(payload, expiresIn, purpose)
    const encrypted = Buffer.concat([cipher.update(encoded, 'utf-8'), cipher.final()])
    const parts = [this.#base64UrlEncode(encrypted), this.#base64UrlEncode(Buffer.from(iv))]
    const result = parts.join('.')
    const hmac = this.#makeHmac(result)
    return [result, hmac].join('.')
  }

  public decrypt<T extends any>(value: unknown, purpose?: string): T | null {
    this.#logger.debug(`Attempting to decrypt value: ${inspect(value, false, 2, true)}`)
    if (typeof value !== 'string') {
      this.#logger.warning(
        `Decryption failed because ${inspect(value, false, 2, true)} is not a string`
      )
      return null
    }
    const [encryptedEncoded, ivEncoded, hmac] = value.split('.')
    if (!encryptedEncoded || !ivEncoded || !hmac) {
      this.#logger.warning(
        `Decryption failed because ${inspect(value, false, 2, true)} is missing parts`
      )
      return null
    }
    const encrypted = this.#base64UrlDecode(encryptedEncoded)
    if (!encrypted) {
      this.#logger.warning(
        `Decryption failed because ${inspect(
          encryptedEncoded,
          false,
          2,
          true
        )} could not be decoded`
      )
      return null
    }
    const iv = this.#base64UrlDecode(ivEncoded)
    if (!iv) {
      this.#logger.warning(
        `Decryption failed because ${inspect(ivEncoded, false, 2, true)} could not be decoded`
      )
      return null
    }
    const testHmac = this.#makeHmac([encryptedEncoded, ivEncoded].join('.'))
    if (testHmac !== hmac) {
      this.#logger.warning(
        `Decryption failed because ${inspect(hmac, false, 2, true)} does not match ${inspect(
          testHmac,
          false,
          2,
          true
        )}`
      )
      return null
    }
    try {
      const decipher = createDecipheriv('aes-256-cbc', this.#key, iv)
      const decrypted = decipher.update(encrypted) + decipher.final('utf-8')
      const ret = new MessageBuilder().verify(decrypted, purpose)
      this.#logger.debug(`Decryption successful`)
      return ret as T
    } catch (e) {
      this.#logger.warning(e.message)
      return null
    }
  }

  #randomString(size: number) {
    const bits = (size + 1) * 6
    const buffer = randomBytes(Math.ceil(bits / 8))
    const sanitized = this.#base64UrlEncode(buffer)
    return sanitized.slice(0, size)
  }

  #base64UrlEncode(buffer: Buffer) {
    const encoded = Buffer.from(buffer).toString('base64')
    return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/\=/g, '')
  }

  #base64UrlDecode(value: string) {
    const decoded = Buffer.from(value, 'base64')
    const isInvalid = this.#base64UrlEncode(decoded) !== value
    if (isInvalid) {
      return null
    }
    return decoded
  }

  #makeHmac(value: string) {
    return this.#base64UrlEncode(createHmac('sha256', this.#key).update(value).digest())
  }
}
