import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Trust & safety: user blocks (ROADMAP Phase 1, item 4). Reads/writes the
// `user_blocks` table created by migration 0007. Matchmaking already excludes
// users who block each other (match_player in 0007).
//
//   GET                       -> { blocked: string[] }  (ids the caller blocks)
//   POST   { blockedUserId }   -> block (idempotent via UNIQUE)
//   DELETE { blockedUserId }   -> unblock
//
// RLS (blocks_all_own) requires blocker_id = auth.uid(), so the authed client
// is used and blocker_id is taken from the session.

export async function GET() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase
        .from("user_blocks")
        .select("blocked_id")
        .eq("blocker_id", user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ blocked: (data ?? []).map((r) => r.blocked_id) });
}

export async function POST(request: Request) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { blockedUserId } = await request.json();
    if (typeof blockedUserId !== "string" || !blockedUserId) {
        return NextResponse.json({ error: "Missing blockedUserId." }, { status: 400 });
    }
    if (blockedUserId === user.id) {
        return NextResponse.json({ error: "You cannot block yourself." }, { status: 400 });
    }

    // Idempotent: the UNIQUE (blocker_id, blocked_id) constraint makes a repeat
    // block a benign no-op rather than an error.
    const { error } = await supabase
        .from("user_blocks")
        .upsert(
            { blocker_id: user.id, blocked_id: blockedUserId },
            { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true }
        );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, state: "blocked" });
}

export async function DELETE(request: Request) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { blockedUserId } = await request.json();
    if (typeof blockedUserId !== "string" || !blockedUserId) {
        return NextResponse.json({ error: "Missing blockedUserId." }, { status: 400 });
    }

    const { error } = await supabase
        .from("user_blocks")
        .delete()
        .eq("blocker_id", user.id)
        .eq("blocked_id", blockedUserId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, state: "unblocked" });
}
