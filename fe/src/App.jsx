import { useState } from "react";
import Conversaciones from "./views/Conversaciones";
import Contacts from "./views/Contacts";
import Settings from "./views/Settings";
import Estado from "./views/Estado";

const TABS = [
  { id: "conversaciones", label: "Conversaciones" },
  { id: "contacts", label: "Contactos" },
  { id: "settings", label: "Configuración" },
  { id: "estado", label: "Estado" },
];

export default function App() {
  const [tab, setTab] = useState("conversaciones");

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <span className="font-semibold text-gray-900 tracking-tight">Aria</span>
            <nav className="flex gap-1">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    tab === t.id
                      ? "bg-gray-900 text-white"
                      : "text-gray-500 hover:text-gray-900"
                  }`}
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
