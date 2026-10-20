import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { fetchSuppliers, fetchVersions, publishImport, setSupplierNotes } from '../lib/supabaseData'
import { buildNewSupplier, hasSupplierChanges } from '../lib/importSuppliers'
import type { Supplier, UploadSource, UploadSummary, UploadVersion } from '../lib/types'

interface AppStoreValue {
  suppliers: Supplier[]
  loading: boolean
  loadError: string | null
  selectedId: string
  setSelectedId: (id: string) => void
  setNotes: (supplierId: string, notes: string) => void
  refreshSuppliers: () => Promise<void>
  versions: UploadVersion[]
  applyImport: (patches: { appId: string; patch: Partial<Supplier> }[], source: UploadSource, uploadedBy: string, warnings: string[]) => Promise<UploadSummary>
  rebuildVersion: (versionId: string) => void
  toast: string
  flash: (msg: string) => void
}

const AppStoreContext = createContext<AppStoreValue | null>(null)

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [versions, setVersions] = useState<UploadVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [toast, setToast] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const flash = useCallback((msg: string) => {
    clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(''), 2600)
  }, [])

  const refresh = useCallback(async () => {
    const [nextSuppliers, nextVersions] = await Promise.all([fetchSuppliers(), fetchVersions()])
    setSuppliers(nextSuppliers)
    setVersions(nextVersions)
    return nextSuppliers
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    refresh()
      .then((loaded) => {
        if (cancelled) return
        setSelectedId((cur) => cur || loaded[0]?.id || '')
        setLoadError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : 'Could not reach Supabase')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refresh])

  const setNotes = useCallback((supplierId: string, notes: string) => {
    setSuppliers((prev) => prev.map((s) => (s.id === supplierId ? { ...s, notes } : s)))
    setSupplierNotes(supplierId, notes).catch(() => flash('Could not save that note, try again'))
  }, [flash])

  const applyImport = useCallback(
    async (patches: { appId: string; patch: Partial<Supplier> }[], source: UploadSource, uploadedBy: string, warnings: string[]): Promise<UploadSummary> => {
      let added = 0
      let changed = 0
      let unchanged = 0
      const toPublish: { appId: string; patch: Partial<Supplier> }[] = []

      for (const { appId, patch } of patches) {
        const existing = suppliers.find((s) => s.id === appId)
        if (!existing) {
          toPublish.push({ appId, patch: buildNewSupplier(appId, patch) })
          added++
        } else if (hasSupplierChanges(existing, patch)) {
          toPublish.push({ appId, patch })
          changed++
        } else {
          unchanged++
        }
      }

      const summary: UploadSummary = { added, changed, unchanged, warnings: warnings.length }

      try {
        await publishImport(toPublish, source, uploadedBy, summary, warnings)
        await refresh()
        flash(
          added + changed > 0
            ? `Published: ${added} added, ${changed} updated, ${unchanged} unchanged`
            : 'No changes detected, nothing to update',
        )
      } catch (err) {
        console.error('applyImport failed:', err)
        const detail = err instanceof Error ? err.message : String(err)
        flash(`Could not publish that upload: ${detail}`)
      }

      return summary
    },
    [suppliers, refresh, flash],
  )

  const rebuildVersion = useCallback(
    (versionId: string) => {
      const version = versions.find((v) => v.id === versionId)
      if (!version) return
      applyImport(version.patches, version.source, version.uploadedBy, version.warningMessages)
    },
    [versions, applyImport],
  )

  const value: AppStoreValue = {
    suppliers,
    loading,
    loadError,
    selectedId,
    setSelectedId,
    setNotes,
    refreshSuppliers: async () => {
      await refresh()
    },
    versions,
    applyImport,
    rebuildVersion,
    toast,
    flash,
  }

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>
}

export function useAppStore() {
  const ctx = useContext(AppStoreContext)
  if (!ctx) throw new Error('useAppStore must be used within AppStoreProvider')
  return ctx
}
