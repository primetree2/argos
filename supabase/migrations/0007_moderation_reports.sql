-- Trust & safety: user reports + blocks (ROADMAP Phase 1, item 3).
--
-- Adds two tables and wires mutual-block exclusion into matchmaking. This is
-- the minimum safety layer required before any public growth push: a way for
-- users to flag bad content and to avoid specific opponents.
--
-- Apply in the Supabase SQL editor. Idempotent.

-- ── reports ───────────────────────────────────────────────────────────────
-- A user-submitted flag against an argument and/or a user. reason is a short
-- enum-like string; details is optional free text. status lets a future
-- moderation queue triage them.
create table if not exists reports (
  id            uuid primary key default gen_random_uuid(),
  reporter_id   uuid not null references users(id),
  argument_id   uuid references arguments(id),
  reported_user uuid references users(id),
  reason        text not null,            -- harassment | hate | spam | other
  details       text,
  status        text not null default 'open', -- open | reviewing | actioned | dismissed
  created_at    timestamptz default now()
);

create index if not exists idx_reports_status on reports(status);
create index if not exists idx_reports_argument on reports(argument_id);

-- ── user_blocks ───────────────────────────────────────────────────────────
-- blocker_id chose to block blocked_id. One row per direction; a pair may have
-- two rows. UNIQUE prevents duplicates.
create table if not exists user_blocks (
  id          uuid primary key default gen_random_uuid(),
  blocker_id  uuid not null references users(id),
  blocked_id  uuid not null references users(id),
  created_at  timestamptz default now(),
  unique (blocker_id, blocked_id)
);

create index if not exists idx_user_blocks_blocker on user_blocks(blocker_id);
create index if not exists idx_user_blocks_blocked on user_blocks(blocked_id);

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table reports enable row level security;
alter table user_blocks enable row level security;

-- A user may insert a report as themselves and read only their own reports.
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'reports_insert_own') then
    create policy reports_insert_own on reports
      for insert with check (reporter_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'reports_select_own') then
    create policy reports_select_own on reports
      for select using (reporter_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where policyname = 'blocks_all_own') then
    create policy blocks_all_own on user_blocks
      for all using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());
  end if;
end $$;

-- ── helper: do two users block each other (either direction)? ──────────────
create or replace function users_block_each_other(a uuid, b uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from user_blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

-- ── matchmaking: never pair two users who have blocked each other ──────────
-- Re-create match_player with the same body as 0004 plus a block-exclusion
-- predicate on the opponent search. Everything else is unchanged.
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

  select * into opp
  from matchmaking_queue q
  where q.status = 'waiting'
    and q.user_id <> p_user_id
    and not users_block_each_other(p_user_id, q.user_id)
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
