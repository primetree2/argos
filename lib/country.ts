// Country code → flag emoji + display name helpers (Quick Match country flags).
//
// Pure, dependency-free, and fully null-safe so it can be used on the server
// and in client components alike. A country is an ISO 3166-1 alpha-2 code
// (e.g. "US", "GB", "PK"); anything else (null, empty, malformed) yields no
// flag, so the UI simply renders nothing rather than a broken glyph.

// Convert a 2-letter ISO country code to its regional-indicator flag emoji.
// Returns "" for anything that isn't exactly two ASCII letters.
export function flagEmoji(code: string | null | undefined): string {
    if (!code) return "";
    const cc = code.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) return "";
    const A = 0x1f1e6; // regional indicator symbol letter A
    const base = "A".charCodeAt(0);
    return String.fromCodePoint(A + (cc.charCodeAt(0) - base), A + (cc.charCodeAt(1) - base));
}

// A small, common subset of country names for tooltips/labels. We don't ship
// the full ISO table to keep the bundle tiny; unknown-but-valid codes fall back
// to the upper-cased code itself, which still reads sensibly next to the flag.
const NAMES: Record<string, string> = {
    US: "United States", GB: "United Kingdom", CA: "Canada", AU: "Australia",
    IN: "India", PK: "Pakistan", BD: "Bangladesh", NG: "Nigeria", ZA: "South Africa",
    DE: "Germany", FR: "France", ES: "Spain", IT: "Italy", NL: "Netherlands",
    SE: "Sweden", NO: "Norway", DK: "Denmark", FI: "Finland", IE: "Ireland",
    PL: "Poland", PT: "Portugal", BR: "Brazil", MX: "Mexico", AR: "Argentina",
    JP: "Japan", KR: "South Korea", CN: "China", HK: "Hong Kong", SG: "Singapore",
    MY: "Malaysia", ID: "Indonesia", PH: "Philippines", TH: "Thailand", VN: "Vietnam",
    AE: "United Arab Emirates", SA: "Saudi Arabia", TR: "Turkey", EG: "Egypt",
    RU: "Russia", UA: "Ukraine", NZ: "New Zealand", CH: "Switzerland", AT: "Austria",
    BE: "Belgium", GR: "Greece", IL: "Israel", LK: "Sri Lanka", NP: "Nepal",
};

export function countryName(code: string | null | undefined): string {
    if (!code) return "";
    const cc = code.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) return "";
    return NAMES[cc] ?? cc;
}

// Returns true when the code is a usable 2-letter country code.
export function hasCountry(code: string | null | undefined): boolean {
    return flagEmoji(code) !== "";
}
