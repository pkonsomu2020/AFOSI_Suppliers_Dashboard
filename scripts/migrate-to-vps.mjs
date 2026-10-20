// One-off migration: copies all suppliers/skills/supplier_skills/engagements/upload_versions
// rows from Supabase into the new self-hosted Postgres, and copies every document file from
// Supabase Storage onto local disk. Run once, on the VPS (needs both Supabase internet access
// and local Postgres access). Safe to re-run — upserts rows, skips files already on disk.
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DOCUMENTS_DIR = process.env.DOCUMENTS_DIR || './storage'
const BUCKET = 'supplier-documents'

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment before running this.')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
const pool = new pg.Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'afosi_suppliers',
  user: process.env.DB_USER || 'afosi_suppliers_app',
  password: process.env.DB_PASSWORD,
})

// Supabase's JS client returns a pgvector column as a string already formatted like
// "[0.1,0.2,...]", not a parsed array — wrapping it in another `[...]` produces invalid
// double-bracketed input ("[[0.1,...]]") that Postgres' vector type rejects outright.
function toVectorLiteral(embedding) {
  if (!embedding) return null
  if (typeof embedding === 'string') return embedding
  return `[${embedding.join(',')}]`
}

async function migrateSuppliers() {
  const { data, error } = await sb.from('suppliers').select('*')
  if (error) throw error
  console.log(`suppliers: ${data.length} rows from Supabase`)

  let failed = 0
  for (const r of data) {
    try {
    await pool.query(
      `insert into suppliers (
        id, name, applicant, org, contact_person, type, years, cats, specs, title, phone, email, regions,
        registered, tax, bank, doc_reg, doc_cv, doc_tax, doc_prof,
        reg_storage_path, cv_storage_path, tax_storage_path, prof_storage_path,
        notes, submitted_at, how_heard,
        cv_years_estimate, cv_education, cv_certifications, cv_work_history, cv_processed_at, cv_model, cv_links,
        embedding, embedding_updated_at, created_at, updated_at
      ) values (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,
        $28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38
      )
      on conflict (id) do update set
        name=excluded.name, applicant=excluded.applicant, org=excluded.org, contact_person=excluded.contact_person,
        type=excluded.type, years=excluded.years, cats=excluded.cats, specs=excluded.specs, title=excluded.title,
        phone=excluded.phone, email=excluded.email, regions=excluded.regions, registered=excluded.registered,
        tax=excluded.tax, bank=excluded.bank, doc_reg=excluded.doc_reg, doc_cv=excluded.doc_cv,
        doc_tax=excluded.doc_tax, doc_prof=excluded.doc_prof, reg_storage_path=excluded.reg_storage_path,
        cv_storage_path=excluded.cv_storage_path, tax_storage_path=excluded.tax_storage_path,
        prof_storage_path=excluded.prof_storage_path, notes=excluded.notes, submitted_at=excluded.submitted_at,
        how_heard=excluded.how_heard, cv_years_estimate=excluded.cv_years_estimate,
        cv_education=excluded.cv_education, cv_certifications=excluded.cv_certifications,
        cv_work_history=excluded.cv_work_history, cv_processed_at=excluded.cv_processed_at,
        cv_model=excluded.cv_model, cv_links=excluded.cv_links, embedding=excluded.embedding,
        embedding_updated_at=excluded.embedding_updated_at, updated_at=excluded.updated_at`,
      [
        r.id, r.name, r.applicant, r.org, r.contact_person ?? '', r.type, r.years, r.cats ?? [], r.specs ?? [],
        r.title ?? '', r.phone ?? '', r.email ?? '', r.regions ?? [], r.registered, r.tax, r.bank,
        r.doc_reg, r.doc_cv, r.doc_tax, r.doc_prof, r.reg_storage_path, r.cv_storage_path, r.tax_storage_path,
        r.prof_storage_path, r.notes ?? '', r.submitted_at ?? '', r.how_heard ?? '',
        r.cv_years_estimate, JSON.stringify(r.cv_education ?? []), JSON.stringify(r.cv_certifications ?? []),
        JSON.stringify(r.cv_work_history ?? []), r.cv_processed_at, r.cv_model,
        JSON.stringify(r.cv_links ?? []), toVectorLiteral(r.embedding), r.embedding_updated_at,
        r.created_at, r.updated_at,
      ],
    )
    } catch (err) {
      console.error(`  FAILED supplier ${r.id} (${r.name}): ${err.message}`)
      failed++
    }
  }
  console.log(`suppliers: migrated (${failed} failed)`)
}

