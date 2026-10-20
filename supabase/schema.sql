-- AFOSI Supplier Dashboard — initial schema
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query → paste → Run).
-- Safe to re-run: every statement is idempotent (IF NOT EXISTS / CREATE OR REPLACE).

create extension if not exists pgcrypto;
create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- suppliers: one row per applicant, App ID as the natural primary key.
-- Bank account NUMBERS are never stored here — only the Yes/No "has a bank
-- account" flag from the cleaned directory (that flag is part of the
-- compliance score; actual account details stay in the raw source only).
-- ---------------------------------------------------------------------------
create table if not exists suppliers (
  id                    text primary key,
  name                  text not null,
  applicant             text not null check (applicant in ('Individual Consultant', 'Registered Organization', 'Both')),
  org                   text not null default '',
  type                  text not null,
  years                 text not null,
  cats                  text[] not null default '{}',
  specs                 text[] not null default '{}',
  title                 text not null default '',
  phone                 text not null default '',
  email                 text not null default '',
  regions               text[] not null default '{}',
  registered            boolean not null default false,
  tax                   text not null check (tax in ('Yes', 'In Progress', 'No')),
  bank                  boolean not null default false,
  doc_reg               boolean not null default false,
  doc_cv                boolean not null default false,
  doc_tax               boolean not null default false,
  doc_prof              boolean not null default false,
  verified              boolean not null default false,
  verified_by           text,
  verified_at           timestamptz,
  notes                 text not null default '',
  submitted_at          text not null default '',
  how_heard             text not null default '',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- `create table if not exists` above is a no-op on a table that already
-- exists, so a column added after the first deployment (like `how_heard`)
-- needs its own idempotent step to reach a database created from an earlier
-- version of this file.
alter table suppliers add column if not exists how_heard text not null default '';
alter table suppliers add column if not exists contact_person text not null default '';

-- Document files (uploaded to the `supplier-documents` Storage bucket, see
-- below) — path only, never the file content itself, in this table.
alter table suppliers add column if not exists cv_storage_path   text;
alter table suppliers add column if not exists reg_storage_path  text;
alter table suppliers add column if not exists tax_storage_path  text;
alter table suppliers add column if not exists prof_storage_path text;

-- CV-derived facts, extracted verbatim from the uploaded CV by the
-- `analyze-document` Edge Function. These are structured facts pulled from
-- the document (quoted evidence, dates, listed items) — never AI-authored
-- prose. `cv_years_estimate` is computed by the function from parsed work
-- history dates, not asked of the model directly, and is only ever shown to
-- staff as a cross-check against the self-reported `years` band — it never
-- feeds the scoring formula itself.
alter table suppliers add column if not exists cv_years_estimate   numeric;
alter table suppliers add column if not exists cv_education        jsonb not null default '[]'::jsonb;
alter table suppliers add column if not exists cv_certifications   jsonb not null default '[]'::jsonb;
alter table suppliers add column if not exists cv_work_history     jsonb not null default '[]'::jsonb;
alter table suppliers add column if not exists cv_processed_at     timestamptz;
alter table suppliers add column if not exists cv_model            text;

-- Literal URLs found in the CV text (LinkedIn, portfolio, past-work samples),
-- extracted by plain regex — not AI-authored. `relevant` is a mechanical
-- token-overlap check against the supplier's own stated categories, not an
-- AI opinion about the link. See _shared/extraction.ts's extractLinks().
alter table suppliers add column if not exists cv_links jsonb not null default '[]'::jsonb;

-- Semantic-search embedding, computed from the supplier's own real content
-- (skill tags + verbatim CV evidence + categories/specialization) — never
-- from AI-generated text. text-embedding-3-small = 1536 dimensions.
alter table suppliers add column if not exists embedding            vector(1536);
alter table suppliers add column if not exists embedding_updated_at timestamptz;

-- hnsw (not ivfflat): builds incrementally and doesn't need pre-existing
-- rows to "train" on, which matters here since this index is created before
-- any embeddings have been computed.
create index if not exists idx_suppliers_embedding on suppliers
  using hnsw (embedding vector_cosine_ops);

-- Called by the `search-embed` Edge Function (service role, so RLS doesn't
-- apply here — the function itself checks for an authenticated caller before
-- ever reaching this) to rank suppliers by semantic similarity to a search
-- query's embedding.
create or replace function match_suppliers(query_embedding vector(1536), match_count int default 200)
returns table (id text, similarity float)
language sql stable
as $$
  select id, 1 - (embedding <=> query_embedding) as similarity
  from suppliers
  where embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- ---------------------------------------------------------------------------
-- skills: two-level taxonomy. Level 1 = the form's broad categories,
-- Level 2 = granular tags (with synonyms for search matching).
-- ---------------------------------------------------------------------------
create table if not exists skills (
  id               text primary key,
  name             text not null,
  level            smallint not null check (level in (1, 2)),
  parent_skill_id  text references skills(id),
  synonyms         text[] not null default '{}'
);

-- Seeds the Level-2 tag vocabulary (mirrors src/lib/skills.ts's SK dictionary).
-- This was missing since the very first version of this file, which meant
-- every attempt to insert into supplier_skills silently failed its foreign
-- key check — the real reason "Skills & evidence" has always shown empty,
-- independent of whether any CV/form tagging had actually been done.
insert into skills (id, name, level, synonyms) values
  ('MHPSS', 'Mental health & psychosocial', 2, array['mental health', 'psychosocial', 'mhpss', 'counselling', 'counseling', 'wellness', 'trauma', 'wellbeing']),
  ('GBV', 'GBV prevention', 2, array['gbv', 'gender based violence', 'sgbv', 'violence against women']),
  ('AYH', 'Adolescent & youth health', 2, array['adolescent', 'youth health', 'srhr', 'reproductive health', 'menstrual', 'sexual health']),
  ('FINLIT', 'Financial literacy', 2, array['financial literacy', 'financial', 'savings', 'money management', 'budgeting', 'vsla']),
  ('ENT', 'Entrepreneurship', 2, array['entrepreneurship', 'enterprise', 'business', 'startup', 'incubation']),
  ('CLIM', 'Climate adaptation', 2, array['climate', 'adaptation', 'resilience', 'drought', 'climate change']),
  ('ME', 'M&E', 2, array['m&e', 'monitoring', 'evaluation', 'mel', 'baseline', 'endline']),
  ('DATA', 'Data analysis', 2, array['data analysis', 'data', 'spss', 'stata', 'kobo', 'statistics']),
  ('DIG', 'Digital skills', 2, array['digital', 'ict', 'computer', 'digital literacy']),
  ('CURR', 'Curriculum development', 2, array['curriculum', 'e learning', 'elearning', 'content development', 'course design']),
  ('LEAD', 'Leadership & governance', 2, array['leadership', 'governance', 'mentorship', 'civic']),
  ('WASH', 'WASH', 2, array['wash', 'water', 'sanitation', 'hygiene', 'borehole']),
  ('AGRI', 'Agribusiness', 2, array['agribusiness', 'agriculture', 'farming', 'agroecology', 'regenerative']),
  ('PROP', 'Proposal writing', 2, array['proposal', 'proposal writing', 'grant writing', 'resource mobilization', 'resource mobilisation', 'fundraising']),
  ('TOT', 'Facilitation / ToT', 2, array['tot', 'training of trainers', 'facilitation', 'participatory']),
  ('DISAB', 'Disability inclusion', 2, array['disability', 'pwd', 'inclusion', 'inclusive'])
on conflict (id) do update set name = excluded.name, synonyms = excluded.synonyms;

-- supplier_skills: links suppliers to skills with evidence.
create table if not exists supplier_skills (
  supplier_id  text not null references suppliers(id) on delete cascade,
  skill_id     text not null references skills(id) on delete cascade,
  source       text not null check (source in ('Form', 'CV', 'Staff')),
  evidence     text not null default '',
  added_by     text,
  added_at     timestamptz not null default now(),
  primary key (supplier_id, skill_id, source)
);

-- engagements: performance/history log.
create table if not exists engagements (
  id             uuid primary key default gen_random_uuid(),
  supplier_id    text not null references suppliers(id) on delete cascade,
  program        text,
  activity       text not null,
  activity_date  date not null,
  rating         smallint not null check (rating between 1 and 5),
  feedback       text not null default '',
  would_reengage boolean not null default true,
  created_by     text,
  created_at     timestamptz not null default now()
);

-- upload_versions: powers the "Update Results" admin page.
create table if not exists upload_versions (
  id                text primary key,
  status            text not null check (status in ('PUBLISHED', 'REJECTED', 'SUPERSEDED')),
  source            text not null check (source in ('CSV', 'EXCEL', 'SHEET')),
  rows              integer not null default 0,
  uploaded_at       timestamptz not null default now(),
  uploaded_by       text not null default 'Admin',
  summary           jsonb not null default '{}'::jsonb,
  warning_messages  jsonb not null default '[]'::jsonb,
  patches           jsonb not null default '[]'::jsonb
);

-- `create table if not exists` above is a no-op on a table that already exists,
-- so re-running this file after a constraint changes (e.g. adding 'EXCEL' as a
-- valid source) wouldn't otherwise update it on a database created from an
-- earlier version of this file. This makes that upgrade idempotent too.
alter table upload_versions drop constraint if exists upload_versions_source_check;
alter table upload_versions add constraint upload_versions_source_check check (source in ('CSV', 'EXCEL', 'SHEET'));

create index if not exists idx_supplier_skills_supplier on supplier_skills(supplier_id);
create index if not exists idx_supplier_skills_skill on supplier_skills(skill_id);
create index if not exists idx_engagements_supplier on engagements(supplier_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- The dashboard now has a real login (Supabase Auth), so every table below
-- requires an authenticated session for both reads and writes — matching
-- the brief's "limit it to named AFOSI staff, and don't allow public links."
-- There's a single shared staff account for now (no per-user roles), so the
-- check is simply "is there a valid session", not a specific user ID.
-- ---------------------------------------------------------------------------
alter table suppliers enable row level security;
alter table skills enable row level security;
alter table supplier_skills enable row level security;
alter table engagements enable row level security;
alter table upload_versions enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['suppliers', 'skills', 'supplier_skills', 'engagements', 'upload_versions']
  loop
    execute format('drop policy if exists "public read" on %I', t);
    execute format('drop policy if exists "public write" on %I', t);
    execute format('drop policy if exists "staff read" on %I', t);
    execute format('create policy "staff read" on %I for select using (auth.role() = ''authenticated'')', t);
    execute format('drop policy if exists "staff write" on %I', t);
    execute format(
      'create policy "staff write" on %I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')',
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Storage: real CV/certificate files, uploaded from the dashboard.
-- Private bucket — same "authenticated staff only" rule as every table above.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('supplier-documents', 'supplier-documents', false)
on conflict (id) do nothing;

drop policy if exists "staff read documents" on storage.objects;
create policy "staff read documents" on storage.objects for select
  using (bucket_id = 'supplier-documents' and auth.role() = 'authenticated');

drop policy if exists "staff write documents" on storage.objects;
create policy "staff write documents" on storage.objects for insert
  with check (bucket_id = 'supplier-documents' and auth.role() = 'authenticated');

drop policy if exists "staff update documents" on storage.objects;
create policy "staff update documents" on storage.objects for update
  using (bucket_id = 'supplier-documents' and auth.role() = 'authenticated');

drop policy if exists "staff delete documents" on storage.objects;
create policy "staff delete documents" on storage.objects for delete
  using (bucket_id = 'supplier-documents' and auth.role() = 'authenticated');
