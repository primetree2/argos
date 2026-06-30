# Argos — The Oracle Debate Arena

> *Iudex Artificialis. Veritas Aeterna.*
> Artificial judge. Eternal truth.

**Chess.com for debate.** Two players argue opposing sides of any topic in timed rounds. An AI judge scores every argument, names every logical fallacy it finds, and updates your Elo rating. The scorecards are shareable.

**Live:** [argos-indol.vercel.app](https://argos-indol.vercel.app)

---

## What it is

Argos is a competitive, turn-based debate platform with real-time AI judging. You pick a topic, invite an opponent, and argue your assigned side (FOR or AGAINST) across 2–5 rounds. After each argument, Gemini AI scores it across five dimensions and explicitly calls out any logical fallacies it detects — with the exact offending quote and a one-sentence explanation.

Your Elo rating rises and falls with every ranked match. The shareable result card is the viral mechanic.

---

## Features

- **AI Judge** — Google Gemini Flash scores every argument on Clarity, Evidence, Logic, and Rebuttal (max 80 pts)
- **Fallacy Detection** — 10 fallacy types detected, named, quoted, and penalised (Ad hominem, Straw man, False dichotomy, and 7 more)
- **Elo Rating** — Chess-style rating system, K=32 for new players, K=16 for veterans
- **Real-time** — Sequential turns: each argument appears on BOTH players' screens the instant it's submitted (so the opponent can read it before replying), with a chat-app "Opponent is typing…" indicator. Scores update live via Supabase Realtime — no refresh needed
- **Two modes** — Ranked (Elo affected) and Casual (no stakes)
- **Configurable rounds** — 2 to 5 rounds per debate
- **Shareable result cards** — OG image generated on completion, ready to post
- **Join by link** — Share a debate URL or paste one into the JOIN bar on any page
- **Dark / Light theme** — Full Oracle Terminal aesthetic in both modes

---

## Tech Stack

| Layer        | Technology                              |
|--------------|-----------------------------------------|
| Framework    | Next.js 16 (App Router)                 |
| Styling      | Tailwind CSS v4 + custom design system  |
| Components   | shadcn/ui                               |
| AI Judge     | Google Gemini Flash (`@google/generative-ai`) |
| Database     | Supabase (Postgres + RLS)               |
| ORM          | Drizzle ORM                             |
| Auth         | Supabase Auth (Google OAuth)            |
| Realtime     | Supabase Realtime                       |
| Deployment   | Vercel                                  |
| Monitoring   | Sentry + Posthog                        |
| Fonts        | Cinzel, Cinzel Decorative, Crimson Pro, Share Tech Mono |

---

## Getting Started

### Prerequisites
- Node.js 18+
- A Supabase project (free tier works)
- A Google AI Studio API key (free — [aistudio.google.com](https://aistudio.google.com))
- A Vercel account (free)

### 1. Clone and install

```bash
git clone https://github.com/yourusername/argos.git
cd argos
npm install
```

### 2. Set up environment variables

Create `.env.local` in the project root:

```bash
# AI — Google Gemini (free tier)
GEMINI_API_KEY=your_key_from_aistudio.google.com

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

> **Never commit `.env.local`.** It's in `.gitignore` by default.

### 3. Set up the database

Run the SQL schema in your Supabase SQL editor:

```sql
-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  elo_rating INTEGER DEFAULT 1200,
  debates_won INTEGER DEFAULT 0,
  debates_lost INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Topics
CREATE TABLE topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category TEXT,
  source TEXT DEFAULT 'user'
);

-- Debates
CREATE TABLE debates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID REFERENCES topics(id),
  player_a_id UUID REFERENCES users(id),
  player_b_id UUID REFERENCES users(id),
  player_a_side TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT DEFAULT 'waiting',
  current_turn UUID REFERENCES users(id),
  total_rounds INTEGER DEFAULT 3,
  current_round INTEGER DEFAULT 1,
  winner_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Arguments
CREATE TABLE arguments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id UUID REFERENCES debates(id),
  user_id UUID REFERENCES users(id),
  round_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  score_total INTEGER,
  score_clarity INTEGER,
  score_evidence INTEGER,
  score_logic INTEGER,
  score_rebuttal INTEGER,
  fallacy_penalty INTEGER DEFAULT 0,
  fallacies_found JSONB DEFAULT '[]',
  ai_feedback TEXT,
  scoring_status TEXT DEFAULT 'pending'
);

-- Elo history
CREATE TABLE elo_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  debate_id UUID REFERENCES debates(id),
  elo_before INTEGER,
  elo_after INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Challenges
CREATE TABLE challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES users(id),
  topic_id UUID REFERENCES topics(id),
  status TEXT DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT now()
);
```

Then enable Row Level Security on all tables (see `PROJECT.md` for full RLS policies).

Enable Supabase Realtime on the `debates` and `arguments` tables in your Supabase dashboard.

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 5. Deploy

```bash
# Push to GitHub, then connect repo to Vercel
# Add all .env.local variables to Vercel project settings
vercel --prod
```

---

## Background Jobs (Cron)

Argos relies on scheduled jobs for daily topic generation, turn timeouts (auto-forfeit), and stale/ghost debate cleanup.

Vercel's free **Hobby plan** allows a maximum of **2 cron jobs**, each able to run **at most once per day**. To stay within those limits, the jobs are configured in `vercel.json` as two daily crons:

| Schedule (UTC) | Endpoint                  | Purpose |
|----------------|---------------------------|---------|
| `0 0 * * *`    | `/api/cron/daily-topic`   | Generate the daily topic |
| `30 0 * * *`   | `/api/cron/maintenance`   | Auto-forfeit idle turns + cleanup waiting/ghost debates |

The `/api/cron/maintenance` route combines the auto-forfeit and cleanup logic into a single job.

### Near-real-time turn timeouts (optional)

Once-daily auto-forfeit is enough to prevent debates hanging forever, but turn timeouts will only be enforced during the daily run. For near-real-time enforcement without a paid Vercel plan, a GitHub Actions workflow (`.github/workflows/maintenance-cron.yml`) calls `/api/cron/maintenance` every 5 minutes.

To enable it, add the following under your GitHub repo **Settings → Secrets and variables → Actions**:

- **Secret** `CRON_SECRET` — must exactly match the `CRON_SECRET` env var set in your Vercel project.
- **Variable** `APP_URL` — your deployed base URL, e.g. `https://argos-indol.vercel.app` (a secret named `APP_URL` is also accepted as a fallback).

