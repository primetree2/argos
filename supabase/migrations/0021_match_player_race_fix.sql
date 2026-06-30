-- 0021: Race-proof matchmaking pairing (Quick Match + Find Opponent).
--
-- BUG
-- ---
-- Two players who joined the queue at nearly the same instant could BOTH fail
-- to be paired. `match_player` (0002) and `match_player_v2` (0014) each:
--   1. locked the CALLER's own queue row with `for update skip locked`, then
--   2. searched for a waiting opponent ALSO with `for update skip locked`.
--
-- When phone A and phone B call their RPC concurrently, A holds the lock on
-- row A and B holds the lock on row B. A's opponent search then SKIPS the
-- locked row B, and B's search SKIPS the locked row A -> both find no
-- opponent and return null, leaving both `waiting`. This is exactly the
-- "clicked Quick Match on two phones, never paired" symptom; "Find Opponent"
-- usually worked only because the two taps were staggered enough that one tx
-- committed before the other searched.
--
-- FIX
-- ---
-- A single shared core, `_match_player_core(p_user_id, p_blitz)`, that:
--   * locks the caller's own row with `skip locked` (unchanged — still guards
--     against the SAME caller double-running concurrently),
--   * takes a TRANSACTION-LEVEL advisory lock keyed on a stable hash so that
--     concurrent matchers SERIALIZE through the pairing critical section
--     instead of mutually skipping each other's locked rows, and
--   * selects the opponent with a BLOCKING `for update` (NOT skip locked), so
--     a row that is merely lock-held by its own in-flight matcher is waited
--     for, not skipped.
--
-- `match_player` and `match_player_v2` are thin wrappers over the core so the
-- two entry points can never drift again (the v1/v2 duplication was how this
-- bug ended up living in two places).
--
-- Race-safety is preserved end to end: the advisory lock serializes the
-- critical section, the own-row `skip locked` claim prevents a single caller
-- racing itself, and both queue rows are still claimed atomically in one
-- transaction. Idempotent (`create or replace`) — SAFE TO RUN TWICE.
--
-- Apply in the Supabase SQL editor.

create or replace function _match_player_core(p_user_id uuid, p_blitz boolean default false)
returns uuid
language plpgsql
security definer
as $$
declare
  me            record;
  opp           record;
  my_wait_s     numeric;
  topic_id      uuid;
  player_a      uuid;
  player_b      uuid;
  new_debate_id uuid;
  topic_choices text[] := array[
    'Social media does more harm than good',
    'AI will eliminate more jobs than it creates',
    'Universal basic income should be implemented globally',
    'Space exploration is worth the cost',
    'Free will is an illusion',
    'Remote work is better than office work',
    'Nuclear energy is essential to fighting climate change'
  ];
  chosen_topic  text;
begin
  -- Serialize the whole pairing critical section. A single, fixed advisory
  -- key means at most one matcher runs the candidate search + claim at a
  -- time, so two simultaneous callers can never mutually skip each other.
  -- Transaction-scoped: auto-released on commit/rollback. The constant is
  -- arbitrary but stable ('argos.matchmaking').
  perform pg_advisory_xact_lock(hashtext('argos.matchmaking'));

  -- Claim our own waiting row. `skip locked` here only guards against the
  -- SAME user's request racing itself; under the advisory lock there is no
  -- contention from OTHER matchers at this point.
  select * into me
  from matchmaking_queue
  where user_id = p_user_id and status = 'waiting'
  for update skip locked;

  if not found then
    -- Idempotent recovery: if we were already matched (e.g. by the opponent's
    -- matcher), return that debate so the poller navigates into it.
    select matched_debate_id into new_debate_id
    from matchmaking_queue
    where user_id = p_user_id and status = 'matched';
    return new_debate_id;
  end if;

  my_wait_s := extract(epoch from (now() - coalesce(me.joined_at, now())));

  -- Find the closest-Elo waiting opponent within the wait-widened band.
  -- BLOCKING `for update` (NOT skip locked): if the candidate is briefly
  -- lock-held by its own matcher we WAIT for it rather than skipping it.
  -- The advisory lock above means that wait is bounded and deadlock-free.
  select * into opp
  from matchmaking_queue q
  where q.status = 'waiting'
    and q.user_id <> p_user_id
    and (
      abs(coalesce(q.elo_rating, 1200) - coalesce(me.elo_rating, 1200)) <=
      least(
        case
          when my_wait_s <= 60 then 200
          when my_wait_s <= 180 then 500
          else 'infinity'::numeric
        end,
        case
          when extract(epoch from (now() - coalesce(q.joined_at, now()))) <= 60 then 200
          when extract(epoch from (now() - coalesce(q.joined_at, now()))) <= 180 then 500
          else 'infinity'::numeric
        end
      )
    )
  order by abs(coalesce(q.elo_rating, 1200) - coalesce(me.elo_rating, 1200)) asc
  limit 1
  for update;

  if not found then
    return null;
  end if;

  chosen_topic := topic_choices[1 + floor(random() * array_length(topic_choices, 1))::int];
  insert into topics (title, category, source)
  values (chosen_topic, null, 'matchmaking')
  returning id into topic_id;

  if p_user_id < opp.user_id then
    player_a := p_user_id; player_b := opp.user_id;
  else
    player_a := opp.user_id; player_b := p_user_id;
  end if;

  insert into debates (
    topic_id, player_a_id, player_b_id, player_a_side, mode, status,
    current_turn, current_round, total_rounds, is_public, turn_started_at, blitz
  ) values (
    topic_id, player_a, player_b, 'FOR', 'ranked', 'active',
    player_a, 1, 3, true, now(), coalesce(p_blitz, false)
  )
  returning id into new_debate_id;

  update matchmaking_queue
  set status = 'matched', matched_debate_id = new_debate_id
  where user_id in (p_user_id, opp.user_id);

  return new_debate_id;
end;
$$;

-- Thin wrappers so both entry points share one implementation and can never
-- drift. The app calls match_player_v2 for Quick Match (blitz) and falls back
-- to match_player otherwise (lib/matchmaking.ts).
create or replace function match_player_v2(p_user_id uuid, p_blitz boolean default false)
returns uuid
language sql
security definer
as $$
  select _match_player_core(p_user_id, coalesce(p_blitz, false));
$$;

create or replace function match_player(p_user_id uuid)
returns uuid
language sql
security definer
as $$
  select _match_player_core(p_user_id, false);
$$;
