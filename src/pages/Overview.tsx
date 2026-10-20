import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/AppStore'
import { isShortlisted } from '../lib/scoring'
import { REGIONS } from '../lib/constants'
import { StatCard } from '../components/ui/StatCard'
import { Card, CardHeader } from '../components/ui/Card'
import { CapsuleBars } from '../components/ui/CapsuleBars'
import { BarRows } from '../components/ui/BarRows'
import { DonutProgress } from '../components/ui/DonutProgress'
import { Avatar } from '../components/ui/Avatar'
import { Reveal } from '../components/ui/Reveal'
import { AnimatedBar } from '../components/ui/AnimatedBar'
import { IconCheck, IconPlus } from '../components/icons'

const DOC_TIER_COLORS = ['#F26522', '#000000', '#9E9E9E', '#BDBDBD', '#E0E0E0']

const REGION_SHORT_LABEL: Record<string, string> = {
  National: 'Nat',
  Nairobi: 'Nrb',
  Coast: 'Coa',
  Central: 'Cen',
  Western: 'Wes',
  Nyanza: 'Nya',
  'Rift Valley': 'RV',
  Eastern: 'Eas',
  'North Eastern': 'NE',
}

function docCount(s: { docs: { reg: boolean; cv: boolean; tax: boolean; prof: boolean } }) {
  return [s.docs.reg, s.docs.cv, s.docs.tax, s.docs.prof].filter(Boolean).length
}

