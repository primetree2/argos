import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/safeRedirect";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get("code");
    // Validate `next` so it can only ever be a local, same-site path — never an
    // attacker-controlled external URL (open-redirect prevention).
    const next = safeNextPath(searchParams.get("next"));

    if (code) {
        const supabase = await createClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
            return NextResponse.redirect(`${origin}${next}`);
        }
    }

    return NextResponse.redirect(`${origin}/auth/error`);
}