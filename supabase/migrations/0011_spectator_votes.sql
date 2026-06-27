-- Audience voting (ROADMAP Phase 3, item 2).
--
-- Spectators (and anyone viewing) vote per round for the side they think is
-- winning — shown alongside the Oracle's verdict as "Crowd 73% / 27%". This is
-- a big engagement multiplier on top of spectator mode.
--
-- One vote per (debate_id, user_id, round_number); re-voting the same side
-- removes it (toggle), voting the other side switches it. side is the literal
-- 'player_a' | 'player_b' so it is independent of FOR/AGAINST orientation.
--
-- Apply in the Supabase SQL editor. Idempotent (safe to run twice).

create table if not exists spectator_votes (
  id            uuid primary key default gen_random_uuid(),
  debate_id     uuid not null references debates(id) on delete cascade,
  user_id       uuid not null references users(id),
  round_number  integer not null,
  side          text not null,   -- 'player_a' | 'player_b'
  created_at    timestamptz default now(),
  unique (debate_id, user_id, round_number)
);

create index if not exists idx_spectator_votes_debate on spectator_votes(debate_id);

-- ── RLS ──────────────────────────────────────────────────
-- Tallies are public (anyone can read); a user may write only their own vote.
alter table spectator_votes enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'spectator_votes_select_all') then
    create policy spectator_votes_select_all on spectator_votes
      for select using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'spectator_votes_write_own') then
    create policy spectator_votes_write_own on spectator_votes
      for all using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;
