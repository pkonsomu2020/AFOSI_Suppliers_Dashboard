import { apiPost } from './apiClient'

export interface AnalyzeDocumentResult {
  ok: boolean
  skillsFound: number
  educationFound: number
  certificationsFound: number
  workHistoryFound: number
  cvYearsEstimate: number | null
  warnings: string[]
}

/** Runs CV analysis for one supplier. Throws with a readable message on failure. */
export async function analyzeSupplierDocuments(supplierId: string): Promise<AnalyzeDocumentResult> {
  return apiPost('/analyze-document', { supplierId })
}

/** Ranks suppliers by semantic similarity to a search query. Returns {} on any failure so search still works without it. */
export async function semanticSearchScores(query: string): Promise<Record<string, number>> {
  if (!query.trim()) return {}
  try {
    const data = await apiPost('/search-embed', { query })
    const scores: Record<string, number> = {}
    for (const row of (data?.scores ?? []) as { id: string; similarity: number }[]) scores[row.id] = row.similarity
    return scores
  } catch {
    return {}
  }
}
