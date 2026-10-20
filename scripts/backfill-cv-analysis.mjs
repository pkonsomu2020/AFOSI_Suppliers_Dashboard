// One-off backfill: matches the real CV files in
// "AFOSI SUPPLIER PREQUALIFICATIONS_APPLICATIONS/APPLICATION ATTACHMENTS/"
// to supplier App IDs, uploads confident matches to Supabase Storage, and
// runs the same CV-extraction logic the analyze-document Edge Function uses
// (structured facts only, validated against the source text — no
// AI-generated content).
//
// SERVER-SIDE ONLY — uses the service role key + OpenAI key directly. Never
// run this in a browser context.
//
// Usage:
//   1. Run the current supabase/schema.sql (adds pgvector, storage bucket,
//      cv_* columns) in the Supabase SQL Editor first.
//   2. node scripts/backfill-cv-analysis.mjs            (dry run — matches only, no writes, no OpenAI calls)
//   3. node scripts/backfill-cv-analysis.mjs --commit    (uploads + analyzes every confident match)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { readSheet } from 'read-excel-file/node'
// Import the internal module directly, not the package root — pdf-parse's
// top-level index.js has a "debug mode" check (`!module.parent`) that's
// always true under ESM and makes it try to read its own test fixture on
// import otherwise.
import pdfParse from 'pdf-parse/lib/pdf-parse.js'
import mammoth from 'mammoth'
import { matchFilename } from '../src/lib/matchAttachments.ts'
import {
  computeYearsFromWorkHistory,
  embedText,
  extractFromImage,
  extractFromText,
  extractLinks,
  validateExtraction,
} from '../supabase/functions/_shared/extraction.ts'
import { SKILL_VOCAB } from '../supabase/functions/_shared/skills.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const ATTACHMENTS_DIR = path.join(
  root,
  'AFOSI SUPPLIER PREQUALIFICATIONS_APPLICATIONS',
  'APPLICATION ATTACHMENTS',
  'CV - Resume of Lead Consultant or Key Contact Person (File responses)',
)
const MASTER_INDEX_XLSX = path.join(
  root,
  'AFOSI SUPPLIER PREQUALIFICATIONS_APPLICATIONS',
  'AFOSI Supplier Directory (Searchable).xlsx',
)
const MODEL = 'gpt-4o-mini'
const BUCKET = 'supplier-documents'
const MIN_TEXT_LENGTH = 150

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

function extOf(file) {
  const m = file.toLowerCase().match(/\.([a-z0-9]+)$/)
  return m ? m[1] : ''
}