export default function Overview() {
  const { suppliers } = useAppStore()
  const navigate = useNavigate()

  const stats = useMemo(() => {
    const total = suppliers.length
    const individuals = suppliers.filter((s) => s.applicant === 'Individual Consultant').length
    const orgs = suppliers.filter((s) => s.applicant === 'Registered Organization').length
    const both = suppliers.filter((s) => s.applicant === 'Both').length

    const trainers = suppliers.filter((s) => s.type === 'Trainer / Facilitator').length
    const trainersAndConsultants = suppliers.filter((s) => s.type === 'Trainer / Facilitator' || s.type === 'Consultant').length

    const docCounts = suppliers.map(docCount)
    const complete = docCounts.filter((n) => n === 4).length
    const incomplete = total - complete
    const completePct = total ? Math.round((complete / total) * 100) : 0

    const regionData = REGIONS.map((r) => ({
      label: REGION_SHORT_LABEL[r] ?? r,
      full: r,
      value: suppliers.filter((s) => s.regions.includes(r)).length,
    }))
    const specificRegions = regionData.filter((r) => r.full !== 'National')
    const weakestRegion = specificRegions.reduce((min, r) => (r.value < min.value ? r : min), specificRegions[0])
    const weakestIndex = weakestRegion ? regionData.findIndex((r) => r.full === weakestRegion.full) : -1

    const categoryTally = new Map<string, number>()
    for (const s of suppliers) {
      for (const c of s.cats) categoryTally.set(c, (categoryTally.get(c) ?? 0) + 1)
    }
    const categoryData = [...categoryTally.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value], i) => ({ label, value, emphasis: i === 0 }))

    const docTiers = [4, 3, 2, 1, 0].map((n, i) => ({
      label: n === 4 ? '4 of 4' : n === 0 ? 'None' : `${n} of 4`,
      value: docCounts.filter((c) => c === n).length,
      color: DOC_TIER_COLORS[i],
    }))

    const taxYes = suppliers.filter((s) => s.tax === 'Yes').length
    const taxProgress = suppliers.filter((s) => s.tax === 'In Progress').length
    const taxNo = suppliers.filter((s) => s.tax === 'No').length
    const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0)

    const shortlisted = suppliers.filter(isShortlisted).slice(0, 4)

    return {
      total, individuals, orgs, both, trainers, trainersAndConsultants,
      complete, incomplete, completePct,
      regionData, weakestIndex,
      categoryData, docTiers,
      compliance: [
        { label: 'Tax compliant', value: taxYes, pct: pct(taxYes) },
        { label: 'In progress', value: taxProgress, pct: pct(taxProgress) },
        { label: 'Not compliant', value: taxNo, pct: pct(taxNo) },
      ],
      shortlisted,
    }
  }, [suppliers])

  return (
    <div className="flex flex-col gap-5 pb-6">
      <Reveal className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="font-mono text-xs font-medium uppercase tracking-widest text-gray-500">
            <span className="text-orange">01</span> · Overview
          </span>
          <h1 className="text-[32px] font-bold leading-[1.05] tracking-tight sm:text-[40px]">
            {stats.total} applicants, <span className="serif-italic text-orange">one directory.</span>
          </h1>
          <p className="max-w-xl text-[14px] text-gray-500">
            Search AFOSI's prequalified trainers, facilitators and consultants and get a ranked, evidence-backed recommendation.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => navigate('/find')}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[13px] font-bold text-white"
          >
            <IconPlus width={15} height={15} />
            Find a facilitator
          </button>
        </div>
      </Reveal>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <StatCard
          label="Total suppliers"
          value={stats.total}
          caption={`${stats.individuals} individuals · ${stats.orgs} organisations · ${stats.both} both`}
          onClick={() => navigate('/find')}
        />
        <StatCard
          label="Trainers / facilitators"
          value={stats.trainers}
          caption={`${stats.trainersAndConsultants} including consultants`}
          tone="orange"
          delay={80}
          onClick={() => navigate('/find')}
        />
        <StatCard
          label="Documents complete (4/4)"
          value={stats.complete}
          caption={`${stats.completePct}% · ${stats.incomplete} missing at least one`}
          tone="ink"
          delay={160}
          onClick={() => navigate('/find')}
        />
      </div>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <Reveal delay={0}>
          <Card>
            <CardHeader title="Suppliers by region" subtitle={`${stats.total} suppliers · most cover more than one region`} />
            <CapsuleBars
              data={stats.regionData.map((r) => ({ label: r.label, value: r.value, title: r.full }))}
              highlightIndex={stats.weakestIndex}
            />
          </Card>
        </Reveal>

        <Reveal delay={100}>
          <Card>
            <CardHeader
              title="Shortlisted providers"
              subtitle="Docs, tax & registration complete"
              action={
                <button
                  onClick={() => navigate('/find')}
                  className="inline-flex h-7 items-center gap-1 rounded-full border border-gray-200 px-3 text-[12px] font-bold"
                >
                  See all
                </button>
              }
            />
            <div className="flex flex-col">
              {stats.shortlisted.length === 0 && (
                <span className="py-3 text-[13px] text-gray-500">No shortlist-ready suppliers yet.</span>
              )}
              {stats.shortlisted.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => navigate(`/profile/${s.id}`)}
                  className={`flex items-center gap-3 py-2.5 text-left ${i ? 'border-t border-gray-100' : ''}`}
                >
                  <Avatar name={s.name} size={36} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] font-bold">{s.name}</span>
                    <span className="text-[11px] text-gray-500">{s.type}</span>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-good px-2 py-0.5 text-[10px] font-bold text-good">
                    <IconCheck width={9} height={9} /> Shortlisted
                  </span>
                </button>
              ))}
            </div>
          </Card>
        </Reveal>
      </div>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
        <Reveal delay={0}>
          <Card>
            <CardHeader title="Suppliers by category" subtitle="Top 6" />
            {stats.categoryData.length === 0 ? (
              <span className="text-[13px] text-gray-500">No category data yet.</span>
            ) : (
              <BarRows data={stats.categoryData} />
            )}
          </Card>
        </Reveal>

        <Reveal delay={100}>
          <Card className="flex h-full flex-col items-center gap-4">
            <CardHeader title="Document completeness" subtitle={`All ${stats.total}`} />
            <DonutProgress percent={stats.completePct} caption="4/4 docs" />
            <div className="flex w-full flex-col gap-2 text-[13px]">
              {stats.docTiers.map((t) => (
                <div key={t.label} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: t.color }} />
                  <span className="text-gray-600">{t.label}</span>
                  <span className="ml-auto font-bold">{t.value}</span>
                </div>
              ))}
            </div>
          </Card>
        </Reveal>

        <Reveal delay={200}>
          <Card tone="ink" className="flex h-full flex-col gap-4">
            <CardHeader
              title={<span className="text-white">Compliance snapshot</span>}
              subtitle={<span className="text-white/50">All {stats.total}</span>}
            />
            <div className="flex flex-col gap-3">
              {stats.compliance.map((row, i) => (
                <div key={row.label} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-white/70">{row.label}</span>
                    <span className="font-bold">{row.value}</span>
                  </div>
                  <AnimatedBar pct={row.pct} delay={i * 120} />
                </div>
              ))}
            </div>
          </Card>
        </Reveal>
      </div>

    </div>
  )
}
