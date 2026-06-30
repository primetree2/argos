import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { CircuitBackground } from "@/components/CircuitBackground";
import { AnonRoastClient } from "@/components/roast/AnonRoastClient";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-void)",
        color: "var(--text-primary)",
      }}
    >
      {/* ── Navbar ── */}
      <CircuitBackground />
      <Navbar hideAuth={false} />

      {/* ── Circuit grid background decoration ── */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          overflow: "hidden",
        }}
      >
        {/* Vertical gold lines */}
        <svg
          width="100%"
          height="100%"
          xmlns="http://www.w3.org/2000/svg"
          style={{ opacity: 0.04 }}
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <pattern
              id="grid"
              width="80"
              height="80"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 80 0 L 0 0 0 80"
                fill="none"
                stroke="var(--gold)"
                strokeWidth="0.5"
              />
            </pattern>
            <radialGradient id="grid-fade" cx="50%" cy="40%" r="55%">
              <stop offset="0%" stopColor="white" stopOpacity="1" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </radialGradient>
            <mask id="grid-mask">
              <rect width="100%" height="100%" fill="url(#grid-fade)" />
            </mask>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="url(#grid)"
            mask="url(#grid-mask)"
          />
        </svg>
      </div>

      {/* ── MAIN CONTENT ── */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "4rem 1.5rem 3rem",
          textAlign: "center",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Oracle eyebrow badge */}
        <div className="reveal-1" style={{ marginBottom: "2.5rem" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.6rem",
              padding: "0.4rem 1.1rem",
              border: "1px solid var(--gold-border)",
              borderRadius: "2px",
              background: "var(--gold-glow)",
              fontFamily: "var(--font-share-tech), monospace",
              fontSize: "0.68rem",
              letterSpacing: "0.22em",
              color: "var(--text-gold)",
              textTransform: "uppercase",
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: "5px",
                height: "5px",
                borderRadius: "50%",
                background: "var(--gold)",
                boxShadow: "0 0 6px var(--gold)",
                animation: "oracle-pulse 2s ease-in-out infinite",
              }}
            />
            Est. MMXXV · AI Judge · Elo Rated · Real-Time
          </span>
        </div>

        {/* Hero heading */}
        <div className="reveal-2" style={{ marginBottom: "1.5rem" }}>
          {/* Latin inscription above */}
          <p
            style={{
              fontFamily: "var(--font-cinzel), serif",
              fontSize: "clamp(0.6rem, 1.5vw, 0.75rem)",
              letterSpacing: "0.35em",
              color: "var(--text-gold)",
              opacity: 0.8,
              marginBottom: "1.25rem",
              textTransform: "uppercase",
            }}
          >
            Iudex Artificialis · Veritas Aeterna
          </p>

          <h1
            style={{
              fontFamily: "var(--font-cinzel-deco), serif",
              fontSize: "clamp(3.5rem, 12vw, 9rem)",
              fontWeight: 900,
              letterSpacing: "0.08em",
              lineHeight: 0.92,
              marginBottom: "0",
            }}
          >
            <span className="text-shimmer">ARGOS</span>
          </h1>

          {/* Sub-title rule */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "1rem",
              margin: "1.2rem 0 0",
            }}
          >
            <div className="gold-rule" style={{ width: "60px" }} />
            <span
              style={{
                fontFamily: "var(--font-cinzel), serif",
                fontSize: "clamp(0.6rem, 2vw, 0.8rem)",
                letterSpacing: "0.30em",
                color: "var(--text-secondary)",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
              }}
            >
              The Oracle Debate Arena
            </span>
            <div className="gold-rule" style={{ width: "60px" }} />
          </div>
        </div>

        {/* Body copy */}
        <div className="reveal-3" style={{ marginBottom: "2.75rem" }}>
          <p
            style={{
              fontFamily: "var(--font-crimson), serif",
              fontSize: "clamp(1rem, 2.5vw, 1.25rem)",
              fontStyle: "italic",
              color: "var(--text-secondary)",
              maxWidth: "480px",
              lineHeight: 1.7,
              margin: "0 auto",
            }}
          >
            Challenge anyone. Make your case. An ancient intelligence
            scores every argument — and names every fallacy.
          </p>
        </div>

        {/* CTA */}
        <div className="reveal-4" style={{ marginBottom: "5rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
          <Link href="/login" className="btn-oracle btn-oracle-cta">
            Enter the Arena
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>

          {/* Low-friction secondary hook (ROADMAP §5.2 force 5): point at the
              inline pre-auth roast below instead of a separate page. */}
          <span
            style={{
              fontFamily: "var(--font-cinzel), serif",
              fontSize: "0.72rem",
              letterSpacing: "0.14em",
              color: "var(--text-tertiary)",
            }}
          >
            or roast a take below — no sign-up, instant verdict ↓
          </span>
        </div>

        {/* ── Pre-auth roast (ROADMAP §6.2 item 5 / §5.2 force 4): the first
            taste happens BEFORE the auth wall, then we ask to save it. ── */}
        <div className="reveal-4" style={{ width: "100%", display: "flex", justifyContent: "center", marginBottom: "5rem" }}>
          <AnonRoastClient />
        </div>

        {/* ── Instrument panel row ── */}
        <div
          className="reveal-5 panel-grid-3col"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "1px",
            width: "100%",
            maxWidth: "560px",
            background: "var(--border-default)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-lg)",
            overflow: "hidden",
          }}
        >
          {[
            {
              value: "ELO",
              sublabel: "Chess-style rating",
              icon: "◆",
              desc: "Your rank rises and falls with every verdict.",
            },
            {
              value: "AI",
              sublabel: "Fallacy detection",
              icon: "⚖",
              desc: "10 logical fallacies named, quoted, penalised.",
            },
            {
              value: "RT",
              sublabel: "Live scoring",
              icon: "◉",
              desc: "Scores appear as the Oracle deliberates.",
            },
          ].map((panel, i) => (
            <div
              key={panel.value}
              className="scanlines"
              style={{
                background: "var(--bg-surface)",
                padding: "1.5rem 1rem",
                textAlign: "center",
                position: "relative",
              }}
            >
              {/* Top accent line */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: "20%",
                  right: "20%",
                  height: "1px",
                  background:
                    i === 0
                      ? "var(--gold)"
                      : i === 1
                        ? "var(--teal)"
                        : "var(--gold-dim)",
                  opacity: 1,
                }}
              />

              <div
                style={{
                  fontFamily: "var(--font-share-tech), monospace",
                  fontSize: "1.9rem",
                  letterSpacing: "0.1em",
                  color: i === 1 ? "var(--teal)" : "var(--gold)",
                  lineHeight: 1,
                  marginBottom: "0.4rem",
                }}
              >
                {panel.value}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-cinzel), serif",
                  fontSize: "0.58rem",
                  letterSpacing: "0.18em",
                  color: "var(--text-tertiary)",
                  textTransform: "uppercase",
                  marginBottom: "0.75rem",
                }}
              >
                {panel.sublabel}
              </div>
              <p
                style={{
                  fontFamily: "var(--font-crimson), serif",
                  fontSize: "0.82rem",
                  fontStyle: "italic",
                  color: "var(--text-secondary)",
                  lineHeight: 1.5,
                }}
              >
                {panel.desc}
              </p>
            </div>
          ))}
        </div>

        {/* ── How it works ── */}
        <div
          className="reveal-6"
          style={{
            marginTop: "5rem",
            width: "100%",
            maxWidth: "700px",
          }}
        >
          {/* Section heading with gold rules */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "1rem",
              marginBottom: "2rem",
            }}
          >
            <div className="gold-rule-subtle" style={{ flex: 1 }} />
            <span
              style={{
                fontFamily: "var(--font-cinzel), serif",
                fontSize: "0.62rem",
                letterSpacing: "0.28em",
                color: "var(--text-gold)",
                opacity: 1,
                textTransform: "uppercase",
                whiteSpace: "nowrap",
              }}
            >
              The Trial
            </span>
            <div className="gold-rule-subtle" style={{ flex: 1 }} />
          </div>

          <div
            className="how-cards-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: "1rem",
            }}
          >
            {[
              {
                step: "I",
                title: "Choose your topic",
                body: "Write your own or pick from the Oracle's curated list.",
              },
              {
                step: "II",
                title: "Argue your case",
                body: "Ten minutes per round. Make every word count.",
              },
              {
                step: "III",
                title: "Face the verdict",
                body: "Scored on clarity, evidence, logic, and rebuttal.",
              },
              {
                step: "IV",
                title: "Rise in rank",
                body: "Elo updates after every ranked match. Your record is permanent.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="glass-card"
                style={{
                  padding: "1.25rem",
                  textAlign: "left",
                  borderTop: "1px solid var(--gold-border)",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-cinzel), serif",
                    fontSize: "0.65rem",
                    letterSpacing: "0.2em",
                    color: "var(--text-gold)",
                    opacity: 0.9,
                    marginBottom: "0.6rem",
                  }}
                >
                  {item.step}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-cinzel), serif",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                    color: "var(--text-primary)",
                    marginBottom: "0.5rem",
                  }}
                >
                  {item.title}
                </div>
                <p
                  style={{
                    fontFamily: "var(--font-crimson), serif",
                    fontSize: "0.9rem",
                    fontStyle: "italic",
                    color: "var(--text-secondary)",
                    lineHeight: 1.55,
                  }}
                >
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer
        style={{
          position: "relative",
          zIndex: 1,
          borderTop: "1px solid var(--border-default)",
          padding: "1.1rem 2rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-share-tech), monospace",
            fontSize: "0.68rem",
            letterSpacing: "0.12em",
            color: "var(--text-tertiary)",
          }}
        >
          ARGOS v1.0 · {new Date().getFullYear()}
        </span>

        {/* Decorative center mark */}
        <svg
          width="20"
          height="20"
          viewBox="0 0 28 28"
          fill="none"
          style={{ opacity: 0.2 }}
        >
          <polygon
            points="14,2 26,24 2,24"
            fill="none"
            stroke="var(--gold)"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <circle cx="14" cy="15" r="1.5" fill="var(--gold)" />
        </svg>

        <span
          style={{
            fontFamily: "var(--font-cinzel), serif",
            fontSize: "0.62rem",
            letterSpacing: "0.16em",
            color: "var(--text-tertiary)",
            fontStyle: "italic",
          }}
        >
          Chess.com for debate
        </span>
      </footer>
    </div>
  );
}