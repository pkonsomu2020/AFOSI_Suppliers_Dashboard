-- AFOSI Supplier Dashboard — self-hosted schema (adapted from supabase/schema.sql).
-- Run once against the afosi_suppliers database. Safe to re-run (idempotent).
--
-- Differences from the Supabase version: no storage.* bucket/policies (files live on
-- local disk, served by the Express backend) and no Row Level Security policies (the
-- Express auth middleware is the single access-control layer now — there's one shared
-- staff account, so there's no per-row distinction RLS would add over that).

create extension if not exists pgcrypto;
create extension if not exists vector;

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
  contact_person        text not null default '',
  cv_storage_path       text,
  reg_storage_path      text,
  tax_storage_path      text,
  prof_storage_path     text,
  cv_years_estimate     numeric,
  cv_education          jsonb not null default '[]'::jsonb,
  cv_certifications     jsonb not null default '[]'::jsonb,
  cv_work_history       jsonb not null default '[]'::jsonb,
  cv_processed_at       timestamptz,
  cv_model              text,
  cv_links              jsonb not null default '[]'::jsonb,
  embedding             vector(1536),
  embedding_updated_at  timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_suppliers_embedding on suppliers
  using hnsw (embedding vector_cosine_ops);

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

create table if not exists skills (
  id               text primary key,
  name             text not null,
  level            smallint not null check (level in (1, 2)),
  parent_skill_id  text references skills(id),
  synonyms         text[] not null default '{}'
);

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

create table if not exists supplier_skills (
  supplier_id  text not null references suppliers(id) on delete cascade,
  skill_id     text not null references skills(id) on delete cascade,
  source       text not null check (source in ('Form', 'CV', 'Staff')),
  evidence     text not null default '',
  added_by     text,
  added_at     timestamptz not null default now(),
  primary key (supplier_id, skill_id, source)
);

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

create index if not exists idx_supplier_skills_supplier on supplier_skills(supplier_id);
create index if not exists idx_supplier_skills_skill on supplier_skills(skill_id);
create index if not exists idx_engagements_supplier on engagements(supplier_id);

grant all privileges on all tables in schema public to afosi_suppliers_app;
grant all privileges on all sequences in schema public to afosi_suppliers_app;
