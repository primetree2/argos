-- Async scoring queue (ROADMAP Phase 2, item 1).
--
-- Decouples scoring from the submit request path. Submitting an argument now
-- (a) inserts the argument as scoring_status = 'pending', (b) enqueues a durable
-- scoring_jobs row, and (c) fires the score call WITHOUT awaiting it. If that
-- fire-and-forget call is dropped, the maintenance cron drains the queue. This
-- is the free, Redis-less job queue the roadmap calls for.
--
-- Apply in the Supabase SQL editor. Fully idempotent (safe to run twice).

-- ── Queue table ───────────────────────────────────────────────────
-- One row per argument awaiting scoring. status: queued -> claimed -> (deleted
-- on success, or back to queued on failure with attempts incremented). The
-- UNIQUE(argument_id) makes enqueue idempotent under double-submit/retries.
create table if not exists scoring_jobs (
  id           uuid primary key default gen_random_uuid(),
  argument_id  uuid not null unique references arguments(id) on delete cascade,
  user_id      uuid references users(id),
  status       text not null default 'queued',  -- queued | claimed
  attempts     int  not null default 0,
  claimed_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists idx_scoring_jobs_status_created
  on scoring_jobs(status, created_at);

-- ── Enqueue ──────────────────────────────────────────────────
-- Idempotent: a repeat enqueue for the same argument resets it to 'queued'
-- (so a re-driven argument is picked up again) without creating duplicates.
create or replace function enqueue_scoring_job(p_argument_id uuid, p_user_id uuid)
returns void
language sql
as $$
  insert into scoring_jobs (argument_id, user_id, status)
  values (p_argument_id, p_user_id, 'queued')
  on conflict (argument_id) do update
    set status = 'queued';
$$;

-- ── Claim a batch ─────────────────────────────────────────────
-- Atomically claim up to p_limit jobs that are queued (or claimed-but-stale,
-- i.e. a worker died mid-flight). FOR UPDATE SKIP LOCKED guarantees two
-- concurrent cron runs never claim the same job. Returns the claimed rows so
-- the caller can drive /api/score for each. p_stale_seconds re-claims jobs
-- stuck in 'claimed' longer than that (default 120s).
create or replace function claim_scoring_jobs(
  p_limit int default 10,
  p_stale_seconds int default 120
)
returns table (argument_id uuid, user_id uuid, attempts int)
language plpgsql
as $$
begin
  return query
  with picked as (
    select sj.id
    from scoring_jobs sj
    where sj.status = 'queued'
       or (sj.status = 'claimed'
           and sj.claimed_at < now() - make_interval(secs => p_stale_seconds))
    order by sj.created_at asc
    limit p_limit
    for update skip locked
  )
  update scoring_jobs s
    set status = 'claimed',
        claimed_at = now(),
        attempts = s.attempts + 1
  from picked
  where s.id = picked.id
  returning s.argument_id, s.user_id, s.attempts;
end;
$$;

-- ── Resolve ─────────────────────────────────────────────────
-- Remove a job once its argument reaches a terminal scoring state. Safe to
-- call for an unknown id (no-op).
create or replace function complete_scoring_job(p_argument_id uuid)
returns void
language sql
as $$
  delete from scoring_jobs where argument_id = p_argument_id;
$$;

-- ── RLS ──────────────────────────────────────────────────
-- This is a system-internal queue: every reader/writer is a server route using
-- the service-role client, which BYPASSES RLS. Enable RLS with NO policies so
-- the anon/auth client is denied all access by default. Safe to run twice.
alter table scoring_jobs enable row level security;
