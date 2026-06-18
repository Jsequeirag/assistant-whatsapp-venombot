# Aria — Asistente Personal WhatsApp

Asistente personal vía WhatsApp con IA (Gemini), gestionado por VenomBot en Node.js/Express.

---

## Stack

| Capa | Tecnología |
|---|---|
| WhatsApp | VenomBot (dist/ compilado de TypeScript) |
| Backend | Node.js / Express |
| IA | Google Gemini (`gemini-2.5-flash-lite`) via `@google/genai` |
| Base de datos | MongoDB + Mongoose |
| Frontend | React |

---

## Estructura de carpetas

```
assistant-whatsapp-venombot/
├── src/              ← librería venom (TypeScript, NO tocar)
├── dist/             ← librería venom compilada (npm run build)
├── bot/              ← capa de conexión a WhatsApp
│   ├── index.js      ← entry point: arranca VenomBot + Express
│   ├── config.js     ← config de sesión/navegador
│   └── scheduler.js  ← helpers de ventana horaria (legado, modo sleep migrado a mode.service)
├── app/              ← backend Express (Fase 1 ✅)
│   ├── config/
│   │   └── index.js  ← variables de entorno
│   ├── models/       ← esquemas Mongoose (Fase 2 🔲)
│   │   ├── Contact.js
│   │   ├── Message.js
│   │   ├── Recado.js
│   │   └── Settings.js
│   ├── services/
│   │   ├── gemini.service.js   ← integración Gemini (responder + clasificar recado)
│   │   ├── mode.service.js     ← lógica DND → Sleep → Auto-asistir
│   │   ├── contact.service.js  ← CRUD contactos (in-memory Fase 1, MongoDB Fase 2)
│   │   └── recado.service.js   ← CRUD recados (in-memory Fase 1, MongoDB Fase 2)
│   ├── controllers/
│   │   ├── webhook.controller.js   ← procesa mensajes entrantes de WhatsApp
│   │   ├── recados.controller.js   ← endpoints REST para recados
│   │   ├── settings.controller.js  ← endpoints REST para settings/modos
│   │   └── contacts.controller.js  ← endpoints REST para contactos
│   ├── routes/
│   │   └── index.js
│   └── server.js
├── ARIA_REQUIREMENTS.md  ← este archivo
├── .env.example
└── package.json
```

---

## Lógica de modos (prioridad decreciente)

```
Mensaje entrante
      │
      ▼
¿DND activo? ──── SÍ ──► ¿Ya respondió a este contacto en esta sesión DND?
      │                          │ NO → responde con dndPrompt, marca respondido
      │ NO                       │ SÍ → silencio (solo clasifica recado)
      │                          └──────────────────────────────────────────►
      ▼
¿Hora 20:00–08:00? ── SÍ ──► ¿Ya respondió a este contacto esta noche?
      │                             │ NO → responde con sleepPrompt, marca respondido
      │ NO                          │ SÍ → silencio (solo clasifica recado)
      │                             └───────────────────────────────────────►
      ▼
¿Auto-asistir global ON?                              Clasifica si es recado
      │                                               Si sí → guarda Recado
      ├── NO → silencio (solo clasifica recado)
      │
      └── SÍ ──► ¿Auto-asistir del contacto ON?
                       │ NO → silencio
                       │ SÍ → ¿IA detectó que ya dejó su recado?
                                │ NO → IA conversa libremente
                                │ SÍ → silencio (marca contacto como "recado completo")
```

---

## Esquemas MongoDB — Fase 2

### Contact
```js
{ number: String, name: String, autoAssist: { type: Boolean, default: false },
  recadoCompleted: { type: Boolean, default: false } }
```

### Message
```js
{ contact: ObjectId→Contact, content: String, timestamp: Date, isRecado: Boolean }
```

### Recado
```js
{ contact: ObjectId→Contact, content: String, timestamp: Date, read: { type: Boolean, default: false } }
```

### Settings (un solo documento)
```js
{
  dnd: { active: Boolean, reason: String, prompt: String,
         respondedContacts: [String] },  // IDs que ya recibieron respuesta DND
  sleep: { active: Boolean, prompt: String,
           respondedContacts: [String] },
  autoAssist: { globalEnabled: Boolean }
}
```

---

## Endpoints REST — Fase 1

### Recados
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/recados` | Listar todos (query: `?read=true/false`) |
| PATCH | `/api/recados/:id/read` | Marcar leído/no leído |

### Settings
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/settings` | Obtener configuración actual |
| PATCH | `/api/settings/dnd` | Activar/desactivar DND + razón + prompt |
| PATCH | `/api/settings/sleep` | Activar/desactivar modo dormir + prompt |
| PATCH | `/api/settings/auto-assist` | Switch global auto-asistir |

### Contacts
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/contacts` | Listar contactos |
| PATCH | `/api/contacts/:id/auto-assist` | Toggle auto-asistir por contacto |

---

## Progreso

### Fase 1 — Backend ✅
- [x] Estructura de carpetas
- [x] Entry point `bot/index.js` (VenomBot + Express)
- [x] `app/services/gemini.service.js`
- [x] `app/services/mode.service.js`
- [x] `app/services/contact.service.js` (in-memory)
- [x] `app/services/recado.service.js` (in-memory)
- [x] `app/controllers/webhook.controller.js`
- [x] Endpoints REST recados / settings / contacts
- [x] `.env.example`

### Fase 2 — MongoDB 🔲
- [ ] Conectar Mongoose
- [ ] Modelos Contact, Message, Recado, Settings
- [ ] Migrar services de in-memory a MongoDB
- [ ] Migrar respondedContacts a Settings model

### Fase 3 — Frontend React 🔲
- [ ] Vista recados con filtro leído/no leído
- [ ] Panel configuración de modos + prompts
- [ ] Lista contactos con toggle auto-asistir

---

## Variables de entorno requeridas

```env
GEMINI_API_KEY=         # Google AI Studio
PORT=3000
MONGODB_URI=            # Fase 2
NODE_ENV=development
```

## Cómo correr

```bash
npm install
npm run build           # compila librería venom (TypeScript → dist/)
node bot/index.js       # arranca todo (VenomBot + Express)
```

> Primera vez: escanear QR que aparece en consola. La sesión se guarda en `tokens/`.
