-- Expose player ids in public_debate_feed so the feed can hide debates that
-- involve a user the viewer has blocked (deferred follow-up from migration
-- 0007's block feature).
--
-- WHY: app/debates/page.tsx renders usernames only and the view never exposed
-- player_a_id / player_b_id, so there was no key to filter blocked users on.
-- This recreates the view WITH those two id columns added; every existing
-- column is preserved unchanged (same names, same order, then the two new ids
-- appended), so the feed page keeps working whether or not the page-side
-- filtering has shipped.
--
-- DROP + CREATE (not CREATE OR REPLACE) for the same reason as 0013: the live
-- view's exact shape may differ, and DROP + CREATE always applies cleanly and
-- stays safe to run twice.
--
-- Apply in the Supabase SQL editor. Idempotent.

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
  fc.fallacy_name                          as top_fallacy,
  d.player_a_id                            as player_a_id,
  d.player_b_id                            as player_b_id
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
