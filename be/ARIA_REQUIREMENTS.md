# Aria — Asistente Personal WhatsApp

Asistente personal vía WhatsApp con IA **OpenAI-compatible** (Groq de fábrica), VenomBot en Node.js/Express, panel React en `fe/`.
Despliegue: VPS + nginx + PM2. Guía: `DEPLOY.md` en la raíz del repo.

---

## Stack

| Capa | Tecnología |
|---|---|
| WhatsApp | VenomBot (`be/src/` TypeScript → `be/dist/`) |
| Backend | Node.js 20+ / Express (`be/bot/index.js` + `be/app/`) |
| IA | Paquete `openai`, Chat Completions `/v1`. Default Groq `https://api.groq.com/openai/v1` |
| Voz | `POST /v1/audio/transcriptions` (Whisper). No todos los clones lo tienen |
| Base de datos | MongoDB + Mongoose |
| Medios | Archivos en `be/media/`, no Base64 en Mongo |
| Frontend | React 18 + Vite + Tailwind en **`fe/`** (no `frontend/`) |
| Reverse proxy | nginx → Express `:3000` |
| Proceso | PM2 |
| Tests | `cd be && npm test` (`be/test/aria/`) |

El cliente **no** usa `groq-sdk` ni `@google/genai`. Gemini quedó atrás; el contrato es OpenAI-compat.

---

## Estructura de carpetas (repo real)

```
assistant-whatsapp-venombot/
├── be/
│   ├── src/                 ← librería venom (TypeScript, no tocar salvo fork)
│   ├── dist/                ← compilado (npm run build)
│   ├── bot/index.js         ← Express + VenomBot
│   ├── app/
│   │   ├── lib/incoming.js  ← filtros, presencia, decideTurn
│   │   ├── models/          ← Contact, Message, Recado, Settings, ServiceAudit
│   │   ├── services/        ← llm, mode, contact, message, media, whatsapp…
│   │   └── controllers/     ← webhook, settings, contacts, recados, media
│   ├── media/               ← imágenes (gitignored)
│   ├── test/aria/           ← unit tests de Aria
│   ├── tokens/              ← sesión WhatsApp (gitignored)
│   └── ARIA_REQUIREMENTS.md ← este archivo
├── fe/                      ← dashboard React (Conversaciones, Contacts, Settings, Estado)
├── deploy/nginx-aria.conf
├── CLAUDE.md
├── DEPLOY.md
└── README.md
```

---

## Lógica de modos (prioridad decreciente)

No hay auto-asistir **por contacto**. Solo `settings.autoAssist.globalEnabled`.

```
Mensaje entrante
      │
      ▼
¿DND activo? ──── SÍ ──► ¿Ya saludó a este contacto en esta sesión DND?
      │                          │ NO → un saludo, marca respondido
      │ NO                       │ SÍ → si auto-asistir ON: conversa; si OFF: silencio
      ▼
¿Sleep activo y hora 20:00–08:00 (TZ de Settings)?
      │ SÍ → mismo patrón que DND (un saludo por noche/sesión)
      ▼
¿Auto-asistir global ON?
      ├── NO → silencio (igual clasifica recado)
      └── SÍ → ¿IA marcó recado completo? SÍ → silencio; NO → conversa
```

Clasificación de recado corre también en silencio. Si Aria **responde**, recado + filtro + texto van en **un** Chat Completions (`llm.service.replyTurn`).

---

## Esquemas MongoDB

### Contact
```js
{ contactId: String,  // "5491112345678@c.us" (unique)
  number: String,
  name: String,
  avatarUrl: String,
  timestamps: true }
// NO hay Contact.autoAssist
// recadoCompleted / conversationHistory LLM → RAM (hidratado desde Message)
```

### Message
```js
{ contactId, contactName,
  role: "user"|"assistant",
  content, via: "auto"|"manual",
  isTranscribed: Boolean,
  mediaPath: String,   // relativo a be/media/
  mediaType: String,
  // mediaData: String  // legado Base64; /api/media/:id lo migra a disco
  aiClassification: { isRecado, summary, priority },
  timestamps: true }
```

### Recado
```js
{ contactId, contactName,
  content,            // resumen IA
  originalContent,    // texto original
  priority: "alta"|"media"|"baja",
  read: Boolean,
  timestamps: true }
```

