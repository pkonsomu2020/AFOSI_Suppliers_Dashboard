import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAppStore } from '../store/AppStore'
import { scoreSupplier } from '../lib/scoring'
import { SK } from '../lib/skills'
import { REGIONS, TYPES, YEARS } from '../lib/constants'
import { fmtPhone } from '../lib/format'
import { semanticSearchScores } from '../lib/ai'
import { Card } from '../components/ui/Card'
import { Chip } from '../components/ui/Pill'
import { Avatar } from '../components/ui/Avatar'
import { Reveal } from '../components/ui/Reveal'
import { IconPhone, IconMail, IconSearch, IconArrowUpRight } from '../components/icons'
import type { Supplier } from '../lib/types'

const SUGGESTIONS = ['youth mental health', 'M&E', 'financial literacy']

// Below this, a semantic hit isn't confident enough to rescue a candidate
// that keyword/category/title matching found nothing for.
const SEMANTIC_RESCUE_THRESHOLD = 0.45

function ScoreBadge({ total, size = 60 }: { total: number; size?: number }) {
  const tone = total >= 80 ? 'bg-orange text-ink border-orange' : total >= 60 ? 'bg-white text-ink border-ink' : 'bg-gray-50 text-gray-500 border-gray-200'
  return (
    <div
      className={`flex shrink-0 flex-col items-center justify-center rounded-2xl border-2 ${tone}`}
      style={{ width: size, height: size }}
    >
      <span className="text-xl font-extrabold leading-none">{total}</span>
      <span className="text-[10px] font-semibold opacity-70">/100</span>
    </div>
  )
}

