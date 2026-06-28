import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { saveSubscription } from "@/lib/push/subscriptions";
import { NextResponse } from "next/server";

// Register a browser PushSubscription for the current user (ROADMAP 2.4 item 3).
// Service-role write so it bypasses RLS (users only read/delete their own rows
// per migration 0019). FAIL-OPEN: any storage failure returns ok:false but
// never 500s the client into an error state.

const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let sub: unknown;
    try {
        const body = await request.json();
        sub = body?.subscription ?? body;
    } catch {
        return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const ua = request.headers.get("user-agent");
    const ok = await saveSubscription(serviceClient, user.id, sub, ua);
    return NextResponse.json({ ok });
}
