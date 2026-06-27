-- Reproducible `public_debate_feed` view (deep-dive hardening).
--
-- WHY: app/debates/page.tsx selects from `public_debate_feed`, but no tracked
-- migration created it — it lived only in the deployed Supabase project. A fresh
-- setup from this repo would hit a runtime error on /debates. This migration
-- makes the schema self-contained and reproducible.
--
-- The view exposes one row per COMPLETED, PUBLIC debate with the exact columns
-- the feed page reads:
--   id, created_at, side_a, topic_title, category, player_a, player_b,
--   winner, score_a, score_b, arg_count, top_fallacy
-- Player columns are USERNAMES (the page renders them directly); winner is the
-- winner's username (NULL for a draw). score_a/score_b are the summed argument
-- score_total per player. top_fallacy is the most frequent fallacy name across
-- the debate's arguments (NULL if none).
--
-- Apply in the Supabase SQL editor. We DROP then CREATE (rather than CREATE OR
-- REPLACE) because the live view was created out-of-band and its exact column
-- order/types are unknown; CREATE OR REPLACE errors if those differ, whereas
-- DROP + CREATE always applies cleanly and stays safe to run twice.
--
-- NOTE: a view's reads are still subject to the underlying tables' RLS for the
-- querying role. The feed only surfaces public + completed debates, matching
-- the debates_select_visible policy (migration 0012).

drop view if exists public_debate_feed;

create view public_debate_feed as
with arg_scores as (
  select
    a.debate_id,
    a.user_id,
    sum(coalesce(a.score_total, 0)) as score_sum,
    count(*)                        as arg_count
  from arguments a
  group by a.debate_id, a.user_id
),
fallacy_counts as (
  -- Flatten fallacies_found (jsonb array of { name, quote, explanation }) and
  -- rank the most common fallacy name per debate.
  select
    a.debate_id,
    f.value ->> 'name' as fallacy_name,
    count(*)           as n,
    row_number() over (
      partition by a.debate_id
      order by count(*) desc, (f.value ->> 'name')
    ) as rnk
  from arguments a
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(coalesce(a.fallacies_found, '[]'::jsonb)) = 'array'
        then a.fallacies_found
      else '[]'::jsonb
    end
  ) as f(value)
  where (f.value ->> 'name') is not null
  group by a.debate_id, f.value ->> 'name'
)
select
  d.id,
  d.created_at,
  d.player_a_side                          as side_a,
  t.title                                  as topic_title,
  t.category                               as category,
  ua.username                              as player_a,
  ub.username                              as player_b,
  uw.username                              as winner,
  coalesce(sa.score_sum, 0)                as score_a,
  coalesce(sb.score_sum, 0)                as score_b,
  coalesce(sa.arg_count, 0) + coalesce(sb.arg_count, 0) as arg_count,
  fc.fallacy_name                          as top_fallacy
from debates d
join topics t            on t.id = d.topic_id
left join users ua       on ua.id = d.player_a_id
left join users ub       on ub.id = d.player_b_id
left join users uw       on uw.id = d.winner_id
left join arg_scores sa  on sa.debate_id = d.id and sa.user_id = d.player_a_id
left join arg_scores sb  on sb.debate_id = d.id and sb.user_id = d.player_b_id
left join fallacy_counts fc on fc.debate_id = d.id and fc.rnk = 1
where d.status = 'completed'
  and coalesce(d.is_public, true) = true;
