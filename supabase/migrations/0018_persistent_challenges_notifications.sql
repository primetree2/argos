-- Persistent (reusable) challenges + in-app notifications
-- (ROADMAP 2.4 item 2).
--
-- Evolves `challenges` from single-shot (open -> accepted -> dead) into a
-- creator-owned, reusable artifact, and adds a lightweight in-app notification
-- system so the creator is told (in-app, no email) when someone joins.
--
-- Apply in the Supabase SQL editor. FULLY IDEMPOTENT + ADDITIVE — safe to run
-- twice. The app is fully runnable BEFORE or AFTER this migration: the
-- notification helper is fail-open (no-op if the table is absent) and the
-- routes set the new columns best-effort.

-- ── 1. Persistent challenge columns ───────────────────────────
alter table challenges add column if not exists reusable boolean not null default false;
alter table challenges add column if not exists rounds   integer not null default 3;
alter table challenges add column if not exists blitz    boolean not null default false;

-- ── 2. In-app notifications ──────────────────────────────────
create table if not exists notifications (
  id            uuid primary key default gen_random_uuid(),
  recipient_id  uuid not null references users(id) on delete cascade,
  type          text not null,                 -- e.g. 'challenge_join'
  title         text not null,
  body          text,
  link          text,                          -- in-app path, e.g. /debate/<id>
  read          boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists idx_notifications_recipient
  on notifications(recipient_id, read, created_at desc);

-- RLS: a user may read + update (mark read) ONLY their own notifications.
-- Inserts come from the service role (accept route) and the trigger below,
-- which bypass RLS, so no INSERT policy is needed for end users.
alter table notifications enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'notifications_select_own') then
    create policy notifications_select_own on notifications
      for select using (recipient_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'notifications_update_own') then
    create policy notifications_update_own on notifications
      for update using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
  end if;
end $$;

-- ── 3. Reopen reusable challenges when their debate completes ──────────
-- When a debate finishes, any reusable challenge that spawned it flips back to
-- 'open' (and clears debate_id) so it can be joined again. Non-reusable
-- challenges are left 'accepted' (current behaviour, unchanged). Pure DB-side
-- so it fires regardless of which path completes the debate.
create or replace function reopen_reusable_challenge()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.status = 'completed' and (old.status is distinct from 'completed') then
    update challenges
    set status = 'open', debate_id = null
    where debate_id = new.id
      and reusable = true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reopen_reusable_challenge on debates;
create trigger trg_reopen_reusable_challenge
  after update of status on debates
  for each row
  execute function reopen_reusable_challenge();
