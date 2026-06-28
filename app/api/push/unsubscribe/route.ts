import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { deleteSubscription } from "@/lib/push/subscriptions";
import { NextResponse } from "next/server";

// Remove the current user's push subscription(s) (ROADMAP 2.4 item 3).
// If an `endpoint` is provided, only that device is removed; otherwise all of
// the user's subscriptions are cleared. FAIL-OPEN.

const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let endpoint: string | null = null;
    try {
        const body = await request.json();
        endpoint = typeof body?.endpoint === "string" ? body.endpoint : null;
    } catch {
        /* no body — clear all for this user */
    }

    const ok = await deleteSubscription(serviceClient, user.id, endpoint);
    return NextResponse.json({ ok });
}
