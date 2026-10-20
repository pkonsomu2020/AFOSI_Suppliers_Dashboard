// Analyzes one supplier's uploaded CV: extracts real skills/education/
// certifications/work-history (verbatim, validated against the source text —
// see _shared/extraction.ts), stores them, and (re)computes the supplier's
// semantic-search embedding from that same real content.
//
// Deploy: supabase functions deploy analyze-document
// Secrets: supabase secrets set OPENAI_API_KEY=sk-...
import { createClient } from 'npm:@supabase/supabase-js@2'
import { Buffer } from 'node:buffer'
// Imports the internal module directly, not the package root — pdf-parse's
// top-level index.js has a "debug mode" check (`!module.parent`) that's
// always true outside a CJS `require` context and makes it try to read its
// own test fixture on import otherwise.
import pdfParse from 'npm:pdf-parse@1.1.1/lib/pdf-parse.js'
import mammoth from 'npm:mammoth@1.7.2'
import { CORS_HEADERS, jsonResponse } from '../_shared/cors.ts'
import {
  computeYearsFromWorkHistory,
  embedText,
  extractFromImage,
  extractFromText,
  extractLinks,
  validateExtraction,
} from '../_shared/extraction.ts'
import { SKILL_VOCAB } from '../_shared/skills.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!
const MODEL = Deno.env.get('OPENAI_EXTRACTION_MODEL') || 'gpt-4o-mini'

const BUCKET = 'supplier-documents'
const MIN_TEXT_LENGTH = 150

function extOf(path: string): string {
  const m = path.toLowerCase().match(/\.([a-z0-9]+)$/)
  return m ? m[1] : ''
}

async function extractText(bytes: ArrayBuffer, ext: string): Promise<{ text: string; imageDataUrl: string | null; unsupported: boolean }> {
  if (ext === 'pdf') {
    const buf = Buffer.from(bytes)
    const parsed = await pdfParse(buf)
    return { text: parsed.text || '', imageDataUrl: null, unsupported: false }
  }
  if (ext === 'docx') {
    const buf = Buffer.from(bytes)
    const result = await mammoth.extractRawText({ buffer: buf })
    return { text: result.value || '', imageDataUrl: null, unsupported: false }
  }
  if (ext === 'jpg' || ext === 'jpeg' || ext === 'png') {
    const mime = ext === 'png' ? 'image/png' : 'image/jpeg'
    const b64 = Buffer.from(bytes).toString('base64')
    return { text: '', imageDataUrl: `data:${mime};base64,${b64}`, unsupported: false }
  }
  return { text: '', imageDataUrl: null, unsupported: true }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  try {
    const authHeader = req.headers.get('Authorization') || ''
    const authedClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
    const { data: userData, error: userErr } = await authedClient.auth.getUser()
    if (userErr || !userData?.user) return jsonResponse({ error: 'Not authenticated.' }, 401)

    const { supplierId } = await req.json()
    if (!supplierId || typeof supplierId !== 'string') return jsonResponse({ error: 'supplierId is required.' }, 400)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const { data: supplier, error: fetchErr } = await admin
      .from('suppliers')
      .select('id, cv_storage_path, cats, specs')
      .eq('id', supplierId)
      .single()
    if (fetchErr || !supplier) return jsonResponse({ error: 'Supplier not found.' }, 404)
    if (!supplier.cv_storage_path) return jsonResponse({ error: 'No CV uploaded for this supplier yet.' }, 400)

    const { data: fileBlob, error: dlErr } = await admin.storage.from(BUCKET).download(supplier.cv_storage_path)
    if (dlErr || !fileBlob) return jsonResponse({ error: `Could not download the CV file: ${dlErr?.message ?? 'unknown error'}` }, 500)

    const bytes = await fileBlob.arrayBuffer()
    const ext = extOf(supplier.cv_storage_path)
    const { text, imageDataUrl, unsupported } = await extractText(bytes, ext)

    if (unsupported) {
      return jsonResponse({ error: `Unsupported file type ".${ext}" — supported: PDF, DOCX, JPG, PNG.` }, 400)
    }
    if (!imageDataUrl && text.trim().length < MIN_TEXT_LENGTH) {
      return jsonResponse({
        error: 'This PDF appears to be a scanned image with no extractable text layer — automatic analysis isn\'t available for it. Consider re-uploading a text-based version.',
      }, 422)
    }

    const raw = imageDataUrl
      ? await extractFromImage(imageDataUrl, OPENAI_API_KEY, MODEL)
      : await extractFromText(text, OPENAI_API_KEY, MODEL)

    const sourceTextForValidation = imageDataUrl ? JSON.stringify(raw) : text // images have no local text to validate against
    const { result, warnings } = imageDataUrl
      ? { result: raw, warnings: ['Image-based CV: extraction wasn\'t cross-checked against source text (no text layer to validate against) — review the results.'] }
      : validateExtraction(raw, sourceTextForValidation)

    const cvYearsEstimate = computeYearsFromWorkHistory(result.work_history)
    const links = imageDataUrl ? [] : extractLinks(text, supplier.cats ?? [], supplier.specs ?? [])

    // Replace this supplier's previous CV-sourced skill tags with the fresh set.
    const { error: delErr } = await admin.from('supplier_skills').delete().eq('supplier_id', supplierId).eq('source', 'CV')
    if (delErr) return jsonResponse({ error: `Could not clear old CV skill tags: ${delErr.message}` }, 500)
    if (result.skills.length > 0) {
      const rows = result.skills.map((s) => ({
        supplier_id: supplierId,
        skill_id: s.skill_id,
        source: 'CV',
        evidence: s.evidence.slice(0, 500),
        added_by: `AI extraction (${MODEL})`,
      }))
      const { error: skillErr } = await admin.from('supplier_skills').insert(rows)
      if (skillErr) return jsonResponse({ error: `Could not save skill tags: ${skillErr.message}` }, 500)
    }

    await admin
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
      .eq('id', supplierId)

    // Re-embed from real content only: skill tag names + verbatim evidence + categories/specs.
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
      await admin
        .from('suppliers')
        .update({ embedding, embedding_updated_at: new Date().toISOString() })
        .eq('id', supplierId)
    }

    return jsonResponse({
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
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unexpected error.' }, 500)
  }
})
