-- Phase 5 monetization plumbing (ROADMAP Phase 5 FREE items 1-2).
--
-- Builds the foundation for a future paywall WITHOUT charging anyone yet:
--   1. users.is_pro  — a boolean flag the app reads to gate Pro features.
--                       Defaults false; everyone is treated as unlimited
--                       during beta via the app-layer BETA_UNLIMITED switch
--                       (lib/billing/limits.ts), so this flag is inert until
--                       the beta switch is turned off.
--   2. daily_usage   — a durable, per-user / per-action / per-UTC-day counter
--                       so metered limits survive across serverless instances
--                       (no Redis). record_usage() increments + returns the
--                       new count; usage_today() reads it without incrementing.
--
-- Apply in the Supabase SQL editor. Fully idempotent — safe to run twice.

-- ── 1. Pro flag ───────────────────────────────────────────────
alter table users add column if not exists is_pro boolean not null default false;

-- ── 2. Durable usage metering ─────────────────────────────────
create table if not exists daily_usage (
  user_id  uuid not null references users(id),
  action   text not null,            -- e.g. 'debate_create' | 'oracle_debate' | 'ranked_match'
  day      date not null default (now() at time zone 'utc')::date,
  count    integer not null default 0,
  primary key (user_id, action, day)
);

create index if not exists idx_daily_usage_day on daily_usage(day);

-- Atomically increment today's counter for (user, action) and return the new
-- total. UTC day boundary matches the rest of the app (daily topic, caps).
create or replace function record_usage(p_user_id uuid, p_action text)
returns integer
language plpgsql
as $$
declare
  v_count integer;
  v_day   date := (now() at time zone 'utc')::date;
begin
  insert into daily_usage (user_id, action, day, count)
  values (p_user_id, p_action, v_day, 1)
  on conflict (user_id, action, day) do update
    set count = daily_usage.count + 1
  returning count into v_count;

  return v_count;
end;
$$;

-- Read today's counter WITHOUT incrementing (returns 0 when absent).
create or replace function usage_today(p_user_id uuid, p_action text)
returns integer
language plpgsql
as $$
declare
  v_count integer;
  v_day   date := (now() at time zone 'utc')::date;
begin
  select count into v_count
  from daily_usage
  where user_id = p_user_id and action = p_action and day = v_day;

  return coalesce(v_count, 0);
end;
$$;
