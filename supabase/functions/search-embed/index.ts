// Ranks suppliers by semantic similarity between a free-text search query
// and each supplier's real-content embedding (see analyze-document). Called
// automatically on every Find search submit — kept to one small embeddings
// call per search (no per-candidate LLM calls) so it stays fast and cheap.
//
// Deploy: supabase functions deploy search-embed
// Secrets: reuses OPENAI_API_KEY (already set for analyze-document).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { CORS_HEADERS, jsonResponse } from '../_shared/cors.ts'
import { embedText } from '../_shared/extraction.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  try {
    const authHeader = req.headers.get('Authorization') || ''
    const authedClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
    const { data: userData, error: userErr } = await authedClient.auth.getUser()
    if (userErr || !userData?.user) return jsonResponse({ error: 'Not authenticated.' }, 401)

    const { query } = await req.json()
    if (!query || typeof query !== 'string' || !query.trim()) return jsonResponse({ scores: [] })

    const embedding = await embedText(query, OPENAI_API_KEY)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data, error } = await admin.rpc('match_suppliers', { query_embedding: embedding, match_count: 200 })
    if (error) return jsonResponse({ error: error.message }, 500)

    return jsonResponse({ scores: data ?? [] })
  } catch (err) {
    console.error(err)
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unexpected error.' }, 500)
  }
})
