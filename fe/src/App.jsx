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
      <header className="ds-header-sticky">
        <div
          style={{
            position: "relative",
            zIndex: 10,
            maxWidth: "var(--ds-max-content)",
            margin: "0 auto",
            padding: "0 var(--ds-pad-section-x)",
          }}
        >
          <div className="aria-header-inner">
            <div className="aria-brand">
              <img src="/assets/logo.png" alt="Aria Logo" />
              <div className="ds-display aria-brand-name">ARIA</div>
              <div className="aria-brand-bar" />
            </div>

            <nav className="ds-tab-nav aria-header-nav">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className="ds-tab-btn"
                  style={{
                    fontWeight: tab === t.id ? "var(--ds-fw-medium)" : "var(--ds-fw-regular)",
                    color: tab === t.id ? "var(--ds-accent)" : "var(--ds-text-faint)",
                    borderBottom: tab === t.id ? "3px solid var(--ds-accent)" : "3px solid transparent",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <main className="ds-main">
        <div hidden={tab !== "conversaciones"}>
          <Conversaciones active={tab === "conversaciones"} />
        </div>
        <div hidden={tab !== "contacts"}>
          <Contacts />
        </div>
        <div hidden={tab !== "settings"}>
          <Settings />
        </div>
        <div hidden={tab !== "estado"}>
          <Estado active={tab === "estado"} />
        </div>
      </main>
    </div>
  );
}
