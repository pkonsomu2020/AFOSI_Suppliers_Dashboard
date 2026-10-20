import { CATEGORIES, REGIONS, TYPES, YEARS } from './constants.ts'
import type { ApplicantType, Supplier, SupplierType, TaxStatus, YearsBand } from './types'

export interface ImportedPatch {
  appId: string
  patch: Partial<Supplier>
}

export interface ImportResult {
  rows: ImportedPatch[]
  warnings: string[]
  skipped: number
}

const norm = (h: string) => h.trim().toLowerCase().replace(/\s+/g, ' ')

const NA_VALUES = new Set(['n/a', 'na', 'nil', 'none', '-'])
const cleanBlank = (raw: string) => (NA_VALUES.has(norm(raw)) ? '' : raw.trim())

const splitList = (raw: string) =>
  cleanBlank(raw)
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)

// Longest-first so greedy matching prefers the more specific (longer) category name when one
// is a prefix of another.
const CATEGORIES_BY_LENGTH = [...CATEGORIES].sort((a, b) => b.length - a.length)

/** Splits the raw "Category / Services Applying For" field against the known taxonomy instead of
 *  naively on every comma, since several real category names contain their own commas (e.g.
 *  "ICT Equipment, Software, and Technical Support") and would otherwise get fragmented. */
const splitCategories = (raw: string): string[] => {
  let remaining = cleanBlank(raw)
  const out: string[] = []
  while (remaining) {
    const match = CATEGORIES_BY_LENGTH.find((cat) => remaining.startsWith(cat))
    if (match) {
      out.push(match)
      remaining = remaining.slice(match.length).replace(/^[,;\s]+/, '')
    } else {
      // Unrecognized text (new/typo'd category) — fall back to a plain comma split for just
      // this leftover chunk so nothing silently disappears.
      const idx = remaining.search(/[,;]/)
      const piece = idx === -1 ? remaining : remaining.slice(0, idx)
      if (piece.trim()) out.push(piece.trim())
      remaining = idx === -1 ? '' : remaining.slice(idx + 1).replace(/^\s+/, '')
    }
  }
  return out
}

const yesNo = (raw: string) => norm(raw) === 'yes'
const uploaded = (raw: string) => norm(raw) === 'uploaded'

/** "1 to 3 years" → "1–3 years" so it matches the YEARS enum used throughout the app. */
const normalizeYears = (raw: string) => cleanBlank(raw).replace(/\s+to\s+/i, '–')

/** "Nairobi Region" → "Nairobi", "National (Kenya-wide)" → "National". */
const normalizeRegion = (raw: string) =>
  raw
    .trim()
    .replace(/\s*\(.*\)\s*$/, '')
    .replace(/\s+Region$/i, '')
    .trim()

/** Folds the many free-text "WhatsApp"/"Instagram" spellings into one canonical value each; other free text is left as submitted. */
const normalizeHowHeard = (raw: string) => {
  const clean = cleanBlank(raw)
  if (!clean) return ''
  const t = norm(clean)
  if (t.includes('whatsapp') || t.includes('watsapp')) return 'WhatsApp'
  if (t.includes('instagram')) return 'Instagram'
  return clean
}

function matchEnum<T extends string>(raw: string, options: readonly T[], fallback: T): T {
  const target = norm(raw)
  const found = options.find((o) => norm(o) === target)
  return found ?? fallback
}

function matchApplicantType(raw: string): ApplicantType {
  const t = norm(raw)
  if (t.includes('both')) return 'Both'
  if (t.includes('individual')) return 'Individual Consultant'
  return 'Registered Organization'
}