### Settings (singleton)
```js
{
  dnd:  { active, reason, respondedContacts: [String] },
  sleep: { active, reason, respondedContacts: [String] },
  autoAssist: { globalEnabled: Boolean },
  identity: { ownerName, assistantName },
  groq: { apiKey, model, baseUrl, voiceModel },  // nombre histórico; es el proveedor OpenAI-compat
  retention: { days: Number },  // 0 = no borrar; default 30
  timezone: String              // IANA, Sleep 20:00–08:00
}
```

---

## Endpoints REST

### Recados
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/recados` | Listar |
| PATCH | `/api/recados/:id/read` | Marcar leído/no leído |

### Settings
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/settings` | Config (API key enmascarada) |
| PATCH | `/api/settings/dnd` | DND |
| PATCH | `/api/settings/sleep` | Sleep + timezone |
| PATCH | `/api/settings/auto-assist` | Switch **global** |
| PATCH | `/api/settings/identity` | Nombres |
| PATCH | `/api/settings/groq` | Key / modelo / baseUrl / voice |
| GET | `/api/settings/groq/models` | `GET /v1/models` |
| PATCH | `/api/settings/retention` | Días de retención |

**No existe** `PATCH /api/contacts/:id/auto-assist`.

### Contacts / chat
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/contacts` | Listar |
| POST | `/api/contacts` | Crear |
| PATCH | `/api/contacts/:id` | Renombrar |
| DELETE | `/api/contacts/:id` | Borrar contacto + mensajes + archivos |
| GET | `/api/contacts/messages-summary` | Lista de hilos |
| GET | `/api/contacts/:id/messages` | Historial (sin Base64; `mediaUrl`) |
| POST | `/api/contacts/:id/reply` | Texto por WhatsApp |
| POST | `/api/contacts/:id/reply-file` | Archivo por WhatsApp |
| GET | `/api/media/:id` | Imagen del mensaje |

### WhatsApp / audit
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/whatsapp/status` | Estado + QR |
| POST | `/api/whatsapp/restart` | Nueva sesión |
| GET | `/api/audit` | Último chequeo |
| POST | `/api/audit/check` | Correr chequeo |

---

## Progreso (estado actual)

- Fase 1–3, 5: hechas (`be/` + `fe/`, Mongo, Conversaciones, retención, Estado).
- Fase 4 (VPS): procedimiento en `DEPLOY.md` (raíz). Build: `cd fe && npm run build`, no `frontend/`.
- IA: cliente OpenAI-compat; default Groq. Historial LLM se hidrata desde Mongo al restart.
- Tests Aria: `be/test/aria/` (`npm test` en `be/`).

---

## Variables de entorno

```env
LLM_API_KEY=
LLM_MODEL=qwen/qwen3-32b
LLM_BASE_URL=              # vacío = https://api.groq.com/openai/v1
LLM_VOICE_MODEL=whisper-large-v3-turbo
# Alias: GROQ_API_KEY / GROQ_MODEL siguen valiendo
PORT=3000
MONGODB_URI=
NODE_ENV=development
VENOM_SESSION=aria
VENOM_BROWSER=chrome
```

> **TLS local:** si Groq/OpenAI fallan con `fetch failed` (intercepción de certificados), `npm run bot:local` (`node --use-system-ca`). En el VPS: `npm run bot`.

> **MongoDB Atlas — conexión directa (sin SRV):**
> En algunos routers `mongodb+srv://` falla. Usar `mongodb://` con hosts:
> ```
> mongodb://user:pass@host1:27017,host2:27017,host3:27017/aria?authSource=admin&tls=true&replicaSet=<nombre>
> ```

## Cómo correr — desarrollo

```bash
cd be && npm install && npm run build && npm test
cd ../fe && npm install && npm run dev
cd ../be && npm run bot:local   # o npm run dev
```

Primera vez: QR en la pestaña **Estado**. Sesión en `be/tokens/`.

## Cómo correr — producción

Ver `DEPLOY.md`. Resumen: `fe` build estático en nginx, `be` con PM2, `/api` proxied a `:3000`.

```
Internet → nginx → /        fe/dist
                 → /api     Express + VenomBot :3000
```
