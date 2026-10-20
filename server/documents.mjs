import express from 'express'
import multer from 'multer'
import fs from 'node:fs'
import path from 'node:path'
import { pool } from './db.mjs'
import { requireAuth } from './auth.mjs'

const STORAGE_ROOT = process.env.DOCUMENTS_DIR || path.resolve(process.cwd(), 'storage')
const ALLOWED_EXT = new Set(['pdf', 'docx', 'doc', 'pptx', 'jpg', 'jpeg', 'png'])
const DOC_STORAGE_COLUMN = { reg: 'reg_storage_path', cv: 'cv_storage_path', tax: 'tax_storage_path', prof: 'prof_storage_path' }
const DOC_FLAG_COLUMN = { reg: 'doc_reg', cv: 'doc_cv', tax: 'doc_tax', prof: 'doc_prof' }

function extOf(fileName) {
  const m = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)
  return m ? m[1] : ''
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })

export function documentsRouter() {
  const router = express.Router()
  router.use(requireAuth)

  router.post('/:supplierId/:docType', upload.single('file'), async (req, res) => {
    const { supplierId, docType } = req.params
    const storageCol = DOC_STORAGE_COLUMN[docType]
    const flagCol = DOC_FLAG_COLUMN[docType]
    if (!storageCol) return res.status(400).json({ error: 'Unknown document type.' })
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' })

    const ext = extOf(req.file.originalname)
    if (!ALLOWED_EXT.has(ext)) {
      return res.status(400).json({ error: `Unsupported file type ".${ext || '?'}". Use PDF, DOCX, PPTX, JPG or PNG.` })
    }

    const relPath = `${supplierId}/${docType}.${ext}`
    const absDir = path.join(STORAGE_ROOT, supplierId)
    const absPath = path.join(STORAGE_ROOT, relPath)

    try {
      fs.mkdirSync(absDir, { recursive: true })
      fs.writeFileSync(absPath, req.file.buffer)
      await pool.query(
        `update suppliers set ${storageCol} = $1, ${flagCol} = true, updated_at = now() where id = $2`,
        [relPath, supplierId],
      )
      res.json({ path: relPath })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: err instanceof Error ? err.message : 'Upload failed.' })
    }
  })

  router.get('/:supplierId/:docType', async (req, res) => {
    const { supplierId, docType } = req.params
    const storageCol = DOC_STORAGE_COLUMN[docType]
    if (!storageCol) return res.status(400).json({ error: 'Unknown document type.' })
    try {
      const { rows } = await pool.query(`select ${storageCol} as path from suppliers where id = $1`, [supplierId])
      const relPath = rows[0]?.path
      if (!relPath) return res.status(404).json({ error: 'No document on file.' })
      const absPath = path.join(STORAGE_ROOT, relPath)
      if (!fs.existsSync(absPath)) return res.status(404).json({ error: 'Document file missing on server.' })
      res.sendFile(absPath)
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Could not retrieve document.' })
    }
  })

  return router
}

export { STORAGE_ROOT }