async function extractText(bytes, ext) {
  if (ext === 'pdf') {
    const parsed = await pdfParse(Buffer.from(bytes))
    return { text: parsed.text || '', imageDataUrl: null, unsupported: false }
  }
  if (ext === 'docx') {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) })
    return { text: result.value || '', imageDataUrl: null, unsupported: false }
  }
  if (ext === 'jpg' || ext === 'jpeg' || ext === 'png') {
    const mime = ext === 'png' ? 'image/png' : 'image/jpeg'
    return { text: '', imageDataUrl: `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`, unsupported: false }
  }
  return { text: '', imageDataUrl: null, unsupported: true }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  const commit = process.argv.includes('--commit')

  const env = loadEnv()
  if (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.OPENAI_API_KEY) {
    console.error('Missing VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or OPENAI_API_KEY in .env')
    process.exit(1)
  }
  const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  console.log('Reading Master Index for supplier names…')
  const rows = await readSheet(MASTER_INDEX_XLSX, 'Master Index')
  const header = rows[0]
  const iAppId = header.indexOf('App ID')
  const iFull = header.indexOf('Full Name')
  const iContact = header.indexOf('Contact Person')
  const suppliers = rows
    .slice(1)
    .filter((r) => r[iAppId] != null)
    .map((r) => ({ appId: String(r[iAppId]), full: String(r[iFull] ?? ''), contact: String(r[iContact] ?? '') }))

  console.log(`Scanning ${ATTACHMENTS_DIR}…`)
  const files = fs.readdirSync(ATTACHMENTS_DIR)

  const confident = []
  const ambiguous = []
  const unmatched = []
  for (const file of files) {
    const m = matchFilename(file, suppliers)
    if (m.appId) confident.push(m)
    else if (m.candidates.length > 0) ambiguous.push(m)
    else unmatched.push(m)
  }

  console.log(`\nTotal files: ${files.length}`)
  console.log(`Confident matches: ${confident.length}`)
  console.log(`Ambiguous (needs manual review): ${ambiguous.length}`)
  console.log(`No match (needs manual review): ${unmatched.length}`)
  if (ambiguous.length) {
    console.log('\n--- AMBIGUOUS — pick the right App ID by hand ---')
    for (const a of ambiguous) console.log(`  ${a.file}  =>  candidates: ${a.candidates.join(', ')}`)
  }
  if (unmatched.length) {
    console.log('\n--- NO MATCH — attach manually via the dashboard ---')
    for (const u of unmatched) console.log(`  ${u.file}`)
  }

  if (!commit) {
    console.log('\nDry run only — no files uploaded, no OpenAI calls made. Re-run with --commit to process the confident matches above.')
    return
  }

  const force = process.argv.includes('--force')
  const onlyArg = process.argv.find((a) => a.startsWith('--only='))
  const onlyIds = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',')) : null

  let toProcess = confident
  if (onlyIds) {
    toProcess = confident.filter((m) => onlyIds.has(m.appId))
  } else if (!force) {
    const { data: already } = await supabase.from('suppliers').select('id').not('cv_processed_at', 'is', null)
    const doneIds = new Set((already ?? []).map((r) => r.id))
    const skippedCount = confident.filter((m) => doneIds.has(m.appId)).length
    toProcess = confident.filter((m) => !doneIds.has(m.appId))
    if (skippedCount) console.log(`\nSkipping ${skippedCount} already-analyzed suppliers (re-run with --force to redo them).`)
  }

  console.log(`\nProcessing ${toProcess.length} confident matches…`)
  let ok = 0
  let failed = 0
  const allWarnings = []

  /** Retries a supabase-js call (which returns {data, error} rather than throwing) on transient network errors. */
  async function withRetry(fn, attempts = 3) {
    let lastResult
    for (let i = 0; i < attempts; i++) {
      lastResult = await fn()
      if (!lastResult.error) return lastResult
      if (i < attempts - 1) await sleep(1500 * (i + 1))
    }
    return lastResult
  }

  for (const m of toProcess) {
    try {
      const ext = extOf(m.file)
      const bytes = fs.readFileSync(path.join(ATTACHMENTS_DIR, m.file))
      const storagePath = `${m.appId}/cv.${ext}`

      const { error: upErr } = await withRetry(() => supabase.storage.from(BUCKET).upload(storagePath, bytes, { upsert: true }))
      if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`)

      await supabase.from('suppliers').update({ cv_storage_path: storagePath, doc_cv: true }).eq('id', m.appId)

      const { text, imageDataUrl, unsupported } = await extractText(bytes, ext)
      if (unsupported) {
        console.log(`  ${m.appId} (${m.file}): unsupported file type ".${ext}" — uploaded, but not analyzed.`)
        continue
      }
      if (!imageDataUrl && text.trim().length < MIN_TEXT_LENGTH) {
        console.log(`  ${m.appId} (${m.file}): scanned/no text layer — uploaded, but not analyzed.`)
        continue
      }

      const raw = imageDataUrl
        ? await extractFromImage(imageDataUrl, env.OPENAI_API_KEY, MODEL)
        : await extractFromText(text, env.OPENAI_API_KEY, MODEL)

      const { result, warnings } = imageDataUrl
        ? { result: raw, warnings: [] }
        : validateExtraction(raw, text)
      allWarnings.push(...warnings.map((w) => `${m.appId}: ${w}`))

      const cvYearsEstimate = computeYearsFromWorkHistory(result.work_history)
      const { data: supplierRow } = await supabase.from('suppliers').select('cats, specs').eq('id', m.appId).single()
      const links = imageDataUrl ? [] : extractLinks(text, supplierRow?.cats ?? [], supplierRow?.specs ?? [])

      const { error: delErr } = await supabase.from('supplier_skills').delete().eq('supplier_id', m.appId).eq('source', 'CV')
      if (delErr) throw new Error(`Could not clear old CV skill tags: ${delErr.message}`)
      if (result.skills.length > 0) {
        const { error: skillErr } = await supabase.from('supplier_skills').insert(
          result.skills.map((s) => ({
            supplier_id: m.appId,
            skill_id: s.skill_id,
            source: 'CV',
            evidence: s.evidence.slice(0, 500),
            added_by: `AI extraction (${MODEL})`,
          })),
        )
        if (skillErr) throw new Error(`Could not save skill tags: ${skillErr.message}`)
      }

      await supabase
        .from('suppliers')
        .update({
          cv_education: result.education,
          cv_certifications: result.certifications,
          cv_work_history: result.work_history,
          cv_years_estimate: cvYearsEstimate,
          cv_processed_at: new Date().toISOString(),
          cv_model: MODEL,
          cv_links: links,
        })
        .eq('id', m.appId)

      const skillNames = result.skills.map((s) => SKILL_VOCAB.find((v) => v.id === s.skill_id)?.name ?? s.skill_id)
      const embeddingInput = [
        ...skillNames,
        ...result.skills.map((s) => s.evidence),
        ...(supplierRow?.cats ?? []),
        ...(supplierRow?.specs ?? []),
        ...result.education,
        ...result.certifications,
      ]
        .filter(Boolean)
        .join('. ')

      if (embeddingInput.trim()) {
        const embedding = await embedText(embeddingInput, env.OPENAI_API_KEY)
        await supabase.from('suppliers').update({ embedding, embedding_updated_at: new Date().toISOString() }).eq('id', m.appId)
      }

      const relevantLinks = links.filter((l) => l.relevant).length
      console.log(`  ${m.appId} (${m.file}): ${result.skills.length} skills, ${result.education.length} education, ${result.certifications.length} certs, ~${cvYearsEstimate ?? '?'} yrs, ${links.length} links (${relevantLinks} relevant)`)
      ok++
      await sleep(250)
    } catch (err) {
      console.error(`  ${m.appId} (${m.file}): FAILED — ${err.message}`)
      failed++
    }
  }

  console.log(`\nDone. ${ok} analyzed, ${failed} failed.`)
  if (allWarnings.length) {
    console.log(`\n${allWarnings.length} extraction warnings (dropped ungrounded claims):`)
    for (const w of allWarnings) console.log(`  - ${w}`)
  }
}

main()
