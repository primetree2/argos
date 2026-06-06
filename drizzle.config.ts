import type { Config } from "drizzle-kit";

export default {
    schema: "./lib/db/schema.ts",
    out: "./supabase/migrations",
    dialect: "postgresql",
    dbCredentials: {
        url: process.env.SUPABASE_DB_URL!,
    },
} satisfies Config;