> Set `CRON_SECRET` in your Vercel project env too. Without it, the cron routes only accept Vercel's internal `x-vercel-cron` header and will reject the external GitHub call with `401`. GitHub scheduled runs are best-effort and may be delayed a few minutes; the daily Vercel cron remains a reliable backstop.

---

## How a Debate Works

1. **Create** — Choose a topic (write your own or pick from suggestions), select Casual or Ranked, pick 2–5 rounds
2. **Invite** — Share the debate link with your opponent (or paste their link into the JOIN bar)
3. **Argue** — You have 10 minutes per round to submit your argument
4. **Score** — The Oracle (Gemini AI) scores your argument in ~5 seconds after submission
5. **Result** — After all rounds, final scores are tallied, winner declared, Elo updated
6. **Share** — Copy the result card link and post it

---

## Scoring System

Each argument is scored out of **80 points**:

| Dimension       | Max | What's measured |
|-----------------|-----|-----------------|
| Clarity         | 20  | Is your position clearly stated? |
| Evidence        | 20  | Quality and relevance of your sources |
| Logic           | 20  | Do your conclusions follow from your premises? |
| Rebuttal        | 20  | Did you address your opponent's specific points? |
| Fallacy penalty | −15 | Deducted per fallacy detected |

### Fallacies detected
Ad hominem · Straw man · False dichotomy · Appeal to authority · Slippery slope · Cherry picking · Circular reasoning · Anecdotal evidence · Bandwagon · Moving goalposts

---

## Design System — Oracle Terminal

Argos uses a custom design system: **the Oracle Terminal**. The aesthetic is "an ancient debate institution that gained sentience and technology — gold leaf meets circuit boards."

