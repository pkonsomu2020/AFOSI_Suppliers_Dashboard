import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useAppStore } from '../store/AppStore'
import { parseCsvToObjects } from '../lib/csv'
import { parseExcelToObjects } from '../lib/excel'
import { mapCsvRows } from '../lib/importSuppliers'
import { planAttachmentUpload, type AttachmentPlan } from '../lib/attachmentsUpload'
import { uploadSupplierDocument } from '../lib/documents'
import { analyzeSupplierDocuments } from '../lib/ai'
import { Card, CardHeader } from '../components/ui/Card'
import { Reveal } from '../components/ui/Reveal'
import { Pill } from '../components/ui/Pill'
import { IconAlert, IconClock, IconFile, IconLink, IconUpload } from '../components/icons'
import type { UploadSummary } from '../lib/types'

const STATUS_TONE = { PUBLISHED: 'good', REJECTED: 'bad', SUPERSEDED: 'neutral' } as const

function fmtDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return iso
  }
}

function sheetToCsvUrl(url: string): string | null {
  const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (!idMatch) return null
  const gidMatch = url.match(/[?#&]gid=(\d+)/)
  const gid = gidMatch ? gidMatch[1] : '0'
  return `https://docs.google.com/spreadsheets/d/${idMatch[1]}/export?format=csv&gid=${gid}`
}

const UPLOADED_BY = 'Admin'

function PlanBucket({ title, items }: { title: string; items: { relativePath: string; reason: string }[] }) {
  if (items.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-dashed border-gray-200 p-3.5">
      <span className="text-[13px] font-bold">{title} ({items.length})</span>
      <div className="flex max-h-40 flex-col gap-1 overflow-y-auto text-[12px] text-gray-600">
        {items.map((it, i) => (
          <div key={i}>
            <span className="font-semibold">{it.relativePath.split('/').pop()}</span> — {it.reason}
          </div>
        ))}
      </div>
    </div>
  )
}

function AttachmentsUploadCard() {
  const { suppliers, refreshSuppliers, flash } = useAppStore()
  const folderInputRef = useRef<HTMLInputElement>(null)
  const [plan, setPlan] = useState<AttachmentPlan | null>(null)
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [done, setDone] = useState<{ uploaded: number; analyzed: number; failed: { relativePath: string; reason: string }[] } | null>(null)

  useEffect(() => {
    folderInputRef.current?.setAttribute('webkitdirectory', 'true')
    folderInputRef.current?.setAttribute('directory', 'true')
  }, [])

  const onPickFolder = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    setDone(null)
    setPlan(planAttachmentUpload(files, suppliers))
  }

  const onStart = async () => {
    if (!plan || plan.toUpload.length === 0) return
    setProcessing(true)
    setProgress({ done: 0, total: plan.toUpload.length })
    let uploaded = 0
    let analyzed = 0
    const failed: { relativePath: string; reason: string }[] = []

    for (const item of plan.toUpload) {
      try {
        await uploadSupplierDocument(item.supplierId, item.docType, item.file)
        uploaded++
        if (item.docType === 'cv') {
          try {
            await analyzeSupplierDocuments(item.supplierId)
            analyzed++
          } catch {
            // Uploaded fine; analysis can be retried later from that supplier's profile.
          }
        }
      } catch (err) {
        // A generic network failure here on Windows is very often the file's full path being
        // at or past 260 characters (Windows' classic path limit) — Chromium can't read it,
        // even though the same file uploads fine from a shorter path. Node isn't affected,
        // which is why this only shows up in the browser.
        const message = err instanceof Error ? err.message : String(err)
        const hint = /fail|network/i.test(message)
          ? 'Upload failed — if this keeps happening, the file\'s full folder path is likely too long for Windows (260+ characters); try copying the attachments folder somewhere with a shorter path, like D:\\attachments.'
          : message
        failed.push({ relativePath: item.relativePath, reason: hint })
      }
      setProgress((p) => (p ? { done: p.done + 1, total: p.total } : p))
    }

    await refreshSuppliers()
    setDone({ uploaded, analyzed, failed })
    setProcessing(false)
    setProgress(null)
    setPlan(null)
    flash(`Attachments processed: ${uploaded} uploaded, ${analyzed} CVs analyzed${failed.length ? `, ${failed.length} failed` : ''}`)
  }

  return (
    <Card className="flex flex-col gap-4">
      <CardHeader
        title="Upload attachments"
        subtitle="Select the APPLICATION ATTACHMENTS folder — CVs, registration, tax and professional certs, sorted automatically"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => folderInputRef.current?.click()}
          disabled={processing}
          className="inline-flex items-center gap-2 rounded-xl border border-ink px-4 py-2.5 text-[13px] font-bold disabled:opacity-40"
        >
          <IconFile width={14} height={14} />
          Select folder
        </button>
        <input ref={folderInputRef} type="file" multiple className="hidden" onChange={onPickFolder} />
        {processing && progress && (
          <span className="text-[13px] text-gray-500">Processing {progress.done} of {progress.total}…</span>
        )}
      </div>

      {plan && !processing && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Ready to upload', v: plan.toUpload.length },
              { label: 'Already have one', v: plan.alreadyHave.length },
              { label: 'Ambiguous', v: plan.ambiguous.length },
              { label: 'Unmatched', v: plan.unmatched.length + plan.unrecognizedFolder.length },
            ].map((r) => (
              <div key={r.label} className="rounded-2xl bg-gray-50 p-3.5">
                <span className="block text-2xl font-extrabold">{r.v}</span>
                <span className="text-[12px] text-gray-500">{r.label}</span>
              </div>
            ))}
          </div>
          <PlanBucket title="Ambiguous — pick manually on their profile" items={plan.ambiguous} />
          <PlanBucket title="Unmatched — attach manually on their profile" items={[...plan.unmatched, ...plan.unrecognizedFolder]} />
          <button
            onClick={onStart}
            disabled={plan.toUpload.length === 0}
            className="inline-flex w-fit items-center gap-2 rounded-xl bg-orange px-4 py-2.5 text-[13px] font-bold text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconUpload width={14} height={14} />
            Upload {plan.toUpload.length} file{plan.toUpload.length === 1 ? '' : 's'} and analyze CVs
          </button>
        </div>
      )}

      {done && (
        <div className="flex flex-col gap-3">
          <div className="rounded-2xl border border-dashed border-gray-200 p-3.5 text-[13px] text-gray-600">
            Done — {done.uploaded} uploaded, {done.analyzed} CVs analyzed{done.failed.length ? `, ${done.failed.length} failed` : ''}.
          </div>
          <PlanBucket title="Failed to upload" items={done.failed} />
        </div>
      )}
    </Card>
  )
}

