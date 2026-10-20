import { readSheet, SheetNotFoundError } from 'read-excel-file/browser'

/**
 * Reads an .xlsx/.xls file into the same row-object shape parseCsvToObjects produces.
 * Prefers a sheet named "Master Index" (the real AFOSI export has several tabs —
 * Summary, By Category, By Region, Missing Documents — and reading the wrong one,
 * or the whole workbook, is what to avoid), falling back to the first sheet.
 */
export async function parseExcelToObjects(file: File): Promise<Record<string, string>[]> {
  let rows
  try {
    rows = await readSheet(file, 'Master Index')
  } catch (err) {
    if (!(err instanceof SheetNotFoundError)) throw err
    rows = await readSheet(file, 1)
  }
  if (rows.length === 0) return []
  const headers = rows[0].map((h) => String(h ?? '').trim())
  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => {
      const v = row[i]
      obj[h] = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v)
    })
    return obj
  })
}
