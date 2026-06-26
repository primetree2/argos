-- vs Oracle AI mode (ROADMAP Phase 1, item 2).
--
-- AI debates need a real users row to satisfy the debates.player_b_id and
-- arguments.user_id foreign keys. We seed ONE fixed-UUID system user, "The
-- Oracle", and reuse it as player_b for every vs-AI debate. Its email/username
-- are reserved so a human can never register as it.
--
-- The fixed UUID is referenced from app code as ORACLE_USER_ID. Do NOT change
-- it without updating lib/ai/oracle.ts.
--
-- Apply in the Supabase SQL editor. Idempotent (ON CONFLICT DO NOTHING).

insert into users (id, username, email, elo_rating)
values (
  '00000000-0000-0000-0000-0000000000a1',
  'Oracle',
  'oracle@argos.system',
  1500
)
on conflict (id) do nothing;

-- Count how many vs-AI debates a user created in the last 24h. Used by the
-- create route to cap free AI usage (protects the Gemini free-tier quota).
-- An AI debate is any debate whose player_b_id is the Oracle system user.
create or replace function oracle_debates_today(p_user_id uuid)
returns int
language sql
stable
as $$
  select count(*)::int
  from debates
  where player_a_id = p_user_id
    and player_b_id = '00000000-0000-0000-0000-0000000000a1'
    and created_at >= now() - interval '24 hours';
$$;
