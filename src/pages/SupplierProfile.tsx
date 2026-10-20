import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAppStore } from '../store/AppStore'
import { isShortlisted, scoreSupplier, yearsMismatch } from '../lib/scoring'
import { SK } from '../lib/skills'
import { DOCS } from '../lib/constants'
import { fmtDate, fmtDateTime, fmtPhone } from '../lib/format'
import { uploadSupplierDocument } from '../lib/documents'
import { analyzeSupplierDocuments } from '../lib/ai'
import type { DocType } from '../lib/supabaseData'
import { Card, CardHeader } from '../components/ui/Card'
import { Avatar } from '../components/ui/Avatar'
import { DonutProgress } from '../components/ui/DonutProgress'
import { Reveal } from '../components/ui/Reveal'
import { useInView } from '../hooks/useInView'
import { IconCheck, IconChevronLeft, IconMail, IconPhone } from '../components/icons'
import type { Supplier } from '../lib/types'

const FACTOR_COLORS = ['#F26522', '#000000', '#6B6B6B', '#9E9E9E', '#BDBDBD']

export default function SupplierProfile() {
  const { id } = useParams()
  const { suppliers, selectedId, setSelectedId } = useAppStore()

  useEffect(() => {
    if (id) setSelectedId(id)
  }, [id, setSelectedId])

  const ps = suppliers.find((s) => s.id === (id ?? selectedId)) ?? suppliers[0]

  if (!ps) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-gray-200 p-10 text-center">
        <span className="text-[17px] font-bold">No suppliers yet</span>
        <span className="max-w-sm text-[14px] text-gray-500">
          The directory is empty. Publish a CSV on the Update Results page to add suppliers.
        </span>
      </div>
    )
  }

  return <ProfileView key={ps.id} ps={ps} />
}

function DocumentUploadRow({ ps, docType, label }: { ps: Supplier; docType: DocType; label: string }) {
  const { refreshSuppliers, flash } = useAppStore()
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const path = ps.docPaths[docType]

  const onPick = () => inputRef.current?.click()

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      await uploadSupplierDocument(ps.id, docType, file)
      await refreshSuppliers()
      flash(`${label} uploaded`)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Upload failed, try again')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-gray-100 py-2.5 last:border-none">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${path ? 'bg-good' : 'bg-gray-200'}`} />
        <span className="text-[14px]">{label}</span>
      </div>
      <button
        onClick={onPick}
        disabled={uploading}
        className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-bold disabled:opacity-50"
      >
        {uploading ? 'Uploading…' : path ? 'Replace' : 'Upload'}
      </button>
      <input ref={inputRef} type="file" accept=".pdf,.docx,.doc,.pptx,.jpg,.jpeg,.png" className="hidden" onChange={onFile} />
    </div>
  )
}

