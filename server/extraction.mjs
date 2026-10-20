// Core CV-extraction logic — ported from supabase/functions/_shared/extraction.ts
// (same logic verbatim, TS type annotations stripped since this runs as plain Node JS).
import { SKILL_IDS, SKILL_VOCAB } from './skills-vocab.mjs'

const EMPTY_RESULT = { skills: [], education: [], certifications: [], work_history: [] }

const SYSTEM_PROMPT = `You extract structured facts from a CV/resume. Follow these rules strictly:
- Extract ONLY information explicitly present in the document text. Never infer, guess, estimate, or add anything not literally stated.
- For each skill you select from the provided list, you MUST include a short verbatim quote (copied exactly, character-for-character, max ~200 characters) from the document that supports it. If you cannot find exact supporting text for a skill, do not include it.
- For education, certifications and work history, copy entries as literally stated in the document (job titles, employers, institution names, dates) without rewording, summarizing, or embellishing.
- If the document contains no relevant information for a field, return an empty array for it.
- Do not write any explanatory prose. Only return the structured fields.`

const RESPONSE_SCHEMA = {
  name: 'cv_extraction',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      skills: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            skill_id: { type: 'string', enum: SKILL_IDS },
            evidence: { type: 'string' },
          },
          required: ['skill_id', 'evidence'],
        },
      },
      education: { type: 'array', items: { type: 'string' } },
      certifications: { type: 'array', items: { type: 'string' } },
      work_history: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            role: { type: 'string' },
            employer: { type: 'string' },
            start: { type: 'string' },
            end: { type: 'string' },
          },
          required: ['role', 'employer', 'start', 'end'],
        },
      },
    },
    required: ['skills', 'education', 'certifications', 'work_history'],
  },
}

function skillVocabLine() {
  return SKILL_VOCAB.map((s) => `${s.id} = ${s.name}`).join('\n')
}

async function callOpenAI(apiKey, body) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText)
    throw new Error(`OpenAI request failed (${res.status}): ${errText}`)
  }
  return res.json()
}

function parseExtractionResponse(data) {
  const content = data.choices?.[0]?.message?.content
  if (!content) return EMPTY_RESULT
  try {
    const parsed = JSON.parse(content)
    return {
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
      education: Array.isArray(parsed.education) ? parsed.education : [],
      certifications: Array.isArray(parsed.certifications) ? parsed.certifications : [],
      work_history: Array.isArray(parsed.work_history) ? parsed.work_history : [],
    }
  } catch {
    return EMPTY_RESULT
  }
}

/** Extracts structured facts from plain CV text (text-based PDF, docx). */
export async function extractFromText(text, apiKey, model = 'gpt-4o-mini') {
  const data = await callOpenAI(apiKey, {
    model,
    messages: [
      { role: 'system', content: `${SYSTEM_PROMPT}\n\nValid skill_id values:\n${skillVocabLine()}` },
      { role: 'user', content: `CV text:\n\n${text.slice(0, 20000)}` },
    ],
    response_format: { type: 'json_schema', json_schema: RESPONSE_SCHEMA },
  })
  return parseExtractionResponse(data)
}

/** Extracts structured facts from a CV that's an image (scanned photo/screenshot, not a text-layer PDF). */
export async function extractFromImage(base64DataUrl, apiKey, model = 'gpt-4o-mini') {
  const data = await callOpenAI(apiKey, {
    model,
    messages: [
      { role: 'system', content: `${SYSTEM_PROMPT}\n\nValid skill_id values:\n${skillVocabLine()}` },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract structured facts from this CV image.' },
          { type: 'image_url', image_url: { url: base64DataUrl } },
        ],
      },
    ],
    response_format: { type: 'json_schema', json_schema: RESPONSE_SCHEMA },
  })
  return parseExtractionResponse(data)
}

function normalize(s) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** True if most of `needle`'s alphanumeric tokens appear, in the source text — a lenient
 *  "this wasn't invented out of thin air" check, not an exact-substring requirement,
 *  since OCR/extraction whitespace can differ slightly from the model's copy. */
function looksGroundedIn(needle, haystackNormalized) {
  const n = normalize(needle)
  if (!n) return false
  if (haystackNormalized.includes(n)) return true
  const tokens = n.split(' ').filter((t) => t.length >= 3)
  if (tokens.length === 0) return haystackNormalized.includes(n)
  const found = tokens.filter((t) => haystackNormalized.includes(t)).length
  return found / tokens.length >= 0.6
}

/**
 * Drops any skill/education/certification/work-history entry that isn't
 * actually grounded in the source text — the guard against the model
 * inventing content, per the "no AI-generated content" requirement.
 */
