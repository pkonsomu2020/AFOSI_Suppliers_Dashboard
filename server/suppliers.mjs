import express from 'express'
import { pool } from './db.mjs'
import { requireAuth } from './auth.mjs'

const SUPPLIER_COLUMNS = `
  id, name, applicant, org, contact_person, type, years, cats, specs, title, phone, email, regions,
  registered, tax, bank, doc_reg, doc_cv, doc_tax, doc_prof,
  reg_storage_path, cv_storage_path, tax_storage_path, prof_storage_path,
  notes, submitted_at, how_heard,
  cv_years_estimate, cv_education, cv_certifications, cv_work_history, cv_processed_at, cv_links
`

function rowToSupplier(row, skillsByySupplier, engagementsBySupplier) {
  return {
    id: row.id,
    name: row.name,
    applicant: row.applicant,
    org: row.org,
    contactPerson: row.contact_person ?? '',
    type: row.type,
    years: row.years,
    cats: row.cats ?? [],
    specs: row.specs ?? [],
    title: row.title,
    phone: row.phone,
    email: row.email,
    regions: row.regions ?? [],
    registered: row.registered,
    tax: row.tax,
    bank: row.bank,
    docs: { reg: row.doc_reg, cv: row.doc_cv, tax: row.doc_tax, prof: row.doc_prof },
    docPaths: {
      reg: row.reg_storage_path ?? null,
      cv: row.cv_storage_path ?? null,
      tax: row.tax_storage_path ?? null,
      prof: row.prof_storage_path ?? null,
    },
    updated: row.submitted_at,
    howHeard: row.how_heard ?? '',
    skills: (skillsByySupplier[row.id] ?? []).map((s) => ({ id: s.skill_id, src: s.source, ev: s.evidence })),
    notes: row.notes,
    eng: (engagementsBySupplier[row.id] ?? []).map((e) => ({
      act: e.activity,
      date: e.activity_date,
      rating: e.rating,
      fb: e.feedback,
      again: e.would_reengage,
    })),
    cvYearsEstimate: row.cv_years_estimate ?? null,
    cvEducation: row.cv_education ?? [],
    cvCertifications: row.cv_certifications ?? [],
    cvWorkHistory: row.cv_work_history ?? [],
    cvProcessedAt: row.cv_processed_at ?? null,
    cvLinks: row.cv_links ?? [],
  }
}

function groupBy(rows, key) {
  const out = {}
  for (const r of rows) {
    ;(out[r[key]] ??= []).push(r)
  }
  return out
}

