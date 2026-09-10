-- Withdrawal requests.
--
-- Uploads are no longer deleted by the uploader on the spot: the film may
-- already be cut around a clip, so removal is coordinated with the team.
--
-- IMPORTANT: there is deliberately NO "rejected" status. Withdrawing consent
-- under Art. 7(3) GDPR cannot be refused, so this table coordinates the
-- removal, it never decides whether it happens. A request ends as
-- 'erledigt' (material deleted) or 'zurueckgenommen' -- and the latter may
-- only be set after the person agreed to keep the material.

create type withdrawal_status as enum ('offen', 'erledigt', 'zurueckgenommen');

create table withdrawal_requests (
  id              uuid primary key default gen_random_uuid(),
  submission_id   uuid not null references submissions (id) on delete cascade,
  account_id      uuid          references accounts (id) on delete set null,

  -- Denormalised so the team overview needs no join, and so the request
  -- stays readable after the submission is deleted.
  uploader_name   text        not null,
  uploader_class  text        not null,
  asset_count     integer     not null default 0,

  reason          text        not null check (length(trim(reason)) between 3 and 2000),
  status          withdrawal_status not null default 'offen',
  resolution_note text        check (length(resolution_note) <= 2000),
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);

-- At most one open request per submission: a second one would just be noise
-- for the team. Closed ones stay as the audit trail.
create unique index withdrawal_one_open_per_submission
  on withdrawal_requests (submission_id)
  where status = 'offen';

create index withdrawal_status_idx  on withdrawal_requests (status, created_at desc);
create index withdrawal_account_idx on withdrawal_requests (account_id);

alter table withdrawal_requests enable row level security;

-- A student may file a request, but only against their OWN submission.
create policy "students file their own withdrawal requests"
  on withdrawal_requests for insert
  to anon, authenticated
  with check (
    account_id = current_account_id()
    and exists (
      select 1
        from submissions
       where submissions.id = submission_id
         and submissions.account_id = current_account_id()
    )
  );

create policy "students read their own withdrawal requests"
  on withdrawal_requests for select
  using (account_id is not null and account_id = current_account_id());

-- Taking a request back is the ONLY update a student may make, and only from
-- 'offen'. The WITH CHECK cannot see the old row, so it constrains the new
-- state; USING constrains which rows are updatable at all. Together they
-- allow exactly offen -> zurueckgenommen and nothing else.
create policy "students take back their own open request"
  on withdrawal_requests for update
  using (
    account_id is not null
    and account_id = current_account_id()
    and status = 'offen'
  )
  with check (
    account_id = current_account_id()
    and status = 'zurueckgenommen'
  );

create policy "team manages withdrawal requests"
  on withdrawal_requests for all
  using (is_team_member())
  with check (is_team_member());

-- ---------------------------------------------------------------------------
-- Students may no longer delete their submissions directly; the request
-- workflow replaces it. The team still can, which is how a request is
-- fulfilled.
-- ---------------------------------------------------------------------------

drop policy if exists "students withdraw their own submissions" on submissions;

-- ---------------------------------------------------------------------------
-- Guard rail: while a request is open the material must not be marked as
-- used in the film. Enforced in the database so a mis-click in the UI cannot
-- do it either.
-- ---------------------------------------------------------------------------

create or replace function block_use_while_withdrawal_open()
returns trigger
language plpgsql
as $$
begin
  if new.review_status = 'verwendet'
     and exists (
       select 1
         from withdrawal_requests
        where submission_id = new.id
          and status = 'offen'
     )
  then
    raise exception
      'Beitrag % hat einen offenen Rueckzugsantrag und darf nicht als verwendet markiert werden',
      new.id;
  end if;
  return new;
end;
$$;

create trigger submissions_block_use_while_withdrawal_open
  before update of review_status on submissions
  for each row
  execute function block_use_while_withdrawal_open();

-- NOTE for the backend: fulfilling a request ('erledigt') must delete the
-- Storage objects as well, not just the submission row. The cascade removes
-- the asset records, never the files.
