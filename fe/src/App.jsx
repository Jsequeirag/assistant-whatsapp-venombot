import { useState } from "react";
import TetrisLogo from "./components/TetrisLogo";
import TetrisFlow from "./components/TetrisFlow";
import FaviconRotator from "./components/FaviconRotator";
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
    <div className="min-h-screen bg-[#0a0a0a]">
      <FaviconRotator
        icons={[
          "/favicon-47.png",
          "/favicon-51.png",
          "/favicon-93.png",
          "/favicon-98.png",
          "/favicon-102.png",
        ]}
        interval={3000}
      />
      <header className="relative bg-[#0f0f0f] border-b border-[#1a1a1a] sticky top-0 z-10">
        <TetrisFlow />
        <div className="relative z-10 max-w-2xl mx-auto px-4">
          <div className="flex items-stretch justify-between h-20">
            <div className="flex items-center pr-6 self-center">
              <TetrisLogo
                size={64}
                srcs={[
                  "/logo-47.png",
                  "/logo-51.png",
                  "/logo-93.png",
                  "/logo-98.png",
                  "/logo-102.png",
                ]}
                interval={3000}
              />
            </div>
            <nav className="flex items-stretch">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className="px-4 font-mono text-[10px] uppercase tracking-wider transition-colors"
                  style={{
                    color: tab === t.id ? "#e8e8e8" : "#555",
                    borderBottom: tab === t.id ? "3px solid #e8e8e8" : "3px solid transparent",
                    background: tab === t.id ? "#131313" : "transparent",
                  }}
                  onMouseEnter={(e) => { if (tab !== t.id) e.currentTarget.style.color = "#aaa"; }}
                  onMouseLeave={(e) => { if (tab !== t.id) e.currentTarget.style.color = "#555"; }}
                >
                  {t.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {tab === "conversaciones" && <Conversaciones />}
        {tab === "contacts" && <Contacts />}
        {tab === "settings" && <Settings />}
        {tab === "estado" && <Estado />}
      </main>
    </div>
  );
}
