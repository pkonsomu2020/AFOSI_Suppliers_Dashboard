// One-off, cost-free backfill: recomputes cv_years_estimate for every already-analyzed supplier
// from their already-stored cv_work_history, using the corrected (overlap-merging) formula in
// computeYearsFromWorkHistory(). No OpenAI calls — the raw work history is already in Supabase.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { computeYearsFromWorkHistory } from '../supabase/functions/_shared/extraction.ts'

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
  const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  const { data: suppliers, error } = await sb
    .from('suppliers')
    .select('id, name, cv_work_history, cv_years_estimate')
    .not('cv_processed_at', 'is', null)
  if (error) throw error

  let changed = 0
  for (const s of suppliers) {
    const newEstimate = computeYearsFromWorkHistory(s.cv_work_history || [])
    if (newEstimate !== s.cv_years_estimate) {
      const { error: updErr } = await sb.from('suppliers').update({ cv_years_estimate: newEstimate }).eq('id', s.id)
      if (updErr) {
        console.error(`FAILED id=${s.id} (${s.name}): ${updErr.message}`)
        continue
      }
      console.log(`${s.id} ${s.name}: ${s.cv_years_estimate} -> ${newEstimate}`)
      changed++
    }
  }
  console.log(`\nDone. ${changed} of ${suppliers.length} analyzed suppliers changed.`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
