# Aria — Asistente Personal WhatsApp

Asistente personal vía WhatsApp con IA (Groq), gestionado por VenomBot en Node.js/Express.
Desplegado en VPS DigitalOcean con nginx como reverse proxy y PM2 como gestor de procesos.

---

## Stack

| Capa | Tecnología |
|---|---|
| WhatsApp | VenomBot (dist/ compilado de TypeScript) |
| Backend | Node.js / Express (mismo proceso: bot + API REST) |
| IA | Groq (`qwen/qwen3-32b`, `reasoning_effort: none`) via `groq-sdk` |
| Base de datos | MongoDB + Mongoose |
| Frontend | React |
| Reverse proxy | nginx (termina TLS, redirige a Express en localhost:3000) |
| Proceso | PM2 (reinicio automático, logs persistentes) |
| Certificados | Let's Encrypt (Certbot) |
| Infraestructura | DigitalOcean Droplet (Ubuntu 24.04.3 LTS) |

---

## Estructura de carpetas

```
assistant-whatsapp-venombot/
├── src/              ← librería venom (TypeScript, NO tocar)
├── dist/             ← librería venom compilada (npm run build)
├── bot/              ← capa de conexión a WhatsApp
│   └── index.js      ← entry point: arranca VenomBot + Express
├── app/              ← backend Express ✅
│   ├── config/
│   │   └── index.js  ← variables de entorno
│   ├── db.js         ← conexión Mongoose a MongoDB Atlas
│   ├── models/       ← esquemas Mongoose ✅
│   │   ├── Contact.js
│   │   ├── Recado.js
│   │   └── Settings.js
│   ├── services/
│   │   ├── llm.service.js      ← integración Groq (responder + clasificar recado/contenido)
│   │   ├── mode.service.js     ← lógica DND → Sleep → Auto-asistir (MongoDB)
│   │   ├── contact.service.js  ← CRUD contactos MongoDB; sesión de conversación in-memory
│   │   └── recado.service.js   ← CRUD recados MongoDB
│   ├── controllers/
│   │   ├── webhook.controller.js   ← procesa mensajes entrantes de WhatsApp
│   │   ├── recados.controller.js   ← endpoints REST para recados
│   │   ├── settings.controller.js  ← endpoints REST para settings/modos
│   │   └── contacts.controller.js  ← endpoints REST para contactos
│   ├── routes/
│   │   └── index.js
│   └── server.js
├── frontend/             ← React app (Fase 3 ✅)
│   ├── src/
│   │   ├── api/client.js   ← fetch wrappers para todos los endpoints
│   │   ├── views/
│   │   │   ├── Recados.jsx
│   │   │   ├── Contacts.jsx
│   │   │   └── Settings.jsx
│   │   ├── App.jsx         ← tab navigation
│   │   ├── main.jsx
│   │   └── index.css
│   ├── vite.config.js    ← proxy /api → localhost:3000
│   └── package.json
├── ARIA_REQUIREMENTS.md  ← este archivo
├── .env.example
├── ecosystem.config.js   ← configuración PM2 (Fase 4)
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

## Esquemas MongoDB

### Contact
```js
{ contactId: String,   // "5491112345678@c.us" (unique)
  number: String,
  name: String,
  autoAssist: { type: Boolean, default: false },
  timestamps: true }
// recadoCompleted es estado de sesión → in-memory (no persiste)
```

### Recado
```js
{ contactId: String,
  contactName: String,
  content: String,
  read: { type: Boolean, default: false },
  timestamps: true }   // createdAt se usa como timestamp de recepción