async function migrateSupplierSkills() {
  const { data, error } = await sb.from('supplier_skills').select('*')
  if (error) throw error
  console.log(`supplier_skills: ${data.length} rows from Supabase`)
  for (const r of data) {
    await pool.query(
      `insert into supplier_skills (supplier_id, skill_id, source, evidence, added_by, added_at)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (supplier_id, skill_id, source) do update set evidence = excluded.evidence`,
      [r.supplier_id, r.skill_id, r.source, r.evidence ?? '', r.added_by, r.added_at],
    )
  }
  console.log(`supplier_skills: migrated`)
}

async function migrateEngagements() {
  const { data, error } = await sb.from('engagements').select('*')
  if (error) throw error
  console.log(`engagements: ${data.length} rows from Supabase`)
  for (const r of data) {
    await pool.query(
      `insert into engagements (id, supplier_id, program, activity, activity_date, rating, feedback, would_reengage, created_by, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       on conflict (id) do nothing`,
      [r.id, r.supplier_id, r.program, r.activity, r.activity_date, r.rating, r.feedback ?? '', r.would_reengage, r.created_by, r.created_at],
    )
  }
  console.log(`engagements: migrated`)
}

async function migrateUploadVersions() {
  const { data, error } = await sb.from('upload_versions').select('*')
  if (error) throw error
  console.log(`upload_versions: ${data.length} rows from Supabase`)
  for (const r of data) {
    await pool.query(
      `insert into upload_versions (id, status, source, rows, uploaded_at, uploaded_by, summary, warning_messages, patches)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (id) do nothing`,
      [r.id, r.status, r.source, r.rows, r.uploaded_at, r.uploaded_by, JSON.stringify(r.summary ?? {}), JSON.stringify(r.warning_messages ?? []), JSON.stringify(r.patches ?? [])],
    )
  }
  console.log(`upload_versions: migrated`)
}

async function migrateFiles() {
  const { data: suppliers, error } = await sb.from('suppliers').select('id, reg_storage_path, cv_storage_path, tax_storage_path, prof_storage_path')
  if (error) throw error

  let copied = 0, skipped = 0, failed = 0
  for (const s of suppliers) {
    const paths = [s.reg_storage_path, s.cv_storage_path, s.tax_storage_path, s.prof_storage_path].filter(Boolean)
    for (const relPath of paths) {
      const absPath = path.join(DOCUMENTS_DIR, relPath)
      if (fs.existsSync(absPath)) { skipped++; continue }
      const { data: blob, error: dlErr } = await sb.storage.from(BUCKET).download(relPath)
      if (dlErr || !blob) { console.error(`  FAILED ${relPath}: ${dlErr?.message}`); failed++; continue }
      fs.mkdirSync(path.dirname(absPath), { recursive: true })
      fs.writeFileSync(absPath, Buffer.from(await blob.arrayBuffer()))
      copied++
    }
  }
  console.log(`files: ${copied} copied, ${skipped} already present, ${failed} failed`)
}

async function verify() {
  const [{ count: sbSuppliers }, { count: sbSkills }, { count: sbEng }, { count: sbUploads }] = await Promise.all([
    sb.from('suppliers').select('*', { count: 'exact', head: true }).then((r) => ({ count: r.count })),
    sb.from('supplier_skills').select('*', { count: 'exact', head: true }).then((r) => ({ count: r.count })),
    sb.from('engagements').select('*', { count: 'exact', head: true }).then((r) => ({ count: r.count })),
    sb.from('upload_versions').select('*', { count: 'exact', head: true }).then((r) => ({ count: r.count })),
  ])
  const pgSuppliers = (await pool.query('select count(*) from suppliers')).rows[0].count
  const pgSkills = (await pool.query('select count(*) from supplier_skills')).rows[0].count
  const pgEng = (await pool.query('select count(*) from engagements')).rows[0].count
  const pgUploads = (await pool.query('select count(*) from upload_versions')).rows[0].count

  console.log('\n=== Verification ===')
  console.log(`suppliers:       Supabase=${sbSuppliers}  Postgres=${pgSuppliers}  ${sbSuppliers == pgSuppliers ? 'OK' : 'MISMATCH'}`)
  console.log(`supplier_skills: Supabase=${sbSkills}  Postgres=${pgSkills}  ${sbSkills == pgSkills ? 'OK' : 'MISMATCH'}`)
  console.log(`engagements:     Supabase=${sbEng}  Postgres=${pgEng}  ${sbEng == pgEng ? 'OK' : 'MISMATCH'}`)
  console.log(`upload_versions: Supabase=${sbUploads}  Postgres=${pgUploads}  ${sbUploads == pgUploads ? 'OK' : 'MISMATCH'}`)
}

async function main() {
  await migrateSuppliers()
  await migrateSupplierSkills()
  await migrateEngagements()
  await migrateUploadVersions()
  await migrateFiles()
  await verify()
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
