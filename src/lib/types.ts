export type ApplicantType = 'Individual Consultant' | 'Registered Organization' | 'Both'

export type SupplierType =
  | 'Trainer / Facilitator'
  | 'Consultant'
  | 'Researcher / Evaluator'
  | 'Service Provider'
  | 'Qualified Supplier'
  | 'Catering Company'
  | 'Other'

export type TaxStatus = 'Yes' | 'In Progress' | 'No'

export type YearsBand = 'Over 10 years' | '7–10 years' | '4–6 years' | '1–3 years' | 'Less than 1 year'

export type SkillSource = 'CV' | 'Form' | 'Staff'

export interface SkillEvidence {
  id: string
  src: SkillSource
  ev: string
}

export interface Engagement {
  act: string
  date: string
  rating: number
  fb: string
  again: boolean
}

export interface Docs {
  reg: boolean
  cv: boolean
  tax: boolean
  prof: boolean
}

export interface DocStoragePaths {
  reg: string | null
  cv: string | null
  tax: string | null
  prof: string | null
}

/** As literally stated on the CV — never AI-generated, only extracted. */
export interface WorkHistoryEntry {
  role: string
  employer: string
  start: string
  end: string
}

/** A literal URL pulled from the CV text by plain regex, plus the surrounding text for context. `relevant` is a mechanical keyword-overlap check against the supplier's own stated categories — never an AI opinion. */
export interface CvLink {
  url: string
  context: string
  relevant: boolean
}

export interface Supplier {
  id: string
  name: string
  applicant: ApplicantType
  org: string
  /** Raw "Contact Person" from the application — kept standalone (not just folded into `org`) so attachment filenames can be matched against it. */
  contactPerson: string
  type: SupplierType
  years: YearsBand
  cats: string[]
  specs: string[]
  title: string
  phone: string
  email: string
  regions: string[]
  registered: boolean
  tax: TaxStatus
  bank: boolean
  docs: Docs
  docPaths: DocStoragePaths
  updated: string
  howHeard: string
  skills: SkillEvidence[]
  eng: Engagement[]
  notes: string
  cvYearsEstimate: number | null
  cvEducation: string[]
  cvCertifications: string[]
  cvWorkHistory: WorkHistoryEntry[]
  cvProcessedAt: string | null
  cvLinks: CvLink[]
}

export type UploadStatus = 'PUBLISHED' | 'REJECTED' | 'SUPERSEDED'
export type UploadSource = 'CSV' | 'EXCEL' | 'SHEET'

export interface UploadSummary {
  added: number
  changed: number
  unchanged: number
  warnings: number
}

export interface UploadVersion {
  id: string
  status: UploadStatus
  source: UploadSource
  rows: number
  uploadedAt: string
  uploadedBy: string
  summary: UploadSummary
  warningMessages: string[]
  patches: { appId: string; patch: Partial<Supplier> }[]
}

export interface ScoreResult {
  skill: number
  exp: number
  expSelfReported: number
  expFromCv: number | null
  cvSubstancePct: number | null
  docs: number
  comp: number
  taxPts: number
  regPts: number
  bankPts: number
  bonus: number
  bReg: number
  bVer: number
  bRat: number
  bLinks: number
  avg: number | null
  raw: number
  total: number
  why: string
  matched: string | null
  kind: '' | 'tag' | 'experience' | 'cat' | 'title'
  docCount: number
  indiv: boolean
  hide: boolean
}
