-- Explicit RLS read policies for debates + arguments (deep-dive hardening).
--
-- WHY: the debate read paths (server page + GET /api/debates/[id]) use the
-- anon/SSR Supabase client, and the live DebateRoom subscribes to Realtime with
-- the browser client. All of those are governed by RLS. The application now
-- also enforces visibility (lib/debates/visibility.ts), but the DB boundary
-- must hold on its own: a private debate must not be selectable by a
-- non-participant, and an argument must not be selectable unless its debate is
-- public or the caller is a participant.
--
-- This only constrains SELECT for the anon/auth roles. All server-side writes
-- use the SERVICE ROLE key (crons, /api/score, finalize, submit_argument),
-- which bypasses RLS, so no legitimate write path is affected.
--
-- Apply in the Supabase SQL editor. Idempotent + safe to run twice.

alter table debates  enable row level security;
alter table arguments enable row level security;

-- ── debates: public OR participant may read ────────────────────────────────
drop policy if exists debates_select_visible on debates;
create policy debates_select_visible on debates
  for select
  using (
    coalesce(is_public, true) = true
    or player_a_id = auth.uid()
    or player_b_id = auth.uid()
  );

-- ── arguments: readable when the parent debate is visible to the caller ────
drop policy if exists arguments_select_visible on arguments;
create policy arguments_select_visible on arguments
  for select
  using (
    exists (
      select 1 from debates d
      where d.id = arguments.debate_id
        and (
          coalesce(d.is_public, true) = true
          or d.player_a_id = auth.uid()
          or d.player_b_id = auth.uid()
        )
    )
  );
