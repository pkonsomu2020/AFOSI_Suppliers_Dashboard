import { apiGet, apiPatch, apiPost } from './apiClient'
import type { Supplier, UploadSource, UploadSummary, UploadVersion } from './types'

export type DocType = 'reg' | 'cv' | 'tax' | 'prof'

export async function fetchSuppliers(): Promise<Supplier[]> {
  return apiGet('/suppliers')
}

export async function setSupplierNotes(id: string, notes: string) {
  await apiPatch(`/suppliers/${id}/notes`, { notes })
}

/** Records a just-uploaded document's storage path and flips its "on file" flag. */
export async function setSupplierDocument(id: string, docType: DocType, storagePath: string) {
  await apiPatch(`/suppliers/${id}/documents/${docType}`, { storagePath })
}

/** Upserts every patch (new or changed suppliers only — caller has already diffed) and records a version row. */
export async function publishImport(
  patches: { appId: string; patch: Partial<Supplier> }[],
  source: UploadSource,
  uploadedBy: string,
  summary: UploadSummary,
  warnings: string[],
): Promise<UploadVersion> {
  return apiPost('/suppliers/import', { patches, source, uploadedBy, summary, warnings })
}

export async function fetchVersions(): Promise<UploadVersion[]> {
  return apiGet('/suppliers/versions')
}
