import pg from 'pg'

export const pool = new pg.Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'afosi_suppliers',
  user: process.env.DB_USER || 'afosi_suppliers_app',
  password: process.env.DB_PASSWORD,
})