export default function Find() {
  const { suppliers } = useAppStore()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const [draft, setDraft] = useState(params.get('q') ?? 'youth mental health training')
  const [query, setQuery] = useState(params.get('q') ?? 'youth mental health training')
  const [types, setTypes] = useState<Supplier['type'][]>(['Trainer / Facilitator', 'Consultant'])
  const [region, setRegion] = useState('')
  const [years, setYears] = useState<Supplier['years'][]>([])

  const q = query.trim()

  // Semantic similarity per supplier for the current query — computed
  // server-side from suppliers' own real content (skills/evidence/categories),
  // never from AI-generated text. Runs automatically on every search submit;
  // fails silently (empty scores) if the Edge Function isn't reachable, so
  // keyword/category/title matching alone still works either way.
  const [simScores, setSimScores] = useState<Record<string, number>>({})
  useEffect(() => {
    let cancelled = false
    semanticSearchScores(query).then((scores) => {
      if (!cancelled) setSimScores(scores)
    })
    return () => {
      cancelled = true
    }
  }, [query])

  const results = useMemo(() => {
    return suppliers
      .map((s) => ({ s, sc: scoreSupplier(s, query, region), sim: simScores[s.id] ?? 0 }))
      .filter(
        ({ s, sc, sim }) =>
          (!sc.hide || sim >= SEMANTIC_RESCUE_THRESHOLD) &&
          types.includes(s.type) &&
          (!region || s.regions.includes(region) || s.regions.includes('National')) &&
          (!years.length || years.includes(s.years)),
      )
      // Relevance to the search term comes first (CV skill tag > form/staff tag > category > title
      // match); overall recommendation score only breaks ties among similarly relevant suppliers.
      // A highly-qualified generalist who just brushes against the query must not outrank a true
      // specialist with a lower overall score.
      .sort((a, b) => b.sc.skill - a.sc.skill || b.sc.total - a.sc.total || b.sim - a.sim || b.sc.raw - a.sc.raw)
  }, [suppliers, query, region, types, years, simScores])

  const toggleType = (t: Supplier['type']) => setTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))
  const toggleYear = (y: Supplier['years']) => setYears((cur) => (cur.includes(y) ? cur.filter((x) => x !== y) : [...cur, y]))

  return (
    <div className="flex flex-col gap-6 pb-6">
      <Reveal className="flex flex-col gap-2">
        <span className="font-mono text-xs font-medium uppercase tracking-widest text-gray-500">
          <span className="text-orange">02</span> · Find a facilitator
        </span>
        <h1 className="text-[32px] font-bold leading-[1.05] tracking-tight sm:text-[40px]">
          The right person, <span className="serif-italic text-orange">for the work.</span>
        </h1>
      </Reveal>

      <Reveal delay={80} className="flex flex-col gap-3">
        <div className="flex items-stretch overflow-hidden rounded-2xl border-2 border-ink bg-white">
          <IconSearch width={18} height={18} className="ml-5 self-center text-gray-400" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setQuery(draft)}
            placeholder="Search by skill or activity, e.g. youth mental health training, M&E, financial literacy"
            className="min-w-0 flex-1 border-none bg-transparent px-3 py-4 text-[16px] outline-none"
          />
          <button onClick={() => setQuery(draft)} className="shrink-0 bg-orange px-7 text-[15px] font-bold text-ink">
            Search
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-gray-500">Try</span>
          {SUGGESTIONS.map((s) => (
            <Chip
              key={s}
              active={s === q}
              onClick={() => {
                setDraft(s)
                setQuery(s)
              }}
            >
              {s}
            </Chip>
          ))}
        </div>
      </Reveal>

      <div className="flex flex-col items-start gap-5 lg:flex-row">
        <Reveal delay={140} className="w-full lg:w-[260px] lg:shrink-0">
        <Card className="flex w-full flex-col gap-5">
          <div className="flex items-baseline justify-between">
            <span className="text-[15px] font-bold">Filters</span>
            <button
              onClick={() => {
                setTypes(['Trainer / Facilitator', 'Consultant'])
                setRegion('')
                setYears([])
              }}
              className="text-[13px] font-bold text-orange"
            >
              Reset
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <span className="font-mono text-[11px] font-medium uppercase tracking-widest text-gray-500">Supplier type</span>
            <div className="flex flex-wrap gap-1.5">
              {TYPES.map((t) => (
                <Chip key={t} active={types.includes(t)} onClick={() => toggleType(t)}>
                  {t}
                </Chip>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-2">
            <span className="font-mono text-[11px] font-medium uppercase tracking-widest text-gray-500">Activity region</span>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[14px]"
            >
              <option value="">Any region</option>
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-2">
            <span className="font-mono text-[11px] font-medium uppercase tracking-widest text-gray-500">Experience</span>
            <div className="flex flex-wrap gap-1.5">
              {YEARS.map((y) => (
                <Chip key={y} active={years.includes(y)} onClick={() => toggleYear(y)}>
                  {y}
                </Chip>
              ))}
            </div>
          </div>
        </Card>
        </Reveal>

        <div className="flex min-w-0 flex-1 flex-col gap-3.5">
          <Reveal delay={180} className="flex flex-col gap-0.5">
            <span className="text-[17px] font-bold">{q ? `${results.length} match${results.length === 1 ? '' : 'es'} for "${q}"` : `${results.length} suppliers`}</span>
            <span className="text-[13px] text-gray-500">Ranked by match relevance, then recommendation score{region ? ` · +5 for covering ${region}` : ''}</span>
          </Reveal>

          {results.map(({ s, sc, sim }, i) => {
            const tags = [...s.skills]
              .sort((a, b) => Number(b.id === sc.matched) - Number(a.id === sc.matched))
              .slice(0, 3)
            const semanticOnly = sc.hide && sim >= SEMANTIC_RESCUE_THRESHOLD
            const profileHref = `/profile/${s.id}?${new URLSearchParams({ q: query, region }).toString()}`
            return (
              <Reveal key={s.id} delay={Math.min(i, 6) * 70} y={22}>
              <Card>
                <div className="flex gap-4">
                  <Avatar name={s.name} size={48} />
                  <div className="flex min-w-0 flex-1 flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <button onClick={() => navigate(profileHref)} className="text-left text-[17px] font-bold hover:text-orange">
                          {s.name}
                        </button>
                        <span className="text-[13px] text-gray-500">
                          {[s.org || (s.applicant === 'Individual Consultant' ? 'Individual consultant' : ''), s.type].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                      <ScoreBadge total={sc.total} />
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {semanticOnly && (
                        <span className="rounded-lg bg-ink px-2.5 py-1 text-[12px] font-semibold text-white" title="No exact skill/category/title match. Included because their profile is semantically close to this search">
                          Semantic match
                        </span>
                      )}
                      {tags.map((t) => (
                        <span
                          key={t.id}
                          className={`rounded-lg px-2.5 py-1 text-[12px] ${
                            t.id === sc.matched ? 'bg-orange-soft font-semibold text-ink' : 'bg-gray-50 text-gray-600'
                          }`}
                        >
                          {SK[t.id]?.name ?? t.id}
                        </span>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <a
                        href={`tel:${s.phone}`}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-ink px-3.5 py-2 text-[13px] font-bold"
                      >
                        <IconPhone width={13} height={13} /> {fmtPhone(s.phone)}
                      </a>
                      <a href={`mailto:${s.email}`} className="inline-flex items-center gap-1.5 rounded-xl border border-ink px-3.5 py-2 text-[13px] font-bold">
                        <IconMail width={13} height={13} /> Email
                      </a>
                      <button
                        onClick={() => navigate(profileHref)}
                        className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-orange px-3.5 py-2 text-[13px] font-bold text-ink"
                      >
                        Full profile <IconArrowUpRight width={13} height={13} />
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
              </Reveal>
            )
          })}

          {results.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-gray-200 p-10 text-center">
              <span className="text-[17px] font-bold">No matches</span>
              <span className="max-w-sm text-[14px] text-gray-500">
                No supplier has this skill, category or job title. Try a broader term or add more supplier types.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