/** Column headers as they appear in "AFOSI Supplier Directory (Searchable).xlsx" → Master Index. */
export function mapCsvRow(row: Record<string, string>): { appId: string; patch: Partial<Supplier>; warnings: string[] } | null {
  const get = (name: string) => {
    const key = Object.keys(row).find((k) => norm(k) === norm(name))
    return key ? row[key] : ''
  }

  const appId = get('App ID').trim()
  const name = get('Full Name').trim()
  if (!appId || !name) return null

  const warnings: string[] = []
  const applicant = matchApplicantType(get('Applicant Type'))

  const rawType = get('Supplier Type')
  const type = matchEnum<SupplierType>(rawType, TYPES, 'Other')
  if (type === 'Other' && norm(rawType) !== 'other') warnings.push(`${appId}: unrecognized supplier type "${rawType}", set to Other`)

  const rawYears = normalizeYears(get('Years in Operation'))
  const years = matchEnum<YearsBand>(rawYears, YEARS, 'Less than 1 year')
  if (norm(rawYears) !== norm(years)) warnings.push(`${appId}: unrecognized years band "${rawYears}", defaulted`)

  const regions = splitList(get('Geographic Coverage')).map(normalizeRegion).filter(Boolean)
  const unknownRegions = regions.filter((r) => !REGIONS.some((k) => norm(k) === norm(r)))
  if (unknownRegions.length) warnings.push(`${appId}: unrecognized region(s) "${unknownRegions.join(', ')}"`)

  const contactPerson = cleanBlank(get('Contact Person'))
  // cleanBlank() already turns simple placeholders ("N/A", "Nil", "None", "-") into '' —
  // this set catches the longer phrases that slip past it.
  const orgName = cleanBlank(get('Organization'))
  const orgNorm = norm(orgName)
  const PLACEHOLDER_ORG_PHRASES = new Set(['not applicable', 'not application', 'individual', 'individual consultant', 'self employed'])
  // Some individual consultants still list a real business/brand name (e.g. "EngageXpress")
  // even though the form field is only meant to be filled by organization applicants — that's
  // genuinely useful context and shouldn't be thrown away just because of applicant type. Only
  // placeholder text or a literal repeat of the applicant's own name means there's no real
  // organization to show.
  const org = !orgName || PLACEHOLDER_ORG_PHRASES.has(orgNorm) || orgNorm === norm(name) ? '' : orgName

  const taxRaw = get('Tax Compliance Status')
  const tax = matchEnum<TaxStatus>(taxRaw, ['Yes', 'In Progress', 'No'], 'No')

  const patch: Partial<Supplier> = {
    name,
    applicant,
    org,
    contactPerson,
    type,
    years,
    cats: splitCategories(get('Category / Services Applying For')),
    specs: splitList(get('Specialization')),
    title: cleanBlank(get('Job Title')),
    phone: cleanBlank(get('Phone')),
    email: cleanBlank(get('Email')),
    regions,
    registered: yesNo(get('Legally Registered')),
    tax,
    bank: yesNo(get('Has Bank Account')),
    docs: {
      reg: uploaded(get('Cert of Registration')),
      cv: uploaded(get('CV / Resume')),
      tax: uploaded(get('Tax Compliance Cert')),
      prof: uploaded(get('Professional Certs')),
    },
    updated: get('Submitted').trim() || undefined,
    howHeard: normalizeHowHeard(get('How Heard')),
  }

  return { appId, patch, warnings }
}

export function mapCsvRows(rows: Record<string, string>[]): ImportResult {
  const result: ImportedPatch[] = []
  const warnings: string[] = []
  let skipped = 0

  for (const row of rows) {
    const mapped = mapCsvRow(row)
    if (!mapped) {
      skipped++
      continue
    }
    result.push({ appId: mapped.appId, patch: mapped.patch })
    warnings.push(...mapped.warnings)
  }

  return { rows: result, warnings, skipped }
}

export const MAPPED_FIELDS: (keyof Supplier)[] = [
  'name', 'applicant', 'org', 'contactPerson', 'type', 'years', 'cats', 'specs', 'title',
  'phone', 'email', 'regions', 'registered', 'tax', 'bank', 'docs', 'howHeard',
]

function fieldsEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.join('|') === b.join('|')
  if (typeof a === 'object' && a && typeof b === 'object' && b) return JSON.stringify(a) === JSON.stringify(b)
  return a === b
}

export function hasSupplierChanges(existing: Supplier, patch: Partial<Supplier>): boolean {
  return MAPPED_FIELDS.some((f) => f in patch && !fieldsEqual(existing[f], patch[f]))
}

export function buildNewSupplier(appId: string, patch: Partial<Supplier>): Supplier {
  return {
    id: appId,
    name: patch.name ?? appId,
    applicant: patch.applicant ?? 'Individual Consultant',
    org: patch.org ?? '',
    contactPerson: patch.contactPerson ?? '',
    type: patch.type ?? 'Other',
    years: patch.years ?? 'Less than 1 year',
    cats: patch.cats ?? [],
    specs: patch.specs ?? [],
    title: patch.title ?? '',
    phone: patch.phone ?? '',
    email: patch.email ?? '',
    regions: patch.regions ?? [],
    registered: patch.registered ?? false,
    tax: patch.tax ?? 'No',
    bank: patch.bank ?? false,
    docs: patch.docs ?? { reg: false, cv: false, tax: false, prof: false },
    docPaths: { reg: null, cv: null, tax: null, prof: null },
    updated: patch.updated ?? '',
    howHeard: patch.howHeard ?? '',
    skills: [],
    eng: [],
    notes: '',
    cvYearsEstimate: null,
    cvEducation: [],
    cvCertifications: [],
    cvWorkHistory: [],
    cvProcessedAt: null,
    cvLinks: [],
  }
}
