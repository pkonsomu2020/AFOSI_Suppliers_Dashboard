import { normalize, contains, tagMatches, STOP, SK } from './skills'
import type { ScoreResult, Supplier } from './types'

const EXP: Record<string, number> = {
  'Over 10 years': 25,
  '7–10 years': 20,
  '4–6 years': 15,
  '1–3 years': 10,
  'Less than 1 year': 5,
}

const YEARS_RANGE: Record<string, [number, number]> = {
  'Over 10 years': [10, Infinity],
  '7–10 years': [7, 10],
  '4–6 years': [4, 6],
  '1–3 years': [1, 3],
  'Less than 1 year': [0, 1],
}

/**
 * How much real, extracted substance a supplier's CV actually contains
 * (work history, education, certifications, skill tags with evidence) —
 * 0 to 1. Not analyzed yet = full credit (benefit of the doubt, most
 * suppliers haven't had a CV run through analysis yet). Purely a count of
 * already-extracted, verbatim-grounded facts — never a new AI judgment call.
 */
export function cvSubstance(s: Supplier): number {
  if (!s.cvProcessedAt) return 1
  const signals = [
    s.cvWorkHistory.length > 0,
    s.cvEducation.length > 0,
    s.cvCertifications.length > 0,
    s.skills.some((k) => k.src === 'CV'),
  ]
  return signals.filter(Boolean).length / signals.length
}

/** Maps a CV-derived years estimate onto the same point scale as the self-reported band, for a simple, like-for-like blend. */
function cvExperiencePoints(cvYearsEstimate: number | null): number | null {
  if (cvYearsEstimate === null) return null
  if (cvYearsEstimate >= 10) return 25
  if (cvYearsEstimate >= 7) return 20
  if (cvYearsEstimate >= 4) return 15
  if (cvYearsEstimate >= 1) return 10
  return 5
}

/**
 * Flags when the CV's computed work-history span clearly disagrees with the
 * self-reported experience band — for staff review only. Never changes the
 * score: the self-reported band is what the applicant attested to, and
 * `cv_years_estimate` is only a best-effort estimate from listed dates.
 */
export function yearsMismatch(years: Supplier['years'], cvYearsEstimate: number | null): boolean {
  if (cvYearsEstimate === null) return false
  const range = YEARS_RANGE[years]
  if (!range) return false
  const [min, max] = range
  return cvYearsEstimate < min - 2 || cvYearsEstimate > max + 3
}

/** A supplier is shortlist-ready when their documents, tax status and registration are all in order for their applicant type — no staff action required. */
export function isShortlisted(s: Supplier): boolean {
  const indiv = s.applicant === 'Individual Consultant'
  const docsComplete = s.docs.cv && s.docs.tax && s.docs.prof && (indiv || s.docs.reg)
  const compliant = s.tax === 'Yes' && (s.registered || indiv)
  return docsComplete && compliant
}

export function scoreSupplier(s: Supplier, qRaw: string, region: string): ScoreResult {
  const q = normalize(qRaw)
  let skill = 0
  let why = ''
  let matched: string | null = null
  let kind: ScoreResult['kind'] = ''

  if (q) {
    const hits = s.skills.filter((k) => tagMatches(k.id, q))
    const best = hits.find((k) => k.src === 'CV') || hits[0]
    if (best) {
      matched = best.id
      skill = best.src === 'CV' ? 40 : 32
      kind = 'tag'
      why = `Skill match: ${SK[best.id]?.name ?? best.id} (${best.src === 'CV' ? 'from CV' : best.src === 'Staff' ? 'staff tag' : 'from form'})`
    } else {
      const words = q.split(' ').filter((w) => w.length >= 3 && !STOP.has(w))
      // Real, grounded evidence from the CV itself — a past role/employer, or a portfolio
      // link's own surrounding text, that actually mentions what was searched. Ranks above a
      // generic specialization checkbox since it's verbatim proof of hands-on experience in
      // the field, not just one of several boxes the applicant ticked on the form.
      const workHit = s.cvWorkHistory.find(
        (w) => words.some((word) => contains(normalize(w.role), word) || contains(normalize(w.employer), word)),
      )
      const linkHit = !workHit ? s.cvLinks.find((l) => words.some((word) => contains(normalize(l.context), word))) : null
      if (workHit) {
        skill = 35
        kind = 'experience'
        why = `Work experience: ${workHit.role} — ${workHit.employer}`
      } else if (linkHit) {
        skill = 35
        kind = 'experience'
        why = `Portfolio link: "${linkHit.context}"`
      } else {
        const cat = [...s.cats, ...s.specs].find((c) => words.some((w) => contains(normalize(c), w)))
        if (cat) {
          skill = 25
          kind = 'cat'
          why = `Category match: ${cat}`
        } else if (words.some((w) => contains(normalize(s.title), w))) {
          skill = 15
          kind = 'title'
          why = `Job title: ${s.title}`
        }
      }
    }
  }

  const expSelfReported = EXP[s.years] || 0
  const expFromCv = cvExperiencePoints(s.cvYearsEstimate)
  // Simple, transparent blend — real self-reported band averaged with real CV-derived
  // work history, both mapped onto the same 25-pt scale. No AI judgment involved.
  const exp = expFromCv === null ? expSelfReported : Math.round((expSelfReported + expFromCv) / 2)

  const indiv = s.applicant === 'Individual Consultant'
  const d = s.docs
  const substance = cvSubstance(s)
  const cvSubstancePct = s.cvProcessedAt ? Math.round(substance * 100) : null
  const docs = (d.cv ? Math.round((indiv ? 10 : 7) * substance) : 0) + (d.prof ? 7 : 0) + (d.tax ? 3 : 0) + (!indiv && d.reg ? 3 : 0)
  const taxPts = s.tax === 'Yes' ? 7 : s.tax === 'In Progress' ? 3 : 0
  const regPts = s.registered || (indiv && s.tax === 'Yes') ? 5 : 0
  const bankPts = s.bank ? 3 : 0
  const comp = taxPts + regPts + bankPts

  const avg = s.eng.length ? s.eng.reduce((a, e) => a + e.rating, 0) / s.eng.length : null
  const bReg = region && (s.regions.includes(region) || s.regions.includes('National')) ? 5 : 0
  const bVer = isShortlisted(s) ? 5 : 0
  const bRat = avg !== null && avg >= 4 ? 5 : 0
  // A real link to past work (LinkedIn, portfolio, samples) found in their CV, relevant to
  // what they applied for — a mechanical keyword check against their own stated categories,
  // never an AI opinion of the link. See extractLinks() in the analyze-document function.
  const bLinks = s.cvLinks.some((l) => l.relevant) ? 5 : 0
  const bonus = bReg + bVer + bRat + bLinks

  const raw = skill + exp + docs + comp + bonus
  const docCount = [d.reg, d.cv, d.tax, d.prof].filter(Boolean).length

  return {
    skill, exp, expSelfReported, expFromCv, cvSubstancePct, docs, comp, taxPts, regPts, bankPts, bonus, bReg, bVer, bRat, bLinks, avg,
    raw, total: Math.min(100, raw), why, matched, kind, docCount, indiv,
    hide: !!q && skill === 0,
  }
}
