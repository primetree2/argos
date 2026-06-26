-- Rate limiting + anti-Sybil flagging (ROADMAP Phase 1, item 5).
--
-- Two cheap, free, DB-backed safety mechanisms:
--   1. check_rate_limit(): a per-key fixed-window counter used to throttle
--      hot endpoints (/api/score self-heal, /api/matchmaking) across all
--      serverless instances without Redis.
--   2. Sybil flagging: store a HASH of the signup IP on users and flag any
--      debate whose two players share that hash. This is a soft signal for a
--      future review queue — it never auto-bans or blocks play.
--
-- Apply in the Supabase SQL editor. Idempotent.

-- ── 1. Rate limiting ─────────────────────────────────────────────────────
create table if not exists rate_limits (
  key            text primary key,   -- e.g. 'mm:<user_id>' or 'score:<user_id>'
  count          integer not null default 0,
  window_started timestamptz not null default now()
);

-- Atomically increment the bucket for `p_key` and report whether the caller is
-- within `p_limit` requests per `p_window_seconds`. If the current window has
-- elapsed, the bucket resets. Returns true when the request is ALLOWED.
create or replace function check_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
as $$
declare
  v_count   integer;
  v_started timestamptz;
begin
  insert into rate_limits (key, count, window_started)
  values (p_key, 1, now())
  on conflict (key) do update
    set
      count = case
        when rate_limits.window_started < now() - make_interval(secs => p_window_seconds)
          then 1
        else rate_limits.count + 1
      end,
      window_started = case
        when rate_limits.window_started < now() - make_interval(secs => p_window_seconds)
          then now()
        else rate_limits.window_started
      end
  returning count, window_started into v_count, v_started;

  return v_count <= p_limit;
end;
$$;

-- ── 2. Anti-Sybil flagging ───────────────────────────────────────────
alter table users   add column if not exists signup_ip_hash text;
alter table debates add column if not exists suspected_sybil boolean default false;

create index if not exists idx_users_signup_ip_hash
  on users(signup_ip_hash)
  where signup_ip_hash is not null;

-- Flag a debate if both players signed up from the same hashed IP. Soft signal
-- only; sets debates.suspected_sybil = true for the review queue.
create or replace function flag_sybil_debate(p_debate_id uuid)
returns void
language plpgsql
as $$
declare
  v_a_hash text;
  v_b_hash text;
  v_a uuid;
  v_b uuid;
begin
  select player_a_id, player_b_id into v_a, v_b
  from debates where id = p_debate_id;

  if v_a is null or v_b is null then
    return;
  end if;

  select signup_ip_hash into v_a_hash from users where id = v_a;
  select signup_ip_hash into v_b_hash from users where id = v_b;

  if v_a_hash is not null and v_a_hash = v_b_hash then
    update debates set suspected_sybil = true where id = p_debate_id;
  end if;
end;
$$;
