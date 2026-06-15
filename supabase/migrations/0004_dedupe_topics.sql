-- Stop matchmaking from creating a fresh topics row on every match.
--
-- Previously match_player did an unconditional INSERT into topics for the
-- chosen title, so the table grew unboundedly with duplicates. This migration:
--   1. De-duplicates existing topics by title, repointing debates/challenges
--      to a single surviving row per title, then deletes the orphans.
--   2. Adds a UNIQUE constraint on topics.title.
--   3. Replaces match_player so it reuses an existing topic (insert ... on
--      conflict do nothing, then select), instead of always inserting.
--
-- Apply in the Supabase SQL editor. Safe to run once; the de-dup + constraint
-- steps are guarded so re-running does not error.

-- ── 1. De-duplicate existing topics by title ──────────────────────────────
do $$
begin
  -- Build a map of duplicate title -> surviving (lowest id) topic id, and
  -- repoint referencing rows before deleting the extras.
  with ranked as (
    select id, title,
           first_value(id) over (partition by title order by id) as keep_id
    from topics
  ),
  dupes as (
    select id, keep_id from ranked where id <> keep_id
  )
  update debates d
  set topic_id = dupes.keep_id
  from dupes
  where d.topic_id = dupes.id;

  with ranked as (
    select id, title,
           first_value(id) over (partition by title order by id) as keep_id
    from topics
  ),
  dupes as (
    select id, keep_id from ranked where id <> keep_id
  )
  update challenges c
  set topic_id = dupes.keep_id
  from dupes
  where c.topic_id = dupes.id;

  with ranked as (
    select id, title,
           first_value(id) over (partition by title order by id) as keep_id
    from topics
  )
  delete from topics t
  using ranked
  where t.id = ranked.id and ranked.id <> ranked.keep_id;
end $$;

-- ── 2. Add the unique constraint (idempotent) ─────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'topics_title_unique'
  ) then
    alter table topics add constraint topics_title_unique unique (title);
  end if;
end $$;

-- ── 3. Reuse existing topics in matchmaking ───────────────────────────────
create or replace function match_player(p_user_id uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  me            record;
  opp           record;
  my_wait_s     numeric;
  v_topic_id    uuid;
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

  -- Both players must be within tolerance of each other (least, not greatest).
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

  -- Reuse the existing topic row for this title if present; otherwise create
  -- it once. Relies on the unique(title) constraint added above.
  insert into topics (title, category, source)
  values (chosen_topic, null, 'matchmaking')
  on conflict (title) do nothing;

  select id into v_topic_id from topics where title = chosen_topic;

  if p_user_id < opp.user_id then
    player_a := p_user_id; player_b := opp.user_id;
  else
    player_a := opp.user_id; player_b := p_user_id;
  end if;

  insert into debates (
    topic_id, player_a_id, player_b_id, player_a_side, mode, status,
    current_turn, current_round, total_rounds, is_public, turn_started_at
  ) values (
    v_topic_id, player_a, player_b, 'FOR', 'ranked', 'active',
    player_a, 1, 3, true, now()
  )
  returning id into new_debate_id;

  update matchmaking_queue
  set status = 'matched', matched_debate_id = new_debate_id
  where user_id in (p_user_id, opp.user_id);

  return new_debate_id;
end;
$$;
