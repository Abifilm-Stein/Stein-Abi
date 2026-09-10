-- Pre-generated student accounts, and per-account read access.
--
-- Replaces the single shared access code from 0001. Each student now gets one
-- personal code that maps to exactly one account, which is what makes
-- "meine Beiträge" enforceable rather than a client-side guess.
--
-- Security model after this migration:
--   * a student may read ONLY their own submissions and assets
--   * a student may delete ONLY their own submissions (right of withdrawal)
--   * the film team may read and manage everything
--   * nobody can enumerate accounts or codes

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------

create table accounts (
  id           uuid primary key default gen_random_uuid(),
  display_name text        not null check (length(trim(display_name)) between 2 and 120),
  school_class text        not null,

  -- The code is a CREDENTIAL. Store only a hash, exactly as with a password.
  -- Use pgcrypto's crypt() with a bf salt, or hash in the edge function with
  -- Argon2id -- never a bare digest of a 12-character secret.
  code_hash    text        not null unique,
  -- Short prefix of the plain code, purely so the team can tell two slips
  -- apart when reissuing ("the one starting DEMA"). Never the full code.
  code_hint    text        not null,

  revoked      boolean     not null default false,
  last_seen_at timestamptz,
  created_at   timestamptz not null default now()
);

alter table accounts enable row level security;

-- Only the team touches this table. Code verification happens in an edge
-- function under the service role, so no policy grants anon any access -- a
-- student can therefore never enumerate names or codes.
create policy "team manages accounts"
  on accounts for all
  using (is_team_member())
  with check (is_team_member());

-- The shared year-group code from 0001 is obsolete.
drop table if exists access_codes;

-- ---------------------------------------------------------------------------
-- Bind submissions to an account
-- ---------------------------------------------------------------------------

-- on delete set null, not cascade: removing an account must not silently
-- destroy material the film may already depend on. uploader_name is kept
-- denormalised for exactly this case.
alter table submissions
  add column account_id uuid references accounts (id) on delete set null;

create index submissions_account_idx on submissions (account_id);

-- ---------------------------------------------------------------------------
-- Who is the caller?
--
-- The edge function issues a JWT carrying the account id in a custom claim.
-- Reading it from the token means the client cannot influence it -- passing
-- an account id in the request body would let anyone read anyone's uploads.
-- ---------------------------------------------------------------------------

create or replace function current_account_id()
returns uuid
language sql
stable
as $$
  select nullif(
    current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'account_id',
    ''
  )::uuid;
$$;

-- ---------------------------------------------------------------------------
-- Per-account access
-- ---------------------------------------------------------------------------

-- Students could previously not read anything at all. They may now read
-- their own rows, and only those.
create policy "students read their own submissions"
  on submissions for select
  using (account_id is not null and account_id = current_account_id());

create policy "students read their own assets"
  on assets for select
  using (
    exists (
      select 1
        from submissions
       where submissions.id = assets.submission_id
         and submissions.account_id = current_account_id()
    )
  );

-- Right of withdrawal (Art. 7(3) GDPR), exercisable without asking the team.
create policy "students withdraw their own submissions"
  on submissions for delete
  using (account_id is not null and account_id = current_account_id());

-- Tighten INSERT: a submission must be stamped with the caller's own account,
-- so nobody can file material under someone else's name.
drop policy if exists "anyone with the app may submit" on submissions;

create policy "students submit as themselves"
  on submissions for insert
  to anon, authenticated
  with check (account_id = current_account_id());

-- ---------------------------------------------------------------------------
-- Provisioning helper
--
-- Call once per student from a trusted context (service role):
--   select * from provision_account('Mia Beispiel', 'Q2', 'DEMA-Q2MJ-A234');
-- The plain code is passed in, hashed here, and never stored.
-- ---------------------------------------------------------------------------

create or replace function provision_account(
  p_display_name text,
  p_school_class text,
  p_plain_code   text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  new_id uuid;
  canonical text;
begin
  -- Same canonical form the browser produces: upper case, separators removed.
  canonical := upper(regexp_replace(p_plain_code, '[^A-Za-z0-9]', '', 'g'));

  if length(canonical) <> 12 then
    raise exception 'Code muss 12 Zeichen haben, war % Zeichen', length(canonical);
  end if;

  insert into accounts (display_name, school_class, code_hash, code_hint)
  values (
    p_display_name,
    p_school_class,
    crypt(canonical, gen_salt('bf', 12)),
    left(canonical, 4)
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function provision_account(text, text, text) from anon, authenticated;

-- NOTE for the edge function that verifies a login:
--   1. canonicalise the submitted code the same way
--   2. select id from accounts where code_hash = crypt($1, code_hash) and not revoked
--   3. RATE LIMIT per IP. Without it, 30^12 is irrelevant because an attacker
--      can simply keep trying. Suggested: 10 attempts per IP per hour.
--   4. answer identically for "unknown code" and "revoked code", so the
--      response cannot be used to probe which codes exist
