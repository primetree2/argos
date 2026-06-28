# Activating Web Push & PWA (Argos)

> A step-by-step guide to turning on free web push notifications and the
> installable PWA. **None of this is required for the app to run** — Argos is
> fully deployable without it. Do this only when you want notifications to
> reach users when the tab is closed or on mobile.
>
> Shipped in MR !10 (ROADMAP §2.4 item 3). Everything here uses **free**
> services only (the web-push / VAPID standard — no OneSignal, no paid tier).

---

## Is this necessary?

**No.** The whole push layer is *fail-open* by design:

- The app **builds and deploys fine** without the `web-push` package (it is
  dynamically imported and no-ops if absent).
- The Navbar push button **renders nothing** until you set the VAPID public
  key, so there is no broken or dead UI in the meantime.
- The in-app notification **bell still works** regardless (that is the separate
  migration 0018 system). Push is an *additional* channel that reaches users
  outside the app.

Until you complete the steps below, `sendPush()` quietly returns `0` and nothing
breaks. Activate push only when you want “someone joined your challenge” (and,
later, “your turn”) to ping users with the app closed.

---

## What you already did

If you merged MR !10 and ran `supabase/migrations/0019_push_subscriptions.sql`,
you have created the `push_subscriptions` table. That is the storage. Three
things still need to exist before a single push can actually send:

1. The `web-push` npm package (installed).
2. The VAPID keys (the push credentials) + their env vars.
3. The icon images the notification displays.

---

## Step 1 — Install the package locally

In your project folder:

```bash
npm install
```

This picks up `web-push` + `@types/web-push`, which MR !10 already added to
`package.json`. (You can also run `npm install web-push` explicitly.)

---

## Step 2 — Generate VAPID keys (free, one-time)

VAPID keys are a public/private keypair that identifies your server to the
browsers’ push services. Generate them once:

```bash
npx web-push generate-vapid-keys
```

The output looks like:

```
=======================================
Public Key:
BL... (a long base64url string)

Private Key:
xK... (a shorter base64url string)
=======================================
```

Keep both. They never change — if you regenerate them later, every existing
subscription stops working and users must re-subscribe.

---

## Step 3 — Set environment variables

You need three env vars. The **public** key must be prefixed `NEXT_PUBLIC_`
(the browser needs it to subscribe). The **private** key must stay server-only
— **never** prefix it with `NEXT_PUBLIC_`.

```bash
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<the Public Key from step 2>
VAPID_PRIVATE_KEY=<the Private Key from step 2>
VAPID_CONTACT_EMAIL=youremail@example.com   # optional; identifies you to push services
```

### On Vercel (production)

1. Go to your project → **Settings** → **Environment Variables**.
2. Add the three variables above (apply to Production, Preview, and Development
   as you prefer).
3. **Redeploy** so the new build picks them up. (Env var changes do not take
   effect until a redeploy.)

### Locally (development)

Add the same three lines to your `.env.local` file in the project root.

---

## Step 4 — Add the icon images

The notification and the home-screen install icon need two **square** PNGs in
your `public/` folder:

| File | Size |
|------|------|
| `public/icon-192.png` | 192 × 192 |
| `public/icon-512.png` | 512 × 512 |

Any square version of your logo works. The app runs fine without them — only
the icon art is missing until you add them. If you don’t have a logo handy, a
plain gold-on-black square is a fine placeholder. (Tools like
<https://realfavicongenerator.net/> can generate the set from one image.)

These filenames are referenced by `app/manifest.ts` and `public/sw.js`.

---

## Step 5 — Verify it works

1. Redeploy (Vercel) or restart `npm run dev` locally.
2. Log in. A **bell-with-toggle** icon should now appear in the Navbar — it
   was hidden before because the public key was unset.
3. Click it and **accept** the browser permission prompt. This registers a row
   in `push_subscriptions`.
4. Test the end-to-end flow: from a **second account**, join one of your open
   challenges. Your first account should receive a push notification
   (“@someone joined your challenge”) even with the tab in the background.

---

## Testing locally (HTTPS note)

Browsers only allow web push over **HTTPS**. On Vercel this is automatic, so
the easiest place to test is your deployed URL. For local testing you must run
Next.js with HTTPS:

```bash
next dev --experimental-https
```

Also make sure notifications aren’t disabled globally in your browser/OS, and
that you accepted the permission prompt. If a notification still doesn’t show,
try another browser to isolate the issue.

### iOS specifics

On iPhone/iPad, web push only works when the site is **installed to the Home
Screen** (iOS 16.4+). The push button shows an “Add to Home Screen first” hint
on iOS until the app is installed. To install: open Argos in Safari → Share →
“Add to Home Screen”, then open it from the home-screen icon and enable
notifications there.

---

## Quick checklist

| Item | Required to run app? | For push? |
|------|----------------------|-----------|
| Merge MR !10 | — | ✅ |
| Run migration 0019 | — | ✅ |
| `npm install` (web-push) | No | ✅ |
| VAPID keys + env vars | No | ✅ |
| `icon-192.png` / `icon-512.png` | No | ✅ (icon art) |
| Redeploy after env changes | — | ✅ |

---

## Environment variable reference

| Variable | Scope | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | client + server | Browser uses it to create a subscription; also gates whether the Navbar push button renders. |
| `VAPID_PRIVATE_KEY` | **server only** | Signs outgoing push messages. Never expose to the client. |
| `VAPID_CONTACT_EMAIL` | server only (optional) | Contact address sent to push services per the VAPID spec. Defaults to a fallback if unset. |

---

## How it fits together (for reference)

- `app/manifest.ts` — the installable PWA manifest (name, colors, icons).
- `public/sw.js` — the service worker: shows the notification on a `push`
  event and focuses/opens the right page on click.
- `components/push/PushManager.tsx` — the Navbar opt-in; registers the service
  worker and subscribes/unsubscribes. Self-hides until push is configured.
- `app/api/push/subscribe` + `app/api/push/unsubscribe` — store/remove a
  subscription for the logged-in user.
- `lib/push/send.ts` — `sendPush(userId, { title, body, url })`; dynamically
  imports `web-push`, no-ops if push isn’t configured, prunes dead
  subscriptions.
- `supabase/migrations/0019_push_subscriptions.sql` — the `push_subscriptions`
  table (own-row RLS; safe to run twice).

Currently wired to fire on **challenge join**. The next checkpoint wires it
into the “your turn” path (submit-argument / maintenance cron).
