// One-off: creates the AFOSI staff login in Supabase Auth.
// SERVER-SIDE ONLY — uses the service role key. Safe to re-run (updates the
// password if the user already exists instead of erroring).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

function loadEnv() {
  const text = fs.readFileSync(path.join(root, '.env'), 'utf8')
  const env = {}
  for (const line of text.split('\n')) {
    if (!line.includes('=') || line.trim().startsWith('#')) continue
    const i = line.indexOf('=')
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return env
}

async function main() {
  const env = loadEnv()
  const EMAIL = env.ADMIN_EMAIL
  const PASSWORD = env.ADMIN_PASSWORD
  if (!EMAIL || !PASSWORD) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD in .env (gitignored) before running this — never hardcode real credentials in a tracked script.')
    process.exit(1)
  }
  const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  const { data: list, error: listErr } = await supabase.auth.admin.listUsers()
  if (listErr) throw listErr
  const existing = list.users.find((u) => u.email === EMAIL)

  if (existing) {
    const { error } = await supabase.auth.admin.updateUserById(existing.id, { password: PASSWORD, email_confirm: true })
    if (error) throw error
    console.log(`Updated password for existing user ${EMAIL} (${existing.id}).`)
  } else {
    const { data, error } = await supabase.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true })
    if (error) throw error
    console.log(`Created user ${EMAIL} (${data.user.id}).`)
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
