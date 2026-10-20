// Replaces supabaseClient.ts — talks to our own Node backend (server/) instead of Supabase.
// credentials: 'include' sends the httpOnly session cookie set by POST /api/auth/login.
const BASE = import.meta.env.VITE_API_URL || '/api'

export class ApiError extends Error {}

async function handle(res: Response) {
  const isJson = res.headers.get('content-type')?.includes('application/json')
  const body = isJson ? await res.json().catch(() => null) : null
  if (!res.ok) {
    throw new ApiError(body?.error || res.statusText || 'Request failed.')
  }
  return body
}

export async function apiGet(path: string) {
  const res = await fetch(`${BASE}${path}`, { credentials: 'include' })
  return handle(res)
}

export async function apiPost(path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  return handle(res)
}

export async function apiPatch(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return handle(res)
}

/** Uploads a file as multipart form data (document uploads). */
export async function apiUpload(path: string, file: File) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}${path}`, { method: 'POST', credentials: 'include', body: form })
  return handle(res)
}

export function apiFileUrl(path: string) {
  return `${BASE}${path}`
}