export function validateExtraction(raw, sourceText) {
  const haystack = normalize(sourceText)
  const warnings = []

  const seenSkillIds = new Set()
  const skills = raw.skills.filter((s) => {
    const ok = SKILL_IDS.includes(s.skill_id) && looksGroundedIn(s.evidence, haystack)
    if (!ok) {
      warnings.push(`Dropped skill claim "${s.skill_id}" — evidence quote not found in the document.`)
      return false
    }
    if (seenSkillIds.has(s.skill_id)) return false
    seenSkillIds.add(s.skill_id)
    return true
  })

  const education = raw.education.filter((e) => {
    const ok = looksGroundedIn(e, haystack)
    if (!ok) warnings.push(`Dropped an education entry not found in the document text.`)
    return ok
  })

  const certifications = raw.certifications.filter((c) => {
    const ok = looksGroundedIn(c, haystack)
    if (!ok) warnings.push(`Dropped a certification entry not found in the document text.`)
    return ok
  })

  const work_history = raw.work_history.filter((w) => {
    const ok = looksGroundedIn(w.role, haystack) && looksGroundedIn(w.employer, haystack)
    if (!ok) warnings.push(`Dropped a work history entry ("${w.role || '?'}" at "${w.employer || '?'}") not found in the document text.`)
    return ok
  })

  return { result: { skills, education, certifications, work_history }, warnings }
}

function parseYear(dateStr, fallbackToNow) {
  const s = (dateStr || '').trim().toLowerCase()
  if (!s) return null
  if (fallbackToNow && /present|current|now|date/.test(s)) return new Date().getFullYear()
  const match = s.match(/(19|20)\d{2}/)
  return match ? parseInt(match[0], 10) : null
}

/**
 * Best-effort estimate from listed work-history date ranges, clamped to a sane range. Overlapping
 * or concurrent roles (e.g. several job titles at the same employer in the same years) are merged
 * before summing, so someone with 3 concurrent titles over 16 years reads as 16 years of
 * experience, not 48. Shown to staff as a cross-check against the self-reported experience band,
 * and also blended into the "Experience" score component (see expFromCv in scoring.ts).
 */
export function computeYearsFromWorkHistory(entries) {
  const ranges = []
  for (const e of entries) {
    const start = parseYear(e.start, false)
    const end = parseYear(e.end, true)
    if (start === null || end === null || end < start) continue
    ranges.push([start, end])
  }
  if (!ranges.length) return null

  ranges.sort((a, b) => a[0] - b[0])
  let total = 0
  let [curStart, curEnd] = ranges[0]
  for (const [start, end] of ranges.slice(1)) {
    if (start <= curEnd) {
      curEnd = Math.max(curEnd, end)
    } else {
      total += curEnd - curStart
      ;[curStart, curEnd] = [start, end]
    }
  }
  total += curEnd - curStart

  return Math.max(0, Math.min(60, total))
}

const URL_REGEX = /https?:\/\/[^\s)>\]"']+/g

/**
 * Pulls literal URLs out of CV text (LinkedIn, portfolio, past-work samples)
 * via plain regex — no AI involved, purely mechanical. `relevant` is a
 * bonus-worthy flag: does the text immediately around the link mention any
 * of the supplier's own stated categories/specializations? Also mechanical
 * (token overlap against their own real, submitted answers), not an AI
 * opinion about the link's quality.
 */
export function extractLinks(text, cats, specs) {
  const haystackTerms = [...cats, ...specs]
    .flatMap((c) => c.split(/[,&]/))
    .map((t) => t.trim())
    .filter((t) => t.length >= 4)

  const seen = new Set()
  const links = []
  for (const m of text.matchAll(URL_REGEX)) {
    const url = m[0].replace(/[.,;:]+$/, '')
    if (seen.has(url) || links.length >= 10) continue
    seen.add(url)
    const start = Math.max(0, (m.index ?? 0) - 150)
    const end = Math.min(text.length, (m.index ?? 0) + url.length + 150)
    const context = text.slice(start, end).replace(/\s+/g, ' ').trim()
    const contextNorm = normalize(context)
    const relevant = haystackTerms.some((term) => looksGroundedIn(term, contextNorm))
    links.push({ url, context, relevant })
  }
  return links
}

/** Embeds real supplier content (tags/evidence/categories) — never AI-generated text — for semantic search. */
export async function embedText(text, apiKey, model = 'text-embedding-3-small') {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: text.slice(0, 8000) }),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText)
    throw new Error(`OpenAI embeddings request failed (${res.status}): ${errText}`)
  }
  const data = await res.json()
  return data.data[0].embedding
}
