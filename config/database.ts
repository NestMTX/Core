import type { Knex } from 'knex'
import { join } from 'path'
import Env from '../env'

const connections: Record<string, Knex.Config> = {
  sqlite: {
    client: 'sqlite',
    connection: {
      filename: join(Env.get('NESTMTX_TMP_DIR', '/tmp'), 'nestmtx.sqlite'),
    },
    pool: {
      afterCreate: (conn, cb) => {
        conn.run('PRAGMA foreign_keys=true', cb)
      },
    },
    useNullAsDefault: true,
  } as Knex.Config,
  mysql: {
    client: 'mysql2',
    connection: {
      host: Env.get('DB_HOST', 'localhost'),
      port: Env.get('DB_PORT', 3306),
      user: Env.get('DB_USER', 'lucid'),
      password: Env.get('DB_PASSWORD', ''),
      database: Env.get('DB_NAME', 'lucid'),
      ssl: {
        rejectUnauthorized: !Env.get('DB_SECURE', false),
      },
    },
  } as Knex.Config,
  pg: {
    client: 'pg',
    connection: {
      host: Env.get('DB_HOST', 'localhost'),
      port: Env.get('DB_PORT', 5432),
      user: Env.get('DB_USER', 'lucid'),
      password: Env.get('DB_PASSWORD', ''),
      database: Env.get('DB_NAME', 'lucid'),
      ssl: Env.get('DB_SECURE', false),
    },
  } as Knex.Config,
  mssql: {
    client: 'mssql',
    connection: {
      user: Env.get('DB_USER', 'lucid'),
      port: Env.get('DB_PORT', 1443),
      server: Env.get('DB_HOST', 'localhost'),
      password: Env.get('DB_PASSWORD', ''),
      database: Env.get('DB_NAME', 'lucid'),
    },
  } as Knex.Config,
}

const connection = connections[Env.get('DB_CONNECTION', 'sqlite')]

export default connection