function DocumentsAndAnalysisCard({ ps }: { ps: Supplier }) {
  const { refreshSuppliers, flash } = useAppStore()
  const [analyzing, setAnalyzing] = useState(false)

  const onAnalyze = async () => {
    setAnalyzing(true)
    try {
      const result = await analyzeSupplierDocuments(ps.id)
      await refreshSuppliers()
      flash(`Analyzed CV: ${result.skillsFound} skills, ${result.educationFound} education, ${result.certificationsFound} certifications found`)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not analyze this CV, try again')
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <Card className="flex flex-col gap-1">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <span className="text-[17px] font-bold">Documents</span>
        <button
          onClick={onAnalyze}
          disabled={analyzing || !ps.docPaths.cv}
          title={!ps.docPaths.cv ? 'Upload a CV first' : undefined}
          className="shrink-0 rounded-xl bg-orange px-3.5 py-2 text-[13px] font-bold text-ink disabled:opacity-40"
        >
          {analyzing ? 'Analyzing…' : 'Analyze CV'}
        </button>
      </div>
      {DOCS.map(([key, label]) => (
        <DocumentUploadRow key={key} ps={ps} docType={key} label={label} />
      ))}
      {ps.cvProcessedAt && (
        <span className="pt-2 text-[12px] text-gray-500">Last analyzed {fmtDateTime(ps.cvProcessedAt)}</span>
      )}
    </Card>
  )
}

function BackgroundCard({ ps }: { ps: Supplier }) {
  if (!ps.cvProcessedAt) return null
  const mismatch = yearsMismatch(ps.years, ps.cvYearsEstimate)

  return (
    <Card className="flex flex-col gap-4">
      <CardHeader title="Background" />

      {mismatch && (
        <div className="rounded-xl border border-orange px-3.5 py-2.5 text-[13px]">
          CV work history suggests {ps.cvYearsEstimate} yrs experience, which doesn't clearly match the self-reported
          band ({ps.years}), worth a quick review.
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-[11px] font-medium uppercase tracking-widest text-gray-500">Work history</span>
        {ps.cvWorkHistory.length > 0 ? (
          <div className="flex flex-col divide-y divide-gray-100">
            {ps.cvWorkHistory.map((w, i) => (
              <div key={i} className="py-2 text-[14px]">
                <span className="font-semibold">{w.role}</span>
                {w.employer && <span className="text-gray-500"> · {w.employer}</span>}
                {(w.start || w.end) && <span className="text-gray-400"> · {w.start}–{w.end}</span>}
              </div>
            ))}
          </div>
        ) : (
          <span className="text-[13px] text-gray-500">None listed</span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-[11px] font-medium uppercase tracking-widest text-gray-500">Education</span>
        {ps.cvEducation.length > 0 ? (
          <ul className="list-inside list-disc text-[14px]">
            {ps.cvEducation.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        ) : (
          <span className="text-[13px] text-gray-500">None listed</span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-[11px] font-medium uppercase tracking-widest text-gray-500">Certifications</span>
        {ps.cvCertifications.length > 0 ? (
          <ul className="list-inside list-disc text-[14px]">
            {ps.cvCertifications.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        ) : (
          <span className="text-[13px] text-gray-500">None listed</span>
        )}
      </div>

      {ps.cvLinks.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[11px] font-medium uppercase tracking-widest text-gray-500">Links to past work</span>
          <div className="flex flex-col gap-2">
            {ps.cvLinks.map((l, i) => (
              <div key={i} className="flex flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <a href={l.url} target="_blank" rel="noreferrer" className="break-all text-[13px] font-semibold text-orange">
                    {l.url}
                  </a>
                  {l.relevant && (
                    <span className="rounded-md bg-orange-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink">Relevant</span>
                  )}
                </div>
                <span className="text-[12px] leading-relaxed text-gray-500">…{l.context}…</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

function ProfileView({ ps }: { ps: Supplier }) {
  const navigate = useNavigate()
  const { setNotes } = useAppStore()
  const [searchParams] = useSearchParams()
  const q = searchParams.get('q')?.trim() ?? ''
  const region = searchParams.get('region')?.trim() ?? ''

  const pr = scoreSupplier(ps, q, region)
  const avg = pr.avg

  const [noteDraft, setNoteDraft] = useState(ps.notes)
  const { ref: scoreRef, inView: scoreInView } = useInView()

  const factors = [
    { label: 'Skill match', pts: pr.skill, max: 40, note: pr.why || (q ? 'No match for this search' : 'No search term set, go to Find to score skill match') },
    {
      label: 'Experience',
      pts: pr.exp,
      max: 25,
      note:
        pr.expFromCv !== null
          ? `${ps.years} self-reported, averaged with CV work history (~${ps.cvYearsEstimate} yrs)`
          : ps.years,
    },
    {
      label: 'Documents',
      pts: pr.docs,
      max: 20,
      note: `${pr.indiv ? 'CV up to 10' : 'CV up to 7'} (needs real content — work history, education, certs, skills${pr.cvSubstancePct !== null ? `, currently ${pr.cvSubstancePct}%` : ''}) · Prof. certs 7 · Tax cert 3${pr.indiv ? '' : ' · Registration 3'}`,
    },
    { label: 'Compliance', pts: pr.comp, max: 15, note: `Tax ${pr.taxPts}/7 · Registered ${pr.regPts}/5 · Bank account ${pr.bankPts}/3` },
    { label: 'Bonus', pts: pr.bonus, max: 20, note: `Region ${pr.bReg}/5 · Shortlisted ${pr.bVer}/5 · Rating ${pr.bRat}/5 · Relevant work link ${pr.bLinks}/5` },
  ]

  return (
    <div className="flex flex-col gap-6 pb-6">
      <Reveal y={8}>
        <button onClick={() => navigate(-1)} className="inline-flex w-fit items-center gap-1 text-[13px] font-bold text-orange">
          <IconChevronLeft width={15} height={15} /> Back
        </button>
      </Reveal>

      <Reveal className="flex flex-wrap items-start justify-between gap-6 border-b border-gray-200 pb-6">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <Avatar name={ps.name} size={72} />
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="font-mono text-xs font-medium uppercase tracking-widest text-gray-500">
              <span className="text-orange">03</span> · {ps.id} · {ps.type}
            </span>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[30px] font-bold leading-tight tracking-tight sm:text-[36px]">{ps.name}</h1>
              {isShortlisted(ps) && (
                <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-good px-2.5 py-1 text-[12px] font-bold text-good">
                  <IconCheck width={11} height={11} /> Shortlisted
                </span>
              )}
            </div>
            <span className="text-[15px] text-gray-500">
              {[
                ps.org,
                ps.applicant === 'Individual Consultant' ? 'Individual consultant' : ps.applicant === 'Both' ? 'Individual within an organisation' : 'Registered organisation',
                ps.type,
                ps.title,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
            <div className="flex flex-wrap gap-2 pt-1.5">
              <a href={`tel:${ps.phone}`} className="inline-flex items-center gap-1.5 rounded-xl border border-ink px-4 py-2 text-[13px] font-bold">
                <IconPhone width={13} height={13} /> {fmtPhone(ps.phone)}
              </a>
              <a href={`mailto:${ps.email}`} className="inline-flex items-center gap-1.5 rounded-xl border border-ink px-4 py-2 text-[13px] font-bold">
                <IconMail width={13} height={13} /> {ps.email}
              </a>
            </div>
          </div>
        </div>
        <DonutProgress percent={pr.total} size={128} stroke={14} caption="score / 100" />
      </Reveal>

      <div className="flex flex-col items-start gap-5 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <Reveal delay={0}>
          <Card>
            <CardHeader title="Skills & evidence" />
            {ps.skills.length > 0 ? (
              <div className="flex flex-col divide-y divide-gray-100">
                {ps.skills.map((k) => (
                  <div key={k.id} className={`flex flex-col gap-1.5 py-3.5 first:pt-0 last:pb-0 ${k.id === pr.matched ? 'rounded-xl bg-orange-soft/40 px-3' : ''}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-bold">{SK[k.id]?.name ?? k.id}</span>
                      <span
                        className={`rounded-md px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide ${
                          k.src === 'CV' ? 'bg-ink text-white' : k.src === 'Staff' ? 'border border-orange bg-orange-soft' : 'bg-gray-50'
                        }`}
                      >
                        {k.src}
                      </span>
                    </div>
                    <span className="text-[13px] leading-relaxed text-gray-500">{k.ev}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-gray-200 p-5 text-[14px] leading-relaxed text-gray-500">
                {ps.cvProcessedAt
                  ? "Their CV was analyzed, but nothing in it matched our tracked skill list — that's a controlled set of " +
                    "specific terms (M&E, financial literacy, WASH, etc.), not a judgment on their actual experience. " +
                    'Search matching falls back to the categories and specialization they selected on the application, shown below.'
                  : "Their CV and certificates are on file, but nobody has read the CV and tagged specific skills from it yet. " +
                    "That's a separate manual or AI-assisted review step that hasn't been run for this applicant. Until then, " +
                    'search matching falls back to the categories and specialization they selected on the application, shown below.'}
              </div>
            )}
          </Card>
          </Reveal>

          <Reveal delay={50}>
          <Card className="flex flex-col gap-4">
            <CardHeader title="Categories & specialization" subtitle="As submitted on the application" />
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="font-mono text-[11px] font-medium uppercase tracking-widest text-gray-500">Category / services</span>
                <div className="flex flex-wrap gap-1.5">
                  {ps.cats.length > 0 ? (
                    ps.cats.map((c) => (
                      <span key={c} className="rounded-lg bg-gray-50 px-2.5 py-1 text-[12px] text-gray-700">
                        {c}
                      </span>
                    ))
                  ) : (
                    <span className="text-[13px] text-gray-500">Not provided</span>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="font-mono text-[11px] font-medium uppercase tracking-widest text-gray-500">Specialization</span>
                <div className="flex flex-wrap gap-1.5">
                  {ps.specs.length > 0 ? (
                    ps.specs.map((s) => (
                      <span key={s} className="rounded-lg bg-orange-soft px-2.5 py-1 text-[12px] font-semibold text-ink">
                        {s}
                      </span>
                    ))
                  ) : (
                    <span className="text-[13px] text-gray-500">Not provided</span>
                  )}
                </div>
              </div>
            </div>
          </Card>
          </Reveal>

          <Reveal delay={75}>
            <DocumentsAndAnalysisCard ps={ps} />
          </Reveal>

          <Reveal delay={90}>
            <BackgroundCard ps={ps} />
          </Reveal>

        </div>

        <div className="flex w-full flex-col gap-5 lg:w-[340px] lg:shrink-0">
          <Reveal delay={0}>
          <Card ref={scoreRef} className="flex flex-col gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-[17px] font-bold">Score breakdown</span>
              <span className="text-[13px] text-gray-500">
                {q ? (
                  <>
                    Scored for "{q}"{region ? ` in ${region}` : ''}, matches what you saw on Find.
                  </>
                ) : (
                  'No search term set. This is the baseline score with no skill match applied.'
                )}
              </span>
            </div>
            <div className="flex h-3.5 overflow-hidden rounded-full bg-gray-100">
              {factors.map((f, i) => (
                <span
                  key={f.label}
                  className="transition-[width] duration-700 ease-out"
                  style={{ width: scoreInView ? `${(f.pts / Math.max(100, pr.raw)) * 100}%` : '0%', background: FACTOR_COLORS[i], transitionDelay: `${i * 60}ms` }}
                />
              ))}
            </div>
            {factors.map((f, i) => (
              <div key={f.label} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2 text-[14px]">
                  <span className="flex items-center gap-2 font-semibold">
                    <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: FACTOR_COLORS[i] }} />
                    {f.label}
                  </span>
                  <span>
                    <strong>{f.pts}</strong> <span className="text-gray-500">/ {f.max}</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-50">
                  <div
                    className="h-full rounded-full transition-[width] duration-700 ease-out"
                    style={{ width: scoreInView ? `${(f.pts / f.max) * 100}%` : '0%', background: FACTOR_COLORS[i], transitionDelay: `${i * 60 + 120}ms` }}
                  />
                </div>
              </div>
            ))}
            <div className="flex items-baseline justify-between border-t border-gray-100 pt-3">
              <span className="font-bold">Total</span>
              <span className="text-xl font-extrabold">
                {pr.total} <span className="text-[13px] font-medium text-gray-500">{pr.raw > 100 ? `(${pr.raw} before cap)` : '/ 100'}</span>
              </span>
            </div>
          </Card>
          </Reveal>

          <Reveal delay={90}>
          <Card>
            <CardHeader title="Service feedback" subtitle="Shared with all staff, saved automatically" />
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onBlur={() => setNotes(ps.id, noteDraft)}
              rows={4}
              placeholder="How did they perform on past work? Quality, reliability, professionalism, would you re-engage them?"
              className="w-full resize-y rounded-2xl border border-gray-200 p-3.5 text-[14px] leading-relaxed"
            />
          </Card>
          </Reveal>

          <Reveal delay={100}>
          <Card className="flex flex-col gap-1 text-[14px]">
            <span className="pb-1 text-[17px] font-bold">Compliance & coverage</span>
            {[
              { k: 'Tax compliance', v: ps.tax, bad: ps.tax !== 'Yes' },
              { k: 'Legally registered', v: ps.registered ? 'Yes' : 'No' },
              { k: 'Has bank account', v: ps.bank ? 'Yes' : 'No' },
              { k: 'Regions', v: ps.regions.length ? ps.regions.join(', ') : 'Not provided' },
              { k: 'Submitted', v: ps.updated ? fmtDate(ps.updated) : 'Unknown' },
              { k: 'How they heard about AFOSI', v: ps.howHeard || 'Not provided' },
              { k: 'Avg. engagement rating', v: avg !== null ? `${avg.toFixed(1)} / 5` : 'No ratings yet' },
            ].map((row) => (
              <div key={row.k} className="flex justify-between gap-3 border-b border-gray-100 py-2.5 last:border-none">
                <span className="text-gray-500">{row.k}</span>
                <span className={`text-right font-semibold ${row.bad ? 'text-bad' : ''}`}>{row.v}</span>
              </div>
            ))}
          </Card>
          </Reveal>
        </div>
      </div>
    </div>
  )
}
