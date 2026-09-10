-- Abifilm submission schema (PostgreSQL / Supabase).
--
-- Security model, in one sentence: students may INSERT and nothing else,
-- the film team may read everything, and nobody can read anybody else's
-- uploads. The route guard in the Angular app is convenience only -- these
-- policies are the actual protection.
--
-- Apply with:  supabase db push
-- Region MUST be inside the EU (e.g. eu-central-1 / Frankfurt): the material
-- shows identifiable minors, see Art. 44 ff. GDPR.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type review_status as enum ('neu', 'gesichtet', 'verwendet', 'aussortiert');

-- ---------------------------------------------------------------------------
-- Film team membership. Being listed here IS the admin role.
-- ---------------------------------------------------------------------------

create table team_members (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  created_at timestamptz not null default now()
);

create or replace function is_team_member()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from team_members where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Access codes for the year group
-- ---------------------------------------------------------------------------

create table access_codes (
  id         uuid primary key default gen_random_uuid(),
  -- Never store the code itself: hash it, like any other shared secret.
  code_hash  text        not null unique,
  label      text        not null,
  expires_at timestamptz not null,
  revoked    boolean     not null default false,
  created_at timestamptz not null default now()
);

alter table access_codes enable row level security;

-- Only the team can see or manage codes. Verification happens in an edge
-- function running with the service role, never from the browser.
create policy "team manages access codes"
  on access_codes for all
  using (is_team_member())
  with check (is_team_member());

-- ---------------------------------------------------------------------------
-- Submissions
-- ---------------------------------------------------------------------------

create table submissions (
  id              uuid primary key default gen_random_uuid(),
  uploader_name   text        not null check (length(trim(uploader_name)) between 2 and 120),
  uploader_class  text        not null,
  category        text        not null,
  -- Month precision is all we ask for; stored as the first of the month.
  taken_at        date,
  description     text        check (length(description) <= 2000),

  -- Consent must be recorded as given, together with the exact wording
  -- version it refers to. A consent that cannot be traced to a text is
  -- worthless when someone asks what they agreed to.
  consent_persons boolean     not null check (consent_persons),
  consent_privacy boolean     not null check (consent_privacy),
  consent_version text        not null,
  extended_usage  boolean     not null default false,

  review_status   review_status not null default 'neu',
  -- Truncated, salted hash only -- enough for rate limiting, not enough to
  -- identify a person or a household.
  ip_hash         text,
  created_at      timestamptz not null default now()
);

create index submissions_created_at_idx on submissions (created_at desc);
create index submissions_category_idx   on submissions (category);
create index submissions_status_idx     on submissions (review_status);

alter table submissions enable row level security;

-- Students: write-only. No SELECT policy exists for anon, so a student
-- cannot read their own row back, let alone anyone else's.
create policy "anyone with the app may submit"
  on submissions for insert
  to anon, authenticated
  with check (true);

create policy "team reads all submissions"
  on submissions for select
  using (is_team_member());

create policy "team updates review status"
  on submissions for update
  using (is_team_member())
  with check (is_team_member());

-- Deletion has to work: withdrawing consent (Art. 7(3) GDPR) must be
-- executable by the team without a database administrator.
create policy "team deletes submissions"
  on submissions for delete
  using (is_team_member());

-- ---------------------------------------------------------------------------
-- Assets
-- ---------------------------------------------------------------------------

create table assets (
  id                uuid primary key default gen_random_uuid(),
  -- Nullable on purpose: files upload BEFORE the form is submitted, so an
  -- asset exists for a while without a parent. See the cleanup job below.
  submission_id     uuid references submissions (id) on delete cascade,
  storage_path      text        not null unique,
  original_filename text        not null,
  mime_type         text        not null,
  size_bytes        bigint      not null check (size_bytes > 0),
  duration_seconds  numeric,
  width             integer,
  height            integer,
  -- Server-side derivative for the team overview. The original is never
  -- re-encoded: the film needs full quality.
  thumbnail_path    text,
  created_at        timestamptz not null default now()
);

create index assets_submission_idx on assets (submission_id);

alter table assets enable row level security;

create policy "anyone with the app may register an asset"
  on assets for insert
  to anon, authenticated
  with check (true);

create policy "team reads all assets"
  on assets for select
  using (is_team_member());

create policy "team deletes assets"
  on assets for delete
  using (is_team_member());

-- ---------------------------------------------------------------------------
-- Public counter for the landing page
--
-- A view instead of a SELECT policy: the count is public, the rows are not.
-- ---------------------------------------------------------------------------

create view submission_count
with (security_invoker = off) as
  select count(*)::int as count from submissions;

grant select on submission_count to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Housekeeping
-- ---------------------------------------------------------------------------

-- Students who pick files and then close the tab leave assets behind with no
-- submission. Schedule this (pg_cron, hourly) or storage fills up with
-- material nobody consented to keeping.
create or replace function delete_orphaned_assets()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  with gone as (
    delete from assets
     where submission_id is null
       and created_at < now() - interval '24 hours'
    returning 1
  )
  select count(*) into removed from gone;
  return removed;
end;
$$;

-- Retention: delete everything N months after the graduation ceremony.
-- Run as a scheduled job; the interval mirrors RETENTION_MONTHS in
-- src/app/core/config.ts -- keep the two in sync.
create or replace function delete_expired_submissions(retention_months integer default 6)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  with gone as (
    delete from submissions
     where created_at < now() - make_interval(months => retention_months)
    returning 1
  )
  select count(*) into removed from gone;
  return removed;
end;
$$;

-- NOTE: both functions delete database rows only. The corresponding objects
-- in Storage must be removed in the same job (storage.objects, or the
-- Storage API) -- otherwise the files outlive their consent record.
