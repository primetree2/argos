-- Blitz mode (ROADMAP Phase 3, item 3).
--
-- A Blitz debate runs short turns (90s) instead of the default 10 minutes, for
-- a fast, instant-dopamine loop. This is a turn-SPEED dimension, orthogonal to
-- mode ('ranked' | 'casual'): a debate can be ranked-blitz, casual-blitz, etc.
--
-- We add a single nullable boolean. Existing rows default to false (standard
-- 10-minute turns), so nothing changes for debates already in flight.
--
-- Apply in the Supabase SQL editor. Additive + idempotent (safe to run twice).

alter table debates add column if not exists blitz boolean default false;
