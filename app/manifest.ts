import type { MetadataRoute } from "next";

// Web app manifest (ROADMAP 2.4 item 3 — PWA). Lets users install Argos to
// their home screen for an app-like, mobile-first experience and is a
// precondition for web push on iOS (16.4+ when installed). Oracle Terminal
// palette: void background, gold theme.
export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "Argos — The Oracle Debate Arena",
        short_name: "Argos",
        description:
            "Where arguments are judged by an ancient intelligence. Chess.com for debate.",
        start_url: "/dashboard",
        display: "standalone",
        background_color: "#07080a",
        theme_color: "#c9a84c",
        orientation: "portrait",
        icons: [
            {
                src: "/icon-192.png",
                sizes: "192x192",
                type: "image/png",
                purpose: "any",
            },
            {
                src: "/icon-512.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "any",
            },
            {
                src: "/icon-512.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "maskable",
            },
        ],
    };
}
