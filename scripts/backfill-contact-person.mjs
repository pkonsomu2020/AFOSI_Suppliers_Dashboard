// One-off: populates the new `contact_person` column for suppliers already
// imported before it existed, reading straight from the Master Index (same
// source as scripts/import-suppliers.mjs). Safe to re-run — only ever writes
// this one column.
//
// Usage: node scripts/backfill-contact-person.mjs

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { readSheet } from 'read-excel-file/node'

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

const NA_VALUES = new Set(['n/a', 'na', 'nil', 'none', '-', ''])
const cleanBlank = (raw) => (NA_VALUES.has(String(raw ?? '').trim().toLowerCase()) ? '' : String(raw ?? '').trim())

async function main() {
  const env = loadEnv()
  const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  const rows = await readSheet(
    path.join(root, 'AFOSI SUPPLIER PREQUALIFICATIONS_APPLICATIONS', 'AFOSI Supplier Directory (Searchable).xlsx'),
    'Master Index',
  )
  const header = rows[0]
  const iAppId = header.indexOf('App ID')
  const iContact = header.indexOf('Contact Person')

  let updated = 0
  for (const r of rows.slice(1)) {
    const appId = String(r[iAppId] ?? '').trim()
    const contact = cleanBlank(r[iContact])
    if (!appId || !contact) continue
    const { error } = await supabase.from('suppliers').update({ contact_person: contact }).eq('id', appId)
    if (error) {
      console.error(`  ${appId}: FAILED — ${error.message}`)
      continue
    }
    updated++
  }

  console.log(`Done. ${updated} suppliers updated with contact_person.`)
}

main()
