import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { generateDailyTopic } from "@/lib/ai/dailyTopic";
import { todayUtc } from "@/lib/dailyTopic";

// Daily Topic cron (#8). Runs at 00:00 UTC (see vercel.json).
// Idempotent: if today's topic already exists it is returned unchanged.
// Auth matches the auto-forfeit cron: CRON_SECRET bearer or Vercel cron header.

const serviceClient = createServiceClient(
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

export async function GET(request: Request) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const date = todayUtc();

    // Idempotency: skip if already generated for today.
    const { data: existing } = await serviceClient
        .from("daily_topics")
        .select("date, title, category")
        .eq("date", date)
        .single();

    if (existing) {
        return NextResponse.json({ created: false, topic: existing });
    }

    const topic = await generateDailyTopic(date);

    // Insert; ignore unique-violation in case a concurrent run beat us to it.
    const { data: inserted, error } = await serviceClient
        .from("daily_topics")
        .insert({ date, title: topic.title, category: topic.category })
        .select("date, title, category")
        .single();

    if (error) {
        const { data: row } = await serviceClient
            .from("daily_topics")
            .select("date, title, category")
            .eq("date", date)
            .single();
        if (row) return NextResponse.json({ created: false, topic: row });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ created: true, topic: inserted });
}
