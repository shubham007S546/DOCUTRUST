import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

const configuredDatabaseUrl = process.env.DATABASE_URL
const databaseUrl = configuredDatabaseUrl && !/localhost|127\.0\.0\.1/.test(configuredDatabaseUrl)
  ? configuredDatabaseUrl
  : process.env.POSTGRES_URL ?? process.env.POSTGRES_PRISMA_URL ?? process.env.DATABASE_URL_UNPOOLED

if (!databaseUrl) {
  throw new Error('A Neon PostgreSQL connection string is required.')
}

export const pool = new Pool({ connectionString: databaseUrl })
export const db = drizzle(pool, { schema })