```

### Settings (singleton — un solo documento)
```js
{
  dnd:  { active: Boolean, reason: String, prompt: String,
          respondedContacts: [String] },  // $addToSet / reset al desactivar
  sleep: { active: Boolean, prompt: String,
           respondedContacts: [String] },
  autoAssist: { globalEnabled: Boolean },
  identity: { ownerName: String, assistantName: String },
  groq: { apiKey: String, model: String },
  retention: { days: Number }   // 0 = nunca borrar; default 30
}
```

---

## Endpoints REST

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
| PATCH | `/api/settings/retention` | Días de retención de recados/mensajes (0 = no borrar) |

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
- [x] `app/services/llm.service.js` (Groq; migrado desde Gemini por límite de cuota)
- [x] `app/services/mode.service.js`
- [x] `app/services/contact.service.js` (in-memory)
- [x] `app/services/recado.service.js` (in-memory)
- [x] `app/controllers/webhook.controller.js`
- [x] Endpoints REST recados / settings / contacts
- [x] `.env.example`

### Fase 2 — MongoDB ✅
- [x] Conectar Mongoose (`app/db.js`)
- [x] Modelos Contact, Recado, Settings (`app/models/`)
- [x] Migrar services de in-memory a MongoDB
- [x] Migrar respondedContacts a Settings model (usa `$addToSet` en MongoDB)

### Fase 3 — Frontend React ✅
- [x] Vista recados con filtro leído/no leído (filtro client-side, badge de no leídos)
- [x] Panel configuración de modos + prompts (DND / Sleep / Auto-asistir)
- [x] Lista contactos con CRUD + toggle auto-asistir (optimistic update)
- [x] Vite + React 18 + Tailwind CSS en `frontend/`
- [x] Proxy `/api` → `localhost:3000` en desarrollo (`vite.config.js`)
- [x] Prioridad de recados (alta/media/baja) — clasificada por la IA, con badge, filtro y orden
- [x] Pestañita "Ver mensaje original" en cada recado (interpretación IA + texto original)
- [x] Pestaña Estado: auditoría de servicios (Groq/Mongo/WhatsApp), API key de Groq editable
      (guardada en Mongo) con dropdown de modelos y botón "Verificar", y QR de WhatsApp en vivo

### Fase 4 — Despliegue VPS 🔲
- [ ] Droplet Ubuntu 24.04.3 LTS en DigitalOcean
- [x] MongoDB Atlas conectado (conexión directa, sin SRV — ver nota abajo)
- [ ] Node.js 20+ vía NodeSource (Ubuntu 24.04 trae Node 18 por defecto)
- [ ] nginx configurado como reverse proxy (HTTPS → localhost:3000)
- [ ] Certbot + Let's Encrypt para certificado SSL del dominio
- [ ] Build del frontend: `cd frontend && npm install && npm run build`
- [ ] nginx sirve `frontend/dist/` como estático + proxy `/api` a Express
- [ ] PM2 instalado y `ecosystem.config.js` configurado
- [ ] Primer escaneo QR (desde la pestaña Estado del panel, o consola); sesión guardada en `tokens/`
- [ ] `.env` de producción con `NODE_ENV=production`

### Fase 5 — Vista conversacional / Chat con hilos ✅
Los recados ya no son solo una lista plana: hay una vista "Conversaciones" que los agrupa
por contacto y muestra el hilo completo de mensajes, con respuesta desde la app.

- [x] **Agrupar recados por contacto** (por `contactId`) en la vista "Conversaciones".
      Cada contacto muestra su último recado + contador de no leídos + prioridad más alta;
      al expandir, se ve la conversación. (`fe/src/views/Conversaciones.jsx`)
- [x] **Vista expandible por contacto**: timeline de mensajes ordenado cronológicamente,
      UI tipo chat (burbujas: entrante a la izquierda, asistente a la derecha). Los recados
      del contacto se listan arriba con prioridad. Los salientes indican si fueron `🤖 auto`
      o `✍️ manual`.
- [x] **Threaded chat persistente**:
      - Modelo `Message { contactId, contactName, role: "user"|"assistant", content, via, timestamps }`
        (`app/models/Message.js`) + `app/services/message.service.js`.
      - El webhook persiste TODOS los mensajes (entrantes y salientes), no solo los recados.
        El historial in-memory (`contact.service.js` → sessionState) se mantiene para contexto del LLM.
      - Endpoint `GET /api/contacts/:id/messages` para traer la conversación.
  - [x] **Responder desde la app**: input de respuesta en la vista de conversación que envía
        vía WhatsApp. `whatsapp.service.sendText()` + `POST /api/contacts/:id/reply` (persiste
        el mensaje con `via: "manual"` y lo agrega al historial in-memory).

#### Endpoints nuevos (Fase 5)
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/contacts/:id/messages` | Historial conversacional del contacto (orden cronológico) |
| POST | `/api/contacts/:id/reply` | Envía un mensaje de WhatsApp al contacto desde el panel |

