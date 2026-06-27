import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Trust & safety: user reports (ROADMAP Phase 1, item 4). Writes a flag into
// the `reports` table created by migration 0007 for a future moderation queue.
//
// POST /api/reports { argumentId?, reportedUserId?, reason, details? }
//
// RLS (reports_insert_own) requires reporter_id = auth.uid(), so we use the
// authed client and set reporter_id from the session. A report must target at
// least one of an argument or a user.

const VALID_REASONS = new Set(["harassment", "hate", "spam", "other"]);
const MAX_DETAILS = 1000;

export async function POST(request: Request) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { argumentId, reportedUserId, reason, details } = await request.json();

    if (typeof reason !== "string" || !VALID_REASONS.has(reason)) {
        return NextResponse.json(
            { error: "Invalid reason. Use one of: harassment, hate, spam, other." },
            { status: 400 }
        );
    }
    if (!argumentId && !reportedUserId) {
        return NextResponse.json(
            { error: "A report must reference an argument or a user." },
            { status: 400 }
        );
    }
    if (details != null && typeof details !== "string") {
        return NextResponse.json({ error: "Invalid details." }, { status: 400 });
    }

    const { error } = await supabase.from("reports").insert({
        reporter_id: user.id,
        argument_id: typeof argumentId === "string" ? argumentId : null,
        reported_user: typeof reportedUserId === "string" ? reportedUserId : null,
        reason,
        details: typeof details === "string" ? details.slice(0, MAX_DETAILS) : null,
    });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