export function suppliersRouter() {
  const router = express.Router()
  router.use(requireAuth)

  router.get('/', async (req, res) => {
    try {
      const [suppliersRes, skillsRes, engagementsRes] = await Promise.all([
        pool.query(`select ${SUPPLIER_COLUMNS} from suppliers order by id`),
        pool.query('select supplier_id, skill_id, source, evidence from supplier_skills'),
        pool.query('select supplier_id, id, program, activity, activity_date, rating, feedback, would_reengage from engagements'),
      ])
      const skillsBySupplier = groupBy(skillsRes.rows, 'supplier_id')
      const engagementsBySupplier = groupBy(engagementsRes.rows, 'supplier_id')
      const suppliers = suppliersRes.rows.map((r) => rowToSupplier(r, skillsBySupplier, engagementsBySupplier))
      res.json(suppliers)
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Could not load suppliers.' })
    }
  })

  router.patch('/:id/notes', async (req, res) => {
    const { notes } = req.body || {}
    try {
      await pool.query('update suppliers set notes = $1, updated_at = now() where id = $2', [notes ?? '', req.params.id])
      res.json({ ok: true })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Could not save notes.' })
    }
  })

  const DOC_STORAGE_COLUMN = { reg: 'reg_storage_path', cv: 'cv_storage_path', tax: 'tax_storage_path', prof: 'prof_storage_path' }
  const DOC_FLAG_COLUMN = { reg: 'doc_reg', cv: 'doc_cv', tax: 'doc_tax', prof: 'doc_prof' }

  router.patch('/:id/documents/:docType', async (req, res) => {
    const { docType } = req.params
    const { storagePath } = req.body || {}
    const storageCol = DOC_STORAGE_COLUMN[docType]
    const flagCol = DOC_FLAG_COLUMN[docType]
    if (!storageCol) return res.status(400).json({ error: 'Unknown document type.' })
    try {
      await pool.query(
        `update suppliers set ${storageCol} = $1, ${flagCol} = true, updated_at = now() where id = $2`,
        [storagePath, req.params.id],
      )
      res.json({ ok: true })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Could not record document.' })
    }
  })

  function docFields(patch) {
    if (!patch.docs) return {}
    return { doc_reg: patch.docs.reg, doc_cv: patch.docs.cv, doc_tax: patch.docs.tax, doc_prof: patch.docs.prof }
  }

  router.post('/import', async (req, res) => {
    const { patches, source, uploadedBy, summary, warnings } = req.body || {}
    const client = await pool.connect()
    try {
      await client.query('begin')

      for (const { appId, patch } of patches ?? []) {
        const fields = {
          id: appId,
          ...(patch.name !== undefined && { name: patch.name }),
          ...(patch.applicant !== undefined && { applicant: patch.applicant }),
          ...(patch.org !== undefined && { org: patch.org }),
          ...(patch.contactPerson !== undefined && { contact_person: patch.contactPerson }),
          ...(patch.type !== undefined && { type: patch.type }),
          ...(patch.years !== undefined && { years: patch.years }),
          ...(patch.cats !== undefined && { cats: patch.cats }),
          ...(patch.specs !== undefined && { specs: patch.specs }),
          ...(patch.title !== undefined && { title: patch.title }),
          ...(patch.phone !== undefined && { phone: patch.phone }),
          ...(patch.email !== undefined && { email: patch.email }),
          ...(patch.regions !== undefined && { regions: patch.regions }),
          ...(patch.registered !== undefined && { registered: patch.registered }),
          ...(patch.tax !== undefined && { tax: patch.tax }),
          ...(patch.bank !== undefined && { bank: patch.bank }),
          ...docFields(patch),
          ...(patch.updated !== undefined && { submitted_at: patch.updated }),
          ...(patch.howHeard !== undefined && { how_heard: patch.howHeard }),
        }
        const cols = Object.keys(fields)
        const vals = Object.values(fields)
        const updateCols = cols.filter((c) => c !== 'id')
        const insertPlaceholders = cols.map((_, i) => `$${i + 1}`).join(', ')
        const updateSet = updateCols.map((c) => `${c} = excluded.${c}`).join(', ') || 'id = excluded.id'
        await client.query(
          `insert into suppliers (${cols.join(', ')}) values (${insertPlaceholders})
           on conflict (id) do update set ${updateSet}, updated_at = now()`,
          vals,
        )
      }

      const id = 'V' + Date.now()
      const hasChanges = (summary?.added ?? 0) + (summary?.changed ?? 0) > 0
      const status = hasChanges ? 'PUBLISHED' : 'REJECTED'

      if (hasChanges) {
        await client.query(`update upload_versions set status = 'SUPERSEDED' where status = 'PUBLISHED'`)
      }

      await client.query(
        `insert into upload_versions (id, status, source, rows, uploaded_by, summary, warning_messages, patches)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, status, source, (patches ?? []).length, uploadedBy, JSON.stringify(summary ?? {}), JSON.stringify(warnings ?? []), JSON.stringify(patches ?? [])],
      )

      await client.query('commit')
      res.json({
        id,
        status,
        source,
        rows: (patches ?? []).length,
        uploadedAt: new Date().toISOString(),
        uploadedBy,
        summary,
        warningMessages: warnings,
        patches,
      })
    } catch (err) {
      await client.query('rollback')
      console.error(err)
      res.status(500).json({ error: 'Could not publish import.' })
    } finally {
      client.release()
    }
  })

  router.get('/versions', async (req, res) => {
    try {
      const { rows } = await pool.query('select * from upload_versions order by uploaded_at desc')
      res.json(
        rows.map((v) => ({
          id: v.id,
          status: v.status,
          source: v.source,
          rows: v.rows,
          uploadedAt: v.uploaded_at,
          uploadedBy: v.uploaded_by,
          summary: v.summary,
          warningMessages: v.warning_messages,
          patches: v.patches,
        })),
      )
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Could not load upload history.' })
    }
  })

  return router
}
