-- Performance indexes (PROJECT.md section 5 — previously unapplied).
--
-- These back the hottest access paths: debate room hydration, the public feed,
-- finalizeIfComplete's per-debate argument scan, the leaderboard, and the new
-- maintenance requeue step which filters arguments by scoring_status.
--
-- Apply in the Supabase SQL editor. All are IF NOT EXISTS so re-running is safe.

create index if not exists idx_debates_player_a on debates(player_a_id);
create index if not exists idx_debates_player_b on debates(player_b_id);
create index if not exists idx_debates_status   on debates(status);
create index if not exists idx_arguments_debate  on arguments(debate_id);
create index if not exists idx_users_elo         on users(elo_rating desc);

-- Supports the maintenance requeue step: find arguments stuck in a non-terminal
-- scoring state. Partial index keeps it tiny (only pending/scoring rows).
create index if not exists idx_arguments_scoring_status
  on arguments(scoring_status)
  where scoring_status in ('pending', 'scoring');
