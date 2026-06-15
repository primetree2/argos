import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function isAuthorized(request: Request): boolean {
    const secret = process.env.CRON_SECRET;
    const header = request.headers.get("authorization");
    if (secret && header === `Bearer ${secret}`) return true;
    if (request.headers.get("x-vercel-cron") === "1") return true;
    return false;
}

// Runs daily. Deletes debates that are still 'waiting' after 24 hours —
// i.e. created but never joined by an opponent.
export async function GET(request: Request) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: stale, error: fetchError } = await serviceClient
        .from("debates")
        .select("id")
        .eq("status", "waiting")
        .lt("created_at", cutoff);

    if (fetchError) {
        return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!stale || stale.length === 0) {
        return NextResponse.json({ deleted: 0, message: "No stale debates found." });
    }

    const ids = stale.map((d) => d.id);

    // Delete arguments first (foreign key)
    await serviceClient.from("arguments").delete().in("debate_id", ids);

    // Then delete the debates
    const { error: deleteError } = await serviceClient
        .from("debates")
        .delete()
        .in("id", ids);

    if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ deleted: ids.length, ids });
}