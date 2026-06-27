// Validate a post-auth redirect target so the `next` query param can never be
// used as an open redirect.
//
// We only accept a same-site ABSOLUTE PATH: it must start with a single "/"
// and must NOT begin with "//" or "/\" (both of which browsers treat as a
// protocol-relative URL to an external host). Anything containing a scheme or
// host, or that fails to parse as a local path, falls back to `fallback`.
export function safeNextPath(next: string | null, fallback = "/dashboard"): string {
    if (!next || typeof next !== "string") return fallback;

    // Must be a rooted path, but not a protocol-relative "//host" or "/\host".
    if (!next.startsWith("/")) return fallback;
    if (next.startsWith("//")) return fallback;
    if (next.startsWith("/\\")) return fallback;

    // Reject anything that smuggles a scheme/host (e.g. "/\t//evil", encoded
    // control chars). Parsing against a dummy base and confirming the result
    // stays on that base is the authoritative check.
    try {
        const base = "https://argos.local";
        const url = new URL(next, base);
        if (url.origin !== base) return fallback;
        // Re-serialize to the local path (path + query + hash only).
        const local = `${url.pathname}${url.search}${url.hash}`;
        return local.startsWith("/") && !local.startsWith("//") ? local : fallback;
    } catch {
        return fallback;
    }
}
