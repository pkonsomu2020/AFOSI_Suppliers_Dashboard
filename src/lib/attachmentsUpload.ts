import { detectDocType, matchFilename, toNameRecords } from './matchAttachments'
import type { DocType } from './supabaseData'
import type { Supplier } from './types'

export interface PlannedUpload {
  file: File
  relativePath: string
  supplierId: string
  supplierName: string
  docType: DocType
}

export interface SkippedItem {
  relativePath: string
  reason: string
}

export interface AttachmentPlan {
  toUpload: PlannedUpload[]
  alreadyHave: SkippedItem[]
  ambiguous: SkippedItem[]
  unmatched: SkippedItem[]
  unrecognizedFolder: SkippedItem[]
}

const DOC_LABEL: Record<DocType, string> = {
  reg: 'Certificate of Registration',
  cv: 'CV / Resume',
  tax: 'Tax Compliance Certificate',
  prof: 'Professional Certificates',
}

/**
 * Plans a bulk attachment upload from a selected folder: matches each file to
 * a supplier by filename (never guesses — ambiguous/unmatched files are
 * reported, not silently attached to the wrong person), sorts by document
 * type from its subfolder name, and skips anything that supplier already has
 * on file (including a second file in the same batch for the same slot).
 */
export function planAttachmentUpload(files: File[], suppliers: Supplier[]): AttachmentPlan {
  const records = toNameRecords(suppliers)
  const byId = new Map(suppliers.map((s) => [s.id, s]))
  const claimed = new Set<string>() // `${supplierId}:${docType}` already queued in this batch

  const plan: AttachmentPlan = { toUpload: [], alreadyHave: [], ambiguous: [], unmatched: [], unrecognizedFolder: [] }

  for (const file of files) {
    const relativePath = file.webkitRelativePath || file.name
    const docType = detectDocType(relativePath)
    if (!docType) {
      plan.unrecognizedFolder.push({ relativePath, reason: "Doesn't sit under a recognized document-type folder" })
      continue
    }

    const filename = relativePath.slice(relativePath.lastIndexOf('/') + 1)
    const m = matchFilename(filename, records)
    if (!m.appId) {
      if (m.candidates.length > 0) {
        plan.ambiguous.push({ relativePath, reason: `Could match App ID ${m.candidates.join(' or ')} — pick manually on their profile` })
      } else {
        plan.unmatched.push({ relativePath, reason: "Couldn't confidently match a supplier by name" })
      }
      continue
    }

    const supplier = byId.get(m.appId)
    if (!supplier) {
      plan.unmatched.push({ relativePath, reason: `Matched App ID ${m.appId}, but that supplier isn't in the directory` })
      continue
    }

    const key = `${supplier.id}:${docType}`
    if (supplier.docPaths[docType]) {
      plan.alreadyHave.push({ relativePath, reason: `${supplier.name} already has a ${DOC_LABEL[docType]} on file` })
      continue
    }
    if (claimed.has(key)) {
      plan.alreadyHave.push({ relativePath, reason: `Another file in this folder already matched ${supplier.name}'s ${DOC_LABEL[docType]}` })
      continue
    }

    claimed.add(key)
    plan.toUpload.push({ file, relativePath, supplierId: supplier.id, supplierName: supplier.name, docType })
  }

  return plan
}
