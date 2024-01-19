import { createServer } from 'net'
import type { Server, Socket } from 'net'
import type { Logger } from 'winston'
import make from '@nestmtx/pando-logger'

export default class SocketServer {
  #server: Server
  #logger: Logger
  #sockets: Set<Socket> = new Set()

  constructor(port: number) {
    this.#server = createServer(
      {
        keepAlive: true,
      },
      (socket: Socket) => {
        this.#sockets.add(socket)
        socket.on('close', () => {
          this.#sockets.delete(socket)
        })
      }
    )
    this.#logger = make(`core:socket:server:${port}`)
    this.#server.listen(port, '0.0.0.0', () => {
      this.#logger.info(`Socket server listening on port ${port}`)
    })
  }

  public async broadcast(what: string | Buffer) {
    return await Promise.all(
      [...this.#sockets].map(
        (socket) =>
          new Promise((resolve, reject) => {
            socket.write(what, (error) => {
              if (error) {
                reject(error)
              } else {
                resolve(void 0)
              }
            })
          })
      )
    )
  }

  public async close() {
    return await new Promise<void>((resolve, reject) => {
      this.#server.close((error) => {
        if (error) {
          this.#logger.error(error.message)
          reject(error)
        } else {
          this.#logger.info('Socket server closed')
          resolve()
        }
      })
    })
  }
}
