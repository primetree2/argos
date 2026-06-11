import type { Metadata } from "next";
import {
  Cinzel,
  Cinzel_Decorative,
  Crimson_Pro,
  Share_Tech_Mono,
} from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { PosthogProvider } from "@/components/PosthogProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

/* ── Oracle Terminal Font Stack ── */

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "900"],
  display: "swap",
});

const cinzelDeco = Cinzel_Decorative({
  variable: "--font-cinzel-deco",
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  display: "swap",
});

const crimsonPro = Crimson_Pro({
  variable: "--font-crimson",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

const shareTechMono = Share_Tech_Mono({
  variable: "--font-share-tech",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Argos — The Oracle Debate Arena",
  description:
    "Where arguments are judged by an ancient intelligence. Chess.com for debate.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('argos-theme');if(t==='light'){document.documentElement.setAttribute('data-theme','light');}}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className={`${cinzel.variable} ${cinzelDeco.variable} ${crimsonPro.variable} ${shareTechMono.variable} antialiased`}
      >
        <ThemeProvider>
          <PosthogProvider>
            {children}
            <ThemeToggle />
          </PosthogProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}