// One-off, no-cost backfill: for suppliers already analyzed before cv_links
// existed, re-reads their already-uploaded CV from Storage and runs the
// (free, regex-only) link extraction — no OpenAI calls, so safe to re-run.
//
// Usage: node scripts/backfill-cv-links.mjs [--commit]

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import pdfParse from 'pdf-parse/lib/pdf-parse.js'
import mammoth from 'mammoth'
import { extractLinks } from '../supabase/functions/_shared/extraction.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const BUCKET = 'supplier-documents'

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

function extOf(p) {
  const m = p.toLowerCase().match(/\.([a-z0-9]+)$/)
  return m ? m[1] : ''
}

async function extractText(bytes, ext) {
  if (ext === 'pdf') return (await pdfParse(Buffer.from(bytes))).text || ''
  if (ext === 'docx') return (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value || ''
  return '' // images: no local text, skip link extraction
}

async function main() {
  const commit = process.argv.includes('--commit')
  const env = loadEnv()
  const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  const { data: suppliers, error } = await supabase
    .from('suppliers')
    .select('id, cats, specs, cv_storage_path, cv_links')
    .not('cv_processed_at', 'is', null)
  if (error) throw error

  const toProcess = suppliers.filter((s) => s.cv_storage_path && (!s.cv_links || s.cv_links.length === 0))
  console.log(`${suppliers.length} already-analyzed suppliers, ${toProcess.length} without cv_links yet.`)

  if (!commit) {
    console.log('Dry run — re-run with --commit to actually write cv_links.')
    return
  }

  let updated = 0
  let totalLinks = 0
  let totalRelevant = 0
  for (const s of toProcess) {
    try {
      const { data: fileBlob, error: dlErr } = await supabase.storage.from(BUCKET).download(s.cv_storage_path)
      if (dlErr || !fileBlob) {
        console.log(`  ${s.id}: could not download CV — ${dlErr?.message ?? 'unknown'}`)
        continue
      }
      const bytes = await fileBlob.arrayBuffer()
      const ext = extOf(s.cv_storage_path)
      const text = await extractText(bytes, ext)
      const links = extractLinks(text, s.cats ?? [], s.specs ?? [])
      if (links.length === 0) continue

      const { error: updErr } = await supabase.from('suppliers').update({ cv_links: links }).eq('id', s.id)
      if (updErr) {
        console.log(`  ${s.id}: failed to save — ${updErr.message}`)
        continue
      }
      const relevant = links.filter((l) => l.relevant).length
      console.log(`  ${s.id}: ${links.length} links found (${relevant} relevant)`)
      updated++
      totalLinks += links.length
      totalRelevant += relevant
    } catch (err) {
      console.log(`  ${s.id}: FAILED — ${err.message}`)
    }
  }

  console.log(`\nDone. ${updated} suppliers updated, ${totalLinks} links found total (${totalRelevant} relevant).`)
}

main()
