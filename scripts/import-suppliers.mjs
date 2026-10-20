// One-off bulk import: reads the cleaned Master Index CSV (exported from the
// real "AFOSI Supplier Directory (Searchable).xlsx") and seeds Supabase.
//
// SERVER-SIDE ONLY — uses the service role key, which bypasses Row Level
// Security. Never run this in a browser context.
//
// Usage:
//   1. Run `supabase/schema.sql` in the Supabase SQL Editor first.
//   2. node scripts/export-master-index.mjs   (or re-export the CSV manually)
//   3. node scripts/import-suppliers.mjs

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { parseCsvToObjects } from '../src/lib/csv.ts'
import { mapCsvRows, buildNewSupplier } from '../src/lib/importSuppliers.ts'

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

function docFields(patch) {
  if (!patch.docs) return {}
  return { doc_reg: patch.docs.reg, doc_cv: patch.docs.cv, doc_tax: patch.docs.tax, doc_prof: patch.docs.prof }
}

function toRow(supplier) {
  return {
    id: supplier.id,
    name: supplier.name,
    applicant: supplier.applicant,
    org: supplier.org,
    type: supplier.type,
    years: supplier.years,
    cats: supplier.cats,
    specs: supplier.specs,
    title: supplier.title,
    phone: supplier.phone,
    email: supplier.email,
    regions: supplier.regions,
    registered: supplier.registered,
    tax: supplier.tax,
    bank: supplier.bank,
    ...docFields(supplier),
    verified: false,
    notes: '',
    submitted_at: supplier.updated ?? '',
  }
}

async function main() {
  const csvPath = process.argv[2] ?? path.join(__dirname, 'master-index.csv')
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}`)
    process.exit(1)
  }

  const env = loadEnv()
  if (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
    process.exit(1)
  }

  const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  const text = fs.readFileSync(csvPath, 'utf8')
  const objects = parseCsvToObjects(text)
  const { rows, warnings, skipped } = mapCsvRows(objects)

  console.log(`Parsed ${objects.length} rows → ${rows.length} mapped, ${skipped} skipped, ${warnings.length} warnings.`)
  if (warnings.length) {
    console.log('\nWarnings:')
    for (const w of warnings) console.log(`  - ${w}`)
  }

  const supplierRows = rows.map(({ appId, patch }) => toRow(buildNewSupplier(appId, patch)))

  console.log(`\nUpserting ${supplierRows.length} suppliers…`)
  const { error } = await supabase.from('suppliers').upsert(supplierRows, { onConflict: 'id' })
  if (error) {
    console.error('Upsert failed:', error.message)
    process.exit(1)
  }

  const versionId = 'V' + Date.now()
  const { error: versionErr } = await supabase.from('upload_versions').insert({
    id: versionId,
    status: 'PUBLISHED',
    source: 'CSV',
    rows: supplierRows.length,
    uploaded_by: 'Import script',
    summary: { added: supplierRows.length, changed: 0, unchanged: 0, warnings: warnings.length },
    warning_messages: warnings,
    patches: [],
  })
  if (versionErr) console.warn('Could not record version history row:', versionErr.message)

  console.log(`\nDone. ${supplierRows.length} suppliers are live in Supabase.`)
}

main()
