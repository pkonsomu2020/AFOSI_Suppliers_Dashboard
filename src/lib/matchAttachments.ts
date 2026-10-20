// Matches a downloaded attachment filename (e.g. "KEVIN CV - kevin mpaka.pdf")
// to a supplier App ID by comparing the filename's name-like parts against
// that supplier's Full Name / Contact Person fields. Deliberately strict:
// returns a single App ID only when the match is unambiguous, otherwise
// returns the (possibly empty) list of candidates for manual review — never
// guesses, since silently attaching the wrong person's CV to a supplier
// record would be a real, hard-to-notice data error.
//
// Shared between the browser (bulk folder upload on Update Results) and the
// one-off Node backfill script — pure string logic, no DOM/Node-specific APIs.
import type { DocType } from './supabaseData'
import type { Supplier } from './types'

export interface SupplierNameRecord {
  appId: string
  full: string
  contact: string
}

export interface AttachmentMatch {
  file: string
  appId: string | null
  candidates: string[]
}

export function toNameRecords(suppliers: Supplier[]): SupplierNameRecord[] {
  return suppliers.map((s) => ({ appId: s.id, full: s.name, contact: s.contactPerson }))
}

const norm = (s: string) =>
  (s || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const BOILERPLATE =
  /\b(cv|curriculum vitae|resume|profile|professional|updated|new|final|latest|full|copy|work|20\d\d|hcd|center|dr|mr|mrs|ms|prof|eng|consultancy|lead|consultant)\b/g

const stripBoilerplate = (s: string) => norm(s).replace(BOILERPLATE, ' ').replace(/\s+/g, ' ').trim()

function tokenContainment(candidate: string, target: string): number {
  const c = new Set(stripBoilerplate(candidate).split(' ').filter((t) => t.length >= 2))
  const t = stripBoilerplate(target).split(' ').filter((t) => t.length >= 2)
  if (t.length === 0 || c.size === 0) return 0
  const hits = t.filter((tok) => c.has(tok)).length
  return hits / t.length
}

const THRESHOLD = 0.99

export function matchFilename(file: string, suppliers: SupplierNameRecord[]): AttachmentMatch {
  const stem = file.replace(/\.[^.]+$/, '')
  const lastDash = stem.lastIndexOf(' - ')
  const prefix = lastDash >= 0 ? stem.slice(0, lastDash) : stem
  const suffix = lastDash >= 0 ? stem.slice(lastDash + 3) : ''

  const find = (candidate: string) =>
    suppliers
      .filter((s) => {
        const scoreFull = Math.max(tokenContainment(candidate, s.full), tokenContainment(s.full, candidate))
        const scoreContact = s.contact
          ? Math.max(tokenContainment(candidate, s.contact), tokenContainment(s.contact, candidate))
          : 0
        return Math.max(scoreFull, scoreContact) >= THRESHOLD
      })
      .map((s) => s.appId)

  const ids = new Set([...find(prefix), ...(suffix ? find(suffix) : [])])

  if (ids.size === 1) return { file, appId: [...ids][0], candidates: [] }
  return { file, appId: null, candidates: [...ids] }
}

const DOC_TYPE_KEYWORDS: [DocType, string[]][] = [
  ['cv', ['cv', 'resume']],
  ['reg', ['registration', 'incorporation']],
  ['tax', ['tax']],
  ['prof', ['professional', 'certificates', 'licenses', 'license']],
]

/** Detects which of the 4 document types a file belongs to from its folder path (e.g. ".../CV - Resume of Lead Consultant .../file.pdf"). */
export function detectDocType(relativePath: string): DocType | null {
  const folder = relativePath.slice(0, relativePath.lastIndexOf('/')).toLowerCase()
  for (const [docType, keywords] of DOC_TYPE_KEYWORDS) {
    if (keywords.some((k) => folder.includes(k))) return docType
  }
  return null
}