- **Dark mode** — near-black void with burnished gold and neon teal accents
- **Light mode** — aged parchment with dark ink and muted gold
- **Typography** — Cinzel (Roman headings) + Crimson Pro (body) + Share Tech Mono (data)
- **Background** — animated SVG circuit traces with gold and teal lines, traveling pulse dots, radial vignette
- **Dashboard** — Elo count-up animation, teal liquid fill win rate card, breathing gold glow on primary CTA

---

## Project Structure

```
argos/
├── app/
│   ├── api/
│   │   ├── debates/          # Create + fetch debates
│   │   ├── debates/[id]/     # Debate state + turn updates
│   │   ├── score/            # Trigger Gemini scoring
│   │   └── og/               # Shareable OG result image
│   ├── auth/                 # OAuth callback, signout, error
│   ├── dashboard/            # Player stats and action cards
│   ├── debate/new/           # Create a new debate
│   ├── debate/[id]/          # Live debate room
│   ├── login/                # Google OAuth sign-in
│   └── page.tsx              # Landing page
├── components/
│   ├── debate/
│   │   ├── DebateRoom.tsx    # Main debate UI + Realtime
│   │   └── ScoreBreakdown.tsx
│   ├── CircuitBackground.tsx # Animated SVG background
│   ├── DashboardClient.tsx   # Count-up stats + liquid win rate
│   ├── Navbar.tsx            # Nav + join debate bar
│   ├── ThemeProvider.tsx     # Dark/light theme context
│   └── ui/ThemeToggle.tsx    # Theme toggle button
└── lib/
    ├── ai/
    │   ├── judge.ts          # Gemini integration (swap here for Claude)
    │   └── prompts.ts        # Judge prompt builder
    ├── elo.ts                # Elo calculation
    └── supabase/             # Client + server Supabase instances
```

---

## Switching AI Provider

The entire AI layer is isolated in `lib/ai/judge.ts`. To switch from Gemini to Claude:

1. Replace the contents of `lib/ai/judge.ts` with an Anthropic SDK implementation
2. Keep the same exported `scoreArgument()` function signature
3. Change `GEMINI_API_KEY` to `ANTHROPIC_API_KEY` in your env
4. Nothing else in the codebase changes

Recommended Claude models:
- Scoring: `claude-haiku-4-5-20251001` (~10× cheaper than Sonnet)
- vs-AI mode: `claude-sonnet-4-6`

---

## Roadmap

> The full strategy, build ledger, and FREE-vs-PAID sequencing live in **`ROADMAP.md`**
> (the single source of truth). Summary below.

**Already shipped:** leaderboard, dashboard history, public profiles, challenge system
(+ persistent challenges), vs-Oracle AI mode, Elo history, Daily Topic + leaderboard,
live spectator mode + `/live`, anonymous spectating, audience voting, Blitz mode, debate
replay, achievements/badges, mind archetype, solo "roast my take", Lightning on-ramp,
daily "spot the fallacy" mini-game, branded OG share cards, async scoring queue, report/
block, rate limiting, web push / PWA plumbing.

**Next (FREE — in order), per `ROADMAP.md` §6:**
1. **Integrity first** — prompt-injection isolation in the judge, topic moderation,
   fail-safe moderation for new users, a Gemini global budget breaker.
2. **Growth loops** — anonymous landing-page roast (pre-auth), weekly "your mind this
   week" recap + share.
3. **Measurement** — PostHog activation/retention funnel (watch D1/D7 before building more).
4. **Distribution** — pick one channel; seed shareable identity-based cards for 30 days.

**Later / paid (deferred until revenue):** Vercel Pro (real cron), Supabase Pro, Stripe,
Argos Coach subscription, Clubs, Education licensing, tournaments, metered scoring API.
The owner is on **free tiers only** for now (only paid dependency: Gemini).

---

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/leaderboard`
3. Make your changes
4. Open a pull request with a clear description

Please keep `PROJECT.md` updated with any architectural changes.

---

## License

MIT — see `LICENSE` file.

---

*Built with Claude · Powered by Gemini · Deployed on Vercel*