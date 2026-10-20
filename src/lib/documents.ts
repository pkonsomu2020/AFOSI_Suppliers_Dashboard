import { apiUpload, ApiError } from './apiClient'
import type { DocType } from './supabaseData'

const ALLOWED_EXT = new Set(['pdf', 'docx', 'doc', 'pptx', 'jpg', 'jpeg', 'png'])

function extOf(fileName: string): string {
  const m = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)
  return m ? m[1] : ''
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Uploads a document file for a supplier and records its path (the backend does both in one request).
 *  Throws a readable error on failure. Retries a few times on transient network failures — a browser
 *  tab holding many large files in a bulk upload batch can hit occasional connection drops that a plain
 *  retry clears up. */
export async function uploadSupplierDocument(supplierId: string, docType: DocType, file: File, attempts = 3): Promise<string> {
  const ext = extOf(file.name)
  if (!ALLOWED_EXT.has(ext)) {
    throw new Error(`Unsupported file type ".${ext || '?'}". Use PDF, DOCX, PPTX, JPG or PNG.`)
  }

  let lastError = 'Unknown upload error'
  for (let i = 0; i < attempts; i++) {
    try {
      const { path } = await apiUpload(`/documents/${supplierId}/${docType}`, file)
      return path
    } catch (err) {
      // A validation error (e.g. unsupported type) won't resolve on retry — fail fast.
      if (err instanceof ApiError) throw err
      lastError = err instanceof Error ? err.message : String(err)
    }
    if (i < attempts - 1) await sleep(1500 * (i + 1))
  }
  throw new Error(lastError)
}