#### Refinamientos posteriores (Fase 5.1)
- [x] **Recados fusionados en Conversaciones**: se eliminó la pestaña "Recados". Dentro de cada
      contacto se ven sus recados con nivel de importancia + interpretación de la IA (por defecto),
      con un **toggle general por contacto** "Ver mensajes originales" (no uno por uno) y botón de
      marcar leído/sin leído. "Conversaciones" es ahora la pestaña por defecto.
- [x] **Retención de datos configurable**: `settings.retention.days` (UI en Configuración con
      atajos 1/2/7/30/90 días; 0 = no borrar). Scheduler en `bot/index.js` (`cleanup.service.js`)
      corre al arrancar y cada 12h: borra recados y mensajes más viejos que los días configurados,
      para ahorrar espacio en la DB. El scheduler de health-check de servicios (24h) queda intacto.
- [x] **Emoji picker** (`fe/src/components/EmojiPicker.jsx`, sin dependencias) en los campos de
      motivo/contexto de DND y modo dormir.

---

## Variables de entorno requeridas

```env
GROQ_API_KEY=           # https://console.groq.com/keys
GROQ_MODEL=qwen/qwen3-32b
PORT=3000
MONGODB_URI=            # Ver nota abajo sobre formato de conexión
NODE_ENV=development    # producción: NODE_ENV=production
```

> **Nota TLS local (intercepción de certificados):**
> En redes que interceptan TLS, las llamadas a Groq fallan con `fetch failed`.
> Correr local con `npm run bot:local` (usa `node --use-system-ca`, toma el CA del sistema).
> En el VPS no hace falta — usar `npm run bot`.

> **Nota MongoDB Atlas — conexión directa (sin SRV):**
> Node.js usa `c-ares` como resolver DNS, que falla con queries SRV en algunos routers domésticos.
> Usar `mongodb://` con los nodos directos en lugar de `mongodb+srv://`:
> ```
> mongodb://user:pass@host1:27017,host2:27017,host3:27017/aria?authSource=admin&tls=true&replicaSet=<nombre>
> ```
> El replicaSet name y los hosts se obtienen con:
> ```powershell
> Resolve-DnsName -Name "cluster0.<id>.mongodb.net" -Type TXT
> Resolve-DnsName -Name "_mongodb._tcp.cluster0.<id>.mongodb.net" -Type SRV
> ```

## Cómo correr — desarrollo local

```bash
npm install
npm run build           # compila librería venom (TypeScript → dist/)
npm run bot:local       # arranca todo con --use-system-ca (evita fetch failed por TLS)
```

> Primera vez: escanear QR que aparece en consola. La sesión se guarda en `tokens/`.

## Cómo correr — producción (VPS)

```bash
# 1. Clonar repo y preparar
npm install
npm run build
cp .env.example .env    # completar variables

# 2. Arrancar con PM2
pm2 start ecosystem.config.js
pm2 save                # guardar lista de procesos para reinicio automático
pm2 startup             # habilitar PM2 al boot del sistema

# 3. Primera conexión WhatsApp
pm2 logs aria           # ver QR en consola y escanearlo con el teléfono
```

## Arquitectura de red en VPS

```
Internet
    │  HTTPS :443
    ▼
  nginx  ──── TLS termination (Let's Encrypt)
    │  HTTP  localhost:3000
    ▼
Express (bot/index.js)
    ├── API REST  /api/*
    └── VenomBot  → WhatsApp Web
```

nginx redirige `http → https` automáticamente.
El frontend React (Fase 3) puede servirse como estático desde nginx en la misma VM
o desde un servicio separado (Vercel, Netlify, etc.).
