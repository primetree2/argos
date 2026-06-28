-- Player country (Quick Match country flags).
--
-- Opponents in Quick Match / Find-an-Opponent (and spectators on the Live page)
-- can see each other's country with a flag icon. We store a single nullable
-- ISO 3166-1 alpha-2 country code on the user row (e.g. 'US', 'GB', 'PK').
-- It is populated best-effort from the edge geo header at matchmaking time
-- (see lib/safety/country.ts → backfillCountry), first-sight only, and is never
-- required — a null country simply renders no flag.
--
-- Apply in the Supabase SQL editor. Additive + idempotent (safe to run twice).

alter table users add column if not exists country text;
