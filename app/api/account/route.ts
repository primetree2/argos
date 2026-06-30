import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// The exact phrase a user must type to confirm irreversible deletion. Kept in
// sync with the client (components/account/DeleteAccount.tsx).
const CONFIRM_PHRASE = "DELETE";

// Service-role client — bypasses RLS so we can purge every row the user could
// not delete directly, and reach the auth admin API.
function serviceClient() {
    return createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );
}

// DELETE /api/account  { confirm: "DELETE" }
//
// Permanently deletes the authenticated user and EVERYTHING tied to them. This
// is irreversible. The browser must echo the confirmation phrase the user typed
// so an accidental/forged call without intent is rejected.
export async function DELETE(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let confirm: unknown;
    try {
        ({ confirm } = await request.json());
    } catch {
        confirm = undefined;
    }

    if (typeof confirm !== "string" || confirm.trim().toUpperCase() !== CONFIRM_PHRASE) {
        return NextResponse.json(
            { error: `Type ${CONFIRM_PHRASE} to confirm account deletion.` },
            { status: 400 }
        );
    }

    const admin = serviceClient();

    // 1. Purge all public-schema data via the SECURITY DEFINER function (0020).
    const { error: purgeError } = await admin.rpc("delete_user_account", {
        p_user_id: user.id,
    });
    if (purgeError) {
        return NextResponse.json(
            { error: "Could not delete your data. Please try again." },
            { status: 500 }
        );
    }

    // 2. Remove the auth.users row so the identity itself is gone. Fail-open:
    //    the public data (the part that matters for privacy) is already purged;
    //    if the admin API is unavailable we still sign the user out below.
    try {
        await admin.auth.admin.deleteUser(user.id);
    } catch {
        // best-effort
    }

    // 3. Clear the caller's session.
    try {
        await supabase.auth.signOut();
    } catch {
        // best-effort — the identity is already deleted
    }

    return NextResponse.json({ deleted: true });
}
