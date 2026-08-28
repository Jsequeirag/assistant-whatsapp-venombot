import { useState } from "react";
import Conversaciones from "./views/Conversaciones";
import Contacts from "./views/Contacts";
import Settings from "./views/Settings";
import Estado from "./views/Estado";

const TABS = [
  { id: "conversaciones", label: "Conversaciones" },
  { id: "contacts", label: "Contactos" },
  { id: "settings", label: "Config" },
  { id: "estado", label: "Estado" },
];

export default function App() {
  const [tab, setTab] = useState("conversaciones");

  return (
    <div style={{ minHeight: "100vh", background: "var(--ds-bg)" }}>
      {/* Header sticky con efecto de vidrio */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "var(--ds-surface)",
          borderBottom: "1px solid var(--ds-border)",
        }}
      >
        {/* Header container */}
        <div
          style={{
            position: "relative",
            zIndex: 10,
            maxWidth: "var(--ds-max-content)",
            margin: "0 auto",
            padding: "0 var(--ds-pad-section-x)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "stretch",
              justifyContent: "space-between",
              height: "var(--ds-space-20)",
            }}
          >
            {/* Logo/Brand section */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--ds-space-4)",
              }}
            >
              {/* Logo image */}
              <img
                src="/assets/logo.png"
                alt="Aria Logo"
                style={{
                  height: "48px",
                  width: "auto",
                  display: "block",
                }}
              />
              {/* Brand name con tipografía display */}
              <div
                className="ds-display"
                style={{
                  fontSize: "clamp(28px, 4vw, 42px)",
                  lineHeight: "var(--ds-lh-hero)",
                  letterSpacing: "3px",
                  color: "var(--ds-text-strong)",
                }}
              >
                ARIA
              </div>
              {/* Accent bar - firma del design system */}
              <div
                style={{
                  width: "var(--ds-bar-thin)",
                  height: "var(--ds-space-8)",
                  background: "var(--ds-accent)",
                }}
              />
            </div>

            {/* Navigation tabs */}
            <nav className="ds-tab-nav" style={{ border: "none", flex: 1, marginLeft: "var(--ds-space-12)" }}>
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className="ds-tab-btn"
                  style={{
                    fontFamily: "var(--ds-font-body)",
                    fontWeight: tab === t.id ? "var(--ds-fw-medium)" : "var(--ds-fw-regular)",
                    fontSize: "var(--ds-fs-sm)",
                    letterSpacing: "var(--ds-ls-caps)",
                    textTransform: "uppercase",
                    color: tab === t.id ? "var(--ds-accent)" : "var(--ds-text-faint)",
                    borderBottom: tab === t.id ? "3px solid var(--ds-accent)" : "3px solid transparent",
                    background: "transparent",
                    padding: "0 var(--ds-space-4)",
                    transition: "color var(--ds-dur-hover), border-color var(--ds-dur-hover)",
                    cursor: "pointer",
                    border: "none",
                    height: "100%",
                  }}
                  onMouseEnter={(e) => {
                    if (tab !== t.id) {
                      e.currentTarget.style.color = "var(--ds-text-muted)";
                      e.currentTarget.style.borderBottomColor = "var(--ds-border-soft)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (tab !== t.id) {
                      e.currentTarget.style.color = "var(--ds-text-faint)";
                      e.currentTarget.style.borderBottomColor = "transparent";
                    }
                  }}
                >
                  {t.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="ds-main">
        {tab === "conversaciones" && <Conversaciones />}
        {tab === "contacts" && <Contacts />}
        {tab === "settings" && <Settings />}
        {tab === "estado" && <Estado />}
      </main>
    </div>
  );
}
