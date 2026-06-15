-- Race-safe argument submission + turn advancement.
--
-- Previously the client inserted the argument row and then issued a separate
-- PATCH to advance current_turn/current_round/status. Two writers (the live
-- player and the auto-forfeit cron, or a double-submit) could each insert an
-- argument and both pass the `status = 'active'` guard, advancing the round
-- twice or pushing to `scoring` with the wrong argument count.
--
-- This function performs the insert + advance in a single transaction, locking
-- the debate row FOR UPDATE so concurrent submissions serialize. It is the
-- single authority for turn/round progression.
--
-- Apply in the Supabase SQL editor. Called from /api/debates/[id]/argument via
-- supabase.rpc("submit_argument", { ... }).
--
-- Returns the new argument's id, or raises on any rule violation so the caller
-- can surface a clean error.

create or replace function submit_argument(
  p_debate_id uuid,
  p_user_id   uuid,
  p_content   text
)
returns uuid
language plpgsql
security definer
as $$
declare
  d              record;
  v_arg_id       uuid;
  v_round_count  int;
  v_opponent     uuid;
  v_is_last_arg  boolean;
  v_is_last_round boolean;
  v_next_round   int;
  v_next_status  text;
begin
  -- Lock the debate row so concurrent submissions serialize.
  select * into d
  from debates
  where id = p_debate_id
  for update;

  if not found then
    raise exception 'debate_not_found';
  end if;

  if d.status <> 'active' then
    raise exception 'debate_not_active';
  end if;

  if p_user_id <> d.player_a_id and p_user_id <> d.player_b_id then
    raise exception 'not_a_participant';
  end if;

  -- Must be the submitting player's turn.
  if d.current_turn is distinct from p_user_id then
    raise exception 'not_your_turn';
  end if;

  -- One argument per player per round. Guards against double-submit.
  if exists (
    select 1 from arguments
    where debate_id = p_debate_id
      and user_id = p_user_id
      and round_number = d.current_round
  ) then
    raise exception 'already_submitted_this_round';
  end if;

  insert into arguments (debate_id, user_id, round_number, content, scoring_status)
  values (p_debate_id, p_user_id, d.current_round, p_content, 'pending')
  returning id into v_arg_id;

  -- Authoritative count for this round (includes the row just inserted).
  select count(*) into v_round_count
  from arguments
  where debate_id = p_debate_id
    and round_number = d.current_round;

  v_opponent := case when d.player_a_id = p_user_id then d.player_b_id else d.player_a_id end;
  v_is_last_arg := v_round_count >= 2;
  v_is_last_round := d.current_round >= d.total_rounds;
  v_next_round := case when v_is_last_arg then d.current_round + 1 else d.current_round end;
  v_next_status := case when v_is_last_arg and v_is_last_round then 'scoring' else 'active' end;

  update debates
  set current_turn = v_opponent,
      current_round = v_next_round,
      status = v_next_status,
      turn_started_at = now()
  where id = p_debate_id;

  return v_arg_id;
end;
$$;
