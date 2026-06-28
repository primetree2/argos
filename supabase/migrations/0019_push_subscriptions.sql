-- Web push subscriptions (ROADMAP 2.4 item 3 — free web push / PWA).
--
-- Stores a browser PushSubscription per user/endpoint so the server can send
-- web-push notifications ("someone joined your challenge", "your turn"). The
-- whole push layer is FAIL-OPEN: the app is fully runnable BEFORE or AFTER this
-- migration, and BEFORE or AFTER the `web-push` package / VAPID keys exist.
--
-- Apply in the Supabase SQL editor. FULLY IDEMPOTENT + ADDITIVE — safe to run
-- twice.

create table if not exists push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  endpoint    text not null unique,           -- the browser push endpoint URL
  p256dh      text not null,                  -- subscription public key
  auth        text not null,                  -- subscription auth secret
  user_agent  text,                           -- best-effort, for debugging
  created_at  timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_user
  on push_subscriptions(user_id);

-- RLS: a user may read + delete ONLY their own subscriptions. Inserts/upserts
-- and server-side sends go through the service role (which bypasses RLS), so no
-- INSERT policy is needed for end users.
alter table push_subscriptions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'push_subscriptions_select_own') then
    create policy push_subscriptions_select_own on push_subscriptions
      for select using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'push_subscriptions_delete_own') then
    create policy push_subscriptions_delete_own on push_subscriptions
      for delete using (user_id = auth.uid());
  end if;
end $$;
