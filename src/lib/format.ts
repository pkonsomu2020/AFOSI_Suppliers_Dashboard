export const fmtDate = (d: string) => {
  try {
    return new Date(d + 'T00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return d
  }
}

/** For full ISO timestamps (e.g. `cv_processed_at`) — `fmtDate` expects a plain date and mangles these. */
export const fmtDateTime = (iso: string) => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export const fmtPhone = (p: string) => p.replace(/^\+254(\d{3})(\d{3})(\d{3})$/, '+254 $1 $2 $3')

export const today = () => new Date().toISOString().slice(0, 10)

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
