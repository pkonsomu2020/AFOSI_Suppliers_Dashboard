import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import pdfParse from 'pdf-parse/lib/pdf-parse.js'
import mammoth from 'mammoth'
import { pool } from './db.mjs'
import { requireAuth } from './auth.mjs'
import { STORAGE_ROOT } from './documents.mjs'
import {
  computeYearsFromWorkHistory,
  embedText,
  extractFromImage,
  extractFromText,
  extractLinks,
  validateExtraction,
} from './extraction.mjs'
import { SKILL_VOCAB } from './skills-vocab.mjs'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const MODEL = process.env.OPENAI_EXTRACTION_MODEL || 'gpt-4o-mini'
const MIN_TEXT_LENGTH = 150

function extOf(p) {
  const m = p.toLowerCase().match(/\.([a-z0-9]+)$/)
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
    const b64 = Buffer.from(bytes).toString('base64')
    return { text: '', imageDataUrl: `data:${mime};base64,${b64}`, unsupported: false }
  }
  return { text: '', imageDataUrl: null, unsupported: true }
}

export function aiRouter() {
  const router = express.Router()
  router.use(requireAuth)

  router.post('/analyze-document', async (req, res) => {
    const { supplierId } = req.body || {}
    if (!supplierId || typeof supplierId !== 'string') return res.status(400).json({ error: 'supplierId is required.' })

    try {
      const { rows } = await pool.query('select id, cv_storage_path, cats, specs from suppliers where id = $1', [supplierId])
      const supplier = rows[0]
      if (!supplier) return res.status(404).json({ error: 'Supplier not found.' })
      if (!supplier.cv_storage_path) return res.status(400).json({ error: 'No CV uploaded for this supplier yet.' })

      const absPath = path.join(STORAGE_ROOT, supplier.cv_storage_path)
      if (!fs.existsSync(absPath)) return res.status(500).json({ error: 'Could not find the CV file on disk.' })
      const bytes = fs.readFileSync(absPath)
      const ext = extOf(supplier.cv_storage_path)
      const { text, imageDataUrl, unsupported } = await extractText(bytes, ext)

      if (unsupported) {
        return res.status(400).json({ error: `Unsupported file type ".${ext}" — supported: PDF, DOCX, JPG, PNG.` })
      }
      if (!imageDataUrl && text.trim().length < MIN_TEXT_LENGTH) {
        return res.status(422).json({
          error: "This PDF appears to be a scanned image with no extractable text layer — automatic analysis isn't available for it. Consider re-uploading a text-based version.",
        })
      }

      const raw = imageDataUrl
        ? await extractFromImage(imageDataUrl, OPENAI_API_KEY, MODEL)
        : await extractFromText(text, OPENAI_API_KEY, MODEL)

      const sourceTextForValidation = imageDataUrl ? JSON.stringify(raw) : text
      const { result, warnings } = imageDataUrl
        ? { result: raw, warnings: ["Image-based CV: extraction wasn't cross-checked against source text (no text layer to validate against) — review the results."] }
        : validateExtraction(raw, sourceTextForValidation)

      const cvYearsEstimate = computeYearsFromWorkHistory(result.work_history)
      const links = imageDataUrl ? [] : extractLinks(text, supplier.cats ?? [], supplier.specs ?? [])

      await pool.query(`delete from supplier_skills where supplier_id = $1 and source = 'CV'`, [supplierId])
      for (const s of result.skills) {
        await pool.query(
          `insert into supplier_skills (supplier_id, skill_id, source, evidence, added_by)
           values ($1, $2, 'CV', $3, $4)
           on conflict (supplier_id, skill_id, source) do update set evidence = excluded.evidence`,
          [supplierId, s.skill_id, s.evidence.slice(0, 500), `AI extraction (${MODEL})`],
        )
      }

      await pool.query(
        `update suppliers set cv_education = $1, cv_certifications = $2, cv_work_history = $3, cv_years_estimate = $4,
         cv_processed_at = now(), cv_model = $5, cv_links = $6, updated_at = now() where id = $7`,
        [
          JSON.stringify(result.education),
          JSON.stringify(result.certifications),
          JSON.stringify(result.work_history),
          cvYearsEstimate,
          MODEL,
          JSON.stringify(links),
          supplierId,
        ],
      )

      const skillNames = result.skills.map((s) => SKILL_VOCAB.find((v) => v.id === s.skill_id)?.name ?? s.skill_id)
      const embeddingInput = [
        ...skillNames,
        ...result.skills.map((s) => s.evidence),
        ...(supplier.cats ?? []),
        ...(supplier.specs ?? []),
        ...result.education,
        ...result.certifications,
      ]
        .filter(Boolean)
        .join('. ')

      if (embeddingInput.trim()) {
        const embedding = await embedText(embeddingInput, OPENAI_API_KEY)
        await pool.query('update suppliers set embedding = $1, embedding_updated_at = now() where id = $2', [
          `[${embedding.join(',')}]`,
          supplierId,
        ])
      }

      res.json({
        ok: true,
        skillsFound: result.skills.length,
        educationFound: result.education.length,
        certificationsFound: result.certifications.length,
        workHistoryFound: result.work_history.length,
        cvYearsEstimate,
        linksFound: links.length,
        relevantLinksFound: links.filter((l) => l.relevant).length,
        warnings,
      })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unexpected error.' })
    }
  })

  router.post('/search-embed', async (req, res) => {
    const { query } = req.body || {}
    if (!query || typeof query !== 'string' || !query.trim()) return res.json({ scores: [] })
    try {
      const embedding = await embedText(query, OPENAI_API_KEY)
      const { rows } = await pool.query('select * from match_suppliers($1, 200)', [`[${embedding.join(',')}]`])
      res.json({ scores: rows })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unexpected error.' })
    }
  })

  return router
}
