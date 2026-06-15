-- Bug 8: race-safe ranked matchmaking.
--
-- Replaces the app-side read → insert → claim flow (which had a window where
-- two concurrent callers could pick each other, create duplicate debates, and
-- partially claim queue rows) with a single atomic transaction that locks two
-- waiting rows using FOR UPDATE SKIP LOCKED.
--
-- Apply in the Supabase SQL editor. Called from lib/matchmaking.ts via
-- supabase.rpc("match_player", { p_user_id }).

create or replace function match_player(p_user_id uuid)
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
  select * into me
  from matchmaking_queue
  where user_id = p_user_id and status = 'waiting'
  for update skip locked;

  if not found then
    select matched_debate_id into new_debate_id
    from matchmaking_queue
    where user_id = p_user_id and status = 'matched';
    return new_debate_id;
  end if;

  my_wait_s := extract(epoch from (now() - coalesce(me.joined_at, now())));

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
  for update skip locked;

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
    current_turn, current_round, total_rounds, is_public, turn_started_at
  ) values (
    topic_id, player_a, player_b, 'FOR', 'ranked', 'active',
    player_a, 1, 3, true, now()
  )
  returning id into new_debate_id;

  update matchmaking_queue
  set status = 'matched', matched_debate_id = new_debate_id
  where user_id in (p_user_id, opp.user_id);

  return new_debate_id;
end;
$$;
