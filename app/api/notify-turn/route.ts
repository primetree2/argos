import { NextResponse } from "next/server";

// POST /api/notify-turn  { debateId }
//
// DEPRECATED — per-turn emails were removed (unnecessary and noisy). Argos now
// sends a single connection email when players are matched / a challenge is
// accepted (see lib/email/resend.ts → sendMatchNotification). This route is
// retained as a harmless no-op so any stale client caller doesn't error.
export async function POST() {
    return NextResponse.json({ sent: false, deprecated: true });
}
