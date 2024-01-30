import type { Camera, Credentials } from '../contracts/application'
import type { GaxiosError, GaxiosOptions, GaxiosResponse } from 'gaxios'
import type { ExecaChildProcess } from 'execa'

export class MissingCredentials extends Error {
  constructor(camera: Camera) {
    // Pass the message to the parent Error class
    const message = `Camera ${camera.id} is missing credentials`
    super(message)

    // Ensure the name of this error is the same as the class name
    this.name = this.constructor.name

    /**
     * Set error message
     */
    Object.defineProperty(this, 'message', {
      configurable: true,
      enumerable: false,
      value: message,
      writable: true,
    })
    /**
     * Set error name as a public property
     */
    Object.defineProperty(this, 'name', {
      configurable: true,
      enumerable: false,
      value: this.constructor.name,
      writable: true,
    })

    // This line is needed to make the .stack property work correctly
    Error.captureStackTrace(this, this.constructor)
  }
}

export class IncompleteCredentials extends Error {
  constructor(credentials: Credentials) {
    // Pass the message to the parent Error class
    const message = `The google credentials "${credentials.description}" (${credentials.id}) do not have all of the required information to be used`
    super(message)

    // Ensure the name of this error is the same as the class name
    this.name = this.constructor.name

    /**
     * Set error message
     */
    Object.defineProperty(this, 'message', {
      configurable: true,
      enumerable: false,
      value: message,
      writable: true,
    })
    /**
     * Set error name as a public property
     */
    Object.defineProperty(this, 'name', {
      configurable: true,
      enumerable: false,
      value: this.constructor.name,
      writable: true,
    })

    // This line is needed to make the .stack property work correctly
    Error.captureStackTrace(this, this.constructor)
  }
}

export class CredentialsNotAuthenticated extends Error {
  constructor(credentials: Credentials) {
    // Pass the message to the parent Error class
    const message = `The google credentials "${credentials.description}" (${credentials.id}) are not authenticated`
    super(message)

    // Ensure the name of this error is the same as the class name
    this.name = this.constructor.name

    /**
     * Set error message
     */
    Object.defineProperty(this, 'message', {
      configurable: true,
      enumerable: false,
      value: message,
      writable: true,
    })
    /**
     * Set error name as a public property
     */
    Object.defineProperty(this, 'name', {
      configurable: true,
      enumerable: false,
      value: this.constructor.name,
      writable: true,
    })

    // This line is needed to make the .stack property work correctly
    Error.captureStackTrace(this, this.constructor)
  }
}

class GoogleSdmServiceExecuteCommandFailure<T = any> extends Error {
  public readonly config: GaxiosOptions
  public readonly response?: GaxiosResponse<T> | undefined
  public readonly error?: Error | NodeJS.ErrnoException | undefined
  public readonly code?: string
  public readonly status?: number

  constructor(original: GaxiosError) {
    // Pass the message to the parent Error class
    super(original.message)

    // Set the stack if it exists
    this.name = this.constructor.name
    if (original.stack) {
      this.stack = original.stack
    }
    /**
     * Set error message
     */
    Object.defineProperty(this, 'message', {
      configurable: true,
      enumerable: false,
      value: original.message,
      writable: true,
    })
    /**
     * Set error name as a public property
     */
    Object.defineProperty(this, 'name', {
      configurable: true,
      enumerable: false,
      value: this.constructor.name,
      writable: true,
    })

    /**
     * Set the config value
     */
    Object.defineProperty(this, 'config', {
      configurable: true,
      enumerable: false,
      value: original.config,
      writable: false,
    })
    /**
     * Set the response value
     */
    Object.defineProperty(this, 'response', {
      configurable: true,
      enumerable: false,
      value: original.response,
      writable: false,
    })
    /**
     * Set the error value
     */
    Object.defineProperty(this, 'error', {
      configurable: true,
      enumerable: false,
      value: original.error,
      writable: false,
    })
    /**
     * Set the code value
     */
    Object.defineProperty(this, 'code', {
      configurable: true,
      enumerable: false,
      value: original.code,
      writable: false,
    })
    /**
     * Set the status value
     */
    Object.defineProperty(this, 'status', {
      configurable: true,
      enumerable: false,
      value: original.status,
      writable: false,
    })

    // This line is needed to make the .stack property work correctly
    Error.captureStackTrace(this, this.constructor)
  }
}

export class ExecuteGenerateRtspStreamError<
  T = any,
> extends GoogleSdmServiceExecuteCommandFailure<T> {}

export class StreamInfoRetrievalError extends Error {
  constructor(camera: Camera) {
    // Pass the message to the parent Error class
    const message = `The required stream information for ${camera.id} is could not be retrieved`
    super(message)

    // Ensure the name of this error is the same as the class name
    this.name = this.constructor.name

    /**
     * Set error message
     */
    Object.defineProperty(this, 'message', {
      configurable: true,
      enumerable: false,
      value: message,
      writable: true,
    })
    /**
     * Set error name as a public property
     */
    Object.defineProperty(this, 'name', {
      configurable: true,
      enumerable: false,
      value: this.constructor.name,
      writable: true,
    })

    // This line is needed to make the .stack property work correctly
    Error.captureStackTrace(this, this.constructor)
  }
}

export class FFMpegProcessFailedToStartError extends Error {
  constructor(camera: Camera, process: ExecaChildProcess) {
    // Pass the message to the parent Error class
    const message = `The ffmpeg process for camera ${camera.id} exited with code ${process.exitCode}`
    super(message)

    // Ensure the name of this error is the same as the class name
    this.name = this.constructor.name

    /**
     * Set error message
     */
    Object.defineProperty(this, 'message', {
      configurable: true,
      enumerable: false,
      value: message,
      writable: true,
    })
    /**
     * Set error name as a public property
     */
    Object.defineProperty(this, 'name', {
      configurable: true,
      enumerable: false,
      value: this.constructor.name,
      writable: true,
    })

    // This line is needed to make the .stack property work correctly
    Error.captureStackTrace(this, this.constructor)
  }
}

export class UnrecognizedProtocolError extends Error {
  constructor(protocol: string) {
    // Pass the message to the parent Error class
    const message = `The protocol "${protocol}" is not recognized`
    super(message)

    // Ensure the name of this error is the same as the class name
    this.name = this.constructor.name

    /**
     * Set error message
     */
    Object.defineProperty(this, 'message', {
      configurable: true,
      enumerable: false,
      value: message,
      writable: true,
    })
    /**
     * Set error name as a public property
     */
    Object.defineProperty(this, 'name', {
      configurable: true,
      enumerable: false,
      value: this.constructor.name,
      writable: true,
    })

    // This line is needed to make the .stack property work correctly
    Error.captureStackTrace(this, this.constructor)
  }
}