export default function UpdateResults() {
  const { versions, applyImport, rebuildVersion, flash } = useAppStore()
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [sheetUrl, setSheetUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [lastResult, setLastResult] = useState<{ summary: UploadSummary; warnings: string[]; source: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const runImport = async (objects: Record<string, string>[], source: 'CSV' | 'EXCEL' | 'SHEET') => {
    if (objects.length === 0) {
      flash('That file has no rows AFOSI Suppliers Dashboard could read')
      return
    }
    const { rows, warnings, skipped } = mapCsvRows(objects)
    if (rows.length === 0) {
      flash('No row had both an App ID and a Full Name, so there is nothing to compare')
      return
    }
    if (skipped) warnings.push(`${skipped} row(s) skipped: missing App ID or Full Name`)
    const summary = await applyImport(rows, source, UPLOADED_BY, warnings)
    setLastResult({ summary, warnings, source })
  }

  const handleUpload = () => {
    if (!file) return
    setBusy(true)

    if (/\.xlsx?$/i.test(file.name)) {
      parseExcelToObjects(file)
        .then((objects) => runImport(objects, 'EXCEL'))
        .catch(() => flash('Could not read that Excel file'))
        .finally(() => {
          setBusy(false)
          setFile(null)
        })
      return
    }

    const reader = new FileReader()
    reader.onload = async () => {
      await runImport(parseCsvToObjects(String(reader.result ?? '')), 'CSV')
      setBusy(false)
      setFile(null)
    }
    reader.onerror = () => {
      flash('Could not read that file')
      setBusy(false)
    }
    reader.readAsText(file)
  }

  const handleFetchSheet = async () => {
    const csvUrl = sheetToCsvUrl(sheetUrl.trim())
    if (!csvUrl) {
      flash('That doesn\'t look like a Google Sheets link')
      return
    }
    setBusy(true)
    try {
      const res = await fetch(csvUrl)
      if (!res.ok) throw new Error(String(res.status))
      const text = await res.text()
      await runImport(parseCsvToObjects(text), 'SHEET')
    } catch {
      flash('Could not fetch that sheet. Make sure it\'s shared with "Anyone with the link"')
    } finally {
      setBusy(false)
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files?.[0]
    if (dropped) setFile(dropped)
  }

  return (
    <div className="flex flex-col gap-6 pb-6">
      <Reveal className="flex flex-col gap-2">
        <span className="font-mono text-xs font-medium uppercase tracking-widest text-gray-500">
          <span className="text-orange">05</span> · Update results
        </span>
        <h1 className="text-[32px] font-bold leading-[1.05] tracking-tight sm:text-[40px]">
          Publish the <span className="serif-italic text-orange">latest cleaned data.</span>
        </h1>
        <p className="max-w-2xl text-[14px] text-gray-500">
          Upload the cleaned supplier data (CSV or Excel) each time it changes. The system compares it against what's live,
          publishes it if anything's different, and tells you if nothing changed.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <Card className="flex flex-col gap-4">
          <span className="font-mono text-[11px] font-medium uppercase tracking-widest text-gray-500">Upload a CSV or Excel file</span>
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed py-10 text-center transition-colors ${
              dragOver ? 'border-orange bg-orange-soft/40' : 'border-gray-200 bg-gray-50'
            }`}
          >
            <IconFile width={24} height={24} className="text-gray-400" />
            {file ? (
              <span className="text-[14px] font-bold">{file.name}</span>
            ) : (
              <span className="text-[14px] font-bold">Drop the results CSV or Excel file here, or click to browse</span>
            )}
            <span className="text-[12px] text-gray-500">.csv or .xlsx, this replaces the published human results</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <button
            onClick={handleUpload}
            disabled={!file || busy}
            className="inline-flex w-fit items-center gap-2 rounded-xl bg-orange px-4 py-2.5 text-[13px] font-bold text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconUpload width={14} height={14} />
            Upload and compare
          </button>
        </Card>
      </Reveal>

      <Reveal delay={200}>
        <Card className="flex flex-col gap-3">
          <span className="font-mono text-[11px] font-medium uppercase tracking-widest text-gray-500">Or fetch from Google Sheets</span>
          <div className="flex flex-wrap gap-2.5">
            <div className="flex min-w-[260px] flex-1 items-center gap-2 rounded-xl border border-gray-200 px-3 py-2.5">
              <IconLink width={15} height={15} className="shrink-0 text-gray-400" />
              <input
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/…"
                className="min-w-0 flex-1 border-none bg-transparent text-[14px] outline-none"
              />
            </div>
            <button
              onClick={handleFetchSheet}
              disabled={!sheetUrl.trim() || busy}
              className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Fetch and compare
            </button>
          </div>
          <span className="text-[12px] text-gray-500">The sheet must be shared with anyone holding the link.</span>
        </Card>
      </Reveal>

      <Reveal delay={220}>
        <AttachmentsUploadCard />
      </Reveal>

      {lastResult && (
        <Reveal>
          <Card className="flex flex-col gap-3">
            <CardHeader
              title="Last comparison"
              subtitle={lastResult.summary.added + lastResult.summary.changed > 0 ? 'Published to the directory' : 'No changes, nothing published'}
            />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Added', v: lastResult.summary.added },
                { label: 'Updated', v: lastResult.summary.changed },
                { label: 'Unchanged', v: lastResult.summary.unchanged },
                { label: 'Warnings', v: lastResult.summary.warnings },
              ].map((r) => (
                <div key={r.label} className="rounded-2xl bg-gray-50 p-3.5">
                  <span className="block text-2xl font-extrabold">{r.v}</span>
                  <span className="text-[12px] text-gray-500">{r.label}</span>
                </div>
              ))}
            </div>
            {lastResult.warnings.length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-2xl border border-dashed border-gray-200 p-3.5">
                {lastResult.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 text-[12px] text-gray-600">
                    <IconAlert width={13} height={13} className="mt-0.5 shrink-0 text-orange" />
                    {w}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Reveal>
      )}

      <Reveal delay={260}>
        <Card className="flex flex-col gap-4">
          <CardHeader title="Version history" />
          {versions.length === 0 ? (
            <div className="flex items-center gap-2 rounded-2xl border border-dashed border-gray-200 p-5 text-[14px] text-gray-500">
              <IconClock width={16} height={16} />
              No uploads yet. The directory is running on its seed data.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-[14px]">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-[12px] text-gray-500">
                    <th className="pb-2 pr-3 font-semibold">#</th>
                    <th className="pb-2 pr-3 font-semibold">Status</th>
                    <th className="pb-2 pr-3 font-semibold">Source</th>
                    <th className="pb-2 pr-3 font-semibold">Rows</th>
                    <th className="pb-2 pr-3 font-semibold">Uploaded</th>
                    <th className="pb-2 pr-3 font-semibold">By</th>
                    <th className="pb-2 font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {versions.map((v, i) => (
                    <tr key={v.id} className="border-t border-gray-100">
                      <td className="py-3 pr-3 text-gray-500">{versions.length - i}</td>
                      <td className="py-3 pr-3">
                        <Pill tone={STATUS_TONE[v.status]}>{v.status}</Pill>
                      </td>
                      <td className="py-3 pr-3">{v.source}</td>
                      <td className="py-3 pr-3 font-semibold">{v.rows}</td>
                      <td className="py-3 pr-3 whitespace-nowrap text-gray-500">{fmtDateTime(v.uploadedAt)}</td>
                      <td className="py-3 pr-3 font-semibold">{v.uploadedBy}</td>
                      <td className="py-3">
                        {v.status !== 'PUBLISHED' && (
                          <button onClick={() => rebuildVersion(v.id)} className="font-bold text-orange">
                            Rebuild
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </Reveal>
    </div>
  )
}
