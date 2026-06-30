-- Account deletion (user-initiated "delete everything about me") — ANONYMIZING.
--
-- Provides delete_user_account(p_user_id uuid): a SECURITY DEFINER function
-- that removes everything PERSONAL to the user while PRESERVING the integrity
-- of debates their opponents took part in. The corresponding auth.users row is
-- deleted separately by the API route via the service-role admin API (the auth
-- schema is not touched here).
--
-- Anonymization model (vs. a hard cascade delete):
--   * A debate the user participated in is NOT deleted. Its shell, the
--     OPPONENT's arguments, scores and the opponent's Elo history all survive,
--     so the opponent keeps an intact record.
--   * The departing user's SEAT in those debates (player_a_id / player_b_id),
--     plus any current_turn / winner_id pointing at them, is reassigned to a
--     shared, fixed-UUID "Departed Orator" tombstone user. This keeps every
--     foreign key valid AND lets the UI still render an opponent name.
--   * The departing user's OWN content (their arguments, the reactions/votes
--     they cast, their Elo-history rows) IS deleted — it is theirs to remove.
--   * Everything keyed SOLELY to the user (challenges, matchmaking entry,
--     reports/blocks, notifications, push subscriptions, rate limits, usage)
--     is purged.
--
-- Design notes:
--   * SECURITY DEFINER so it runs with the owner's rights (bypasses RLS to
--     touch rows the calling user could not edit directly).
--   * Every optional-table touch is guarded with `to_regclass(...) is not null`
--     so the function applies cleanly whether or not the tables from migrations
--     0007-0019 exist. FULLY IDEMPOTENT — safe to run twice.
--
-- Apply in the Supabase SQL editor. IDEMPOTENT + ADDITIVE.

-- Seed the shared "Departed Orator" tombstone user (mirrors the Oracle seed in
-- 0006). Reused for every anonymized seat. Its email/username are reserved so a
-- human can never register as it. Do NOT change this UUID without updating the
-- DEPARTED_USER_ID constant in app code.
insert into users (id, username, email, elo_rating)
values (
  '00000000-0000-0000-0000-0000000000d1',
  'Departed Orator',
  'departed@argos.system',
  1200
)
on conflict (id) do nothing;

create or replace function delete_user_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tombstone uuid := '00000000-0000-0000-0000-0000000000d1';
  v_debate_ids uuid[];
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  -- Never anonymize the system users onto themselves.
  if p_user_id = v_tombstone then
    return;
  end if;

  -- Debates the user participated in (kept, but reassigned to the tombstone).
  select coalesce(array_agg(id), '{}')
    into v_debate_ids
    from debates
   where player_a_id = p_user_id or player_b_id = p_user_id;

  -- ── 1. Reassign the user's debate references to the tombstone ──
  -- Done BEFORE deleting the users row so the FKs never dangle.
  update debates set player_a_id  = v_tombstone where player_a_id  = p_user_id;
  update debates set player_b_id  = v_tombstone where player_b_id  = p_user_id;
  update debates set current_turn = v_tombstone where current_turn = p_user_id;
  update debates set winner_id    = v_tombstone where winner_id    = p_user_id;

  -- ── 2. Delete the user's OWN content (not the opponent's) ──

  -- Reactions cast BY this user (anywhere). Reactions by others on this user's
  -- arguments are removed below alongside those arguments.
  if to_regclass('public.argument_reactions') is not null then
    delete from argument_reactions where user_id = p_user_id;
    delete from argument_reactions
     where argument_id in (select id from arguments where user_id = p_user_id);
  end if;

  -- Spectator votes cast BY this user (anywhere).
  if to_regclass('public.spectator_votes') is not null then
    delete from spectator_votes where user_id = p_user_id;
  end if;

  -- Scoring jobs queued for this user's own arguments (0009).
  if to_regclass('public.scoring_jobs') is not null then
    delete from scoring_jobs
     where argument_id in (select id from arguments where user_id = p_user_id);
  end if;

  -- The user's own arguments. The opponent's arguments + all debate scores
  -- remain intact.
  delete from arguments where user_id = p_user_id;

  -- The user's own Elo-history rows. The opponent's Elo history for the same
  -- debates is preserved.
  if to_regclass('public.elo_history') is not null then
    delete from elo_history where user_id = p_user_id;
  end if;

  -- ── 3. Purge rows keyed SOLELY to the user ──

  -- Challenges created by the user.
  delete from challenges where creator_id = p_user_id;

  -- Matchmaking queue entry.
  if to_regclass('public.matchmaking_queue') is not null then
    delete from matchmaking_queue where user_id = p_user_id;
  end if;

  -- Trust & safety: reports + blocks in either direction (0007).
  if to_regclass('public.reports') is not null then
    delete from reports where reporter_id = p_user_id or reported_id = p_user_id;
  end if;
  if to_regclass('public.user_blocks') is not null then
    delete from user_blocks where blocker_id = p_user_id or blocked_id = p_user_id;
  end if;

  -- Notifications (0018).
  if to_regclass('public.notifications') is not null then
    delete from notifications where user_id = p_user_id;
  end if;

  -- Push subscriptions (0019).
  if to_regclass('public.push_subscriptions') is not null then
    delete from push_subscriptions where user_id = p_user_id;
  end if;

  -- Rate limits keyed by this user (0008) — best-effort, key shape is
  -- '<scope>:<user_id>'.
  if to_regclass('public.rate_limits') is not null then
    delete from rate_limits where key like '%' || p_user_id::text || '%';
  end if;

  -- Daily usage metering (0015).
  if to_regclass('public.daily_usage') is not null then
    delete from daily_usage where user_id = p_user_id;
  end if;

  -- ── 4. Finally, the public profile row ──
  -- All FKs to it have been reassigned (debates) or deleted above.
  delete from users where id = p_user_id;
end;
$$;
