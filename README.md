# AFOSI Supplier Dashboard

Search and rank AFOSI's real prequalified trainers, facilitators and consultants for an activity, review supplier profiles (skills, experience, documents, compliance), and keep the directory current as new applications and attachments come in.

This app lives at the repo root. Two other top-level folders sit alongside it (both gitignored where they contain real applicant data):

- `AFOSI SUPPLIER PREQUALIFICATIONS_APPLICATIONS/` — the real source data (supplier directory, raw form responses, application attachments). Contains PII — never committed.
- `HTML FILES/` — the original single-file HTML prototype, kept for reference, no longer the active UI.

## Stack

Vite · React 19 · TypeScript · React Router v7 · Tailwind CSS v4, backed by Supabase (Postgres + Auth + Storage + Edge Functions) and OpenAI (CV analysis + semantic search embeddings).

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Environment variables** — create `.env` at the repo root:
   ```bash
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key          # client-safe by design

   # Server-side only — used by scripts/ and Edge Function secrets, never imported from src/
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   OPENAI_API_KEY=sk-...
   ```

3. **Database schema** — run `supabase/schema.sql` once in the Supabase SQL Editor (or `supabase db query --linked -f supabase/schema.sql` if you're linked via the CLI). It's fully idempotent, safe to re-run any time the schema changes.

4. **Edge Functions** (CV analysis + semantic search — hold the OpenAI key server-side, never in the browser bundle):
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase functions deploy analyze-document
   npx supabase functions deploy search-embed
   npx supabase secrets set OPENAI_API_KEY=sk-...
   ```

5. **Staff login** — create the shared staff account once via `node scripts/create-admin-user.mjs` (uses the service role key; edit the script if you want a different email/password than its defaults).

6. **Run it**
   ```bash
   npm run dev      # dev server
   npm run build    # type-check (tsc -b) + production build
   npm run lint     # oxlint
   ```

## Structure

```
src/
  components/     Sidebar, Topbar, RequireAuth, DataGate, icons, and reusable ui/ primitives
  lib/            types, Supabase data access, scoring engine, skills taxonomy, CSV/Excel import,
                  attachment matching/upload, AI (Edge Function) client helpers, formatting
  pages/          Login, Overview, Find, SupplierProfile, UpdateResults
  store/          AppStore (suppliers/versions from Supabase) and AuthStore (session)
supabase/
  schema.sql      idempotent DDL: tables, RLS, Storage bucket + policies, pgvector, match_suppliers()
  functions/      analyze-document (CV extraction) and search-embed (semantic search) Edge Functions
scripts/          one-off admin/migration scripts (bulk import, CV/attachment backfills) — service-role only
```

## Data & AI

The directory (175+ real suppliers) lives in Supabase Postgres, kept in sync from the cleaned Excel export via the Update Results page (CSV/Excel upload, diffed against what's live) and the "Upload attachments" bulk folder upload (matches files to suppliers by name, uploads to Storage, and runs AI analysis on CVs automatically).

CV analysis extracts only real, verbatim facts from each document (skills with quoted evidence, education, certifications, work history, and any links to past work) — every claim is validated against the source text before being saved, and nothing AI-generated is ever stored or displayed. Scoring stays fully rule-based and auditable; AI-derived signals (CV substance, semantic search relevance) strengthen and rank against that same rule-based score rather than replacing it with a model's own judgment.

**Note on Windows + the attachments folder:** file paths nested deep inside this repo can exceed Windows' 260-character path limit, which breaks browser-based uploads (not Supabase's storage limit — a local OS limitation). If bulk attachment uploads fail with a generic network error, copy the attachments folder somewhere with a short path (e.g. `D:\afosi-attachments`) and select that instead.
