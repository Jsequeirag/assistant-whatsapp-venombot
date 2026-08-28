# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Aria is a 24/7 AI-powered WhatsApp personal assistant with a web dashboard. It connects to WhatsApp via QR code, auto-responds using an OpenAI-compatible LLM (Groq by default: Qwen, Llama, DeepSeek), classifies incoming messages as recados with priority levels, transcribes voice notes via Whisper, and features DND/Sleep modes — all manageable from a React dashboard.

**Tech Stack:**
- **Backend:** Node.js 20+, Express 5, TypeScript (VenomBot library)
- **WhatsApp:** VenomBot (custom fork in `be/src/`), Puppeteer 24 (Chromium)
- **AI/LLM:** OpenAI SDK against any `/v1` Chat Completions provider (default Groq). Whisper for voice.
- **Database:** MongoDB Atlas, Mongoose 9
- **Frontend:** React 18, Vite 5, Tailwind CSS 3 (`fe/`)
- **Deployment:** PM2, nginx, Let's Encrypt (VPS/DigitalOcean)

## Repository Structure

```
assistant-whatsapp-venombot/
├── be/                      # Backend (main application)
│   ├── src/                 # VenomBot library TypeScript source (DO NOT MODIFY)
│   ├── dist/                # Compiled VenomBot library (npm run build)
│   ├── app/                 # Express application
│   │   ├── config/          # Environment variables
│   │   ├── lib/             # Pure helpers (incoming message / mode turn)
│   │   ├── controllers/     # Request handlers (webhook, settings, contacts, media)
│   │   ├── models/          # Mongoose schemas (Contact, Message, Recado, Settings)
│   │   ├── services/        # Business logic (llm, whatsapp, mode, contact, media)
│   │   ├── routes/          # Express route definitions
│   │   ├── db.js            # MongoDB connection
│   │   └── server.js        # Express app setup
│   ├── bot/                 # Entry point
│   │   └── index.js         # Main entry: starts Express + VenomBot
│   ├── media/               # Incoming/outgoing images (not git; not Mongo Base64)
│   ├── test/aria/           # Unit tests (npm test) — Venom smoke is test/index.js
│   ├── tokens/              # WhatsApp session tokens (auto-generated, gitignored)
│   ├── ecosystem.config.js  # PM2 process configuration
│   └── package.json
├── fe/                      # Frontend (React dashboard)
│   ├── src/
│   │   ├── api/             # API client wrappers
│   │   ├── components/      # React components (UI, badges, etc.)
│   │   ├── views/            # Page components (Conversaciones, Contacts, Settings, Estado)
│   │   ├── App.jsx          # Main app with tab navigation
│   │   └── main.jsx         # React entry point
│   ├── dist/                # Production build (npm run build)
│   └── package.json
├── deploy/                  # Deployment configurations (nginx, etc.)
├── avatars/                 # Contact avatar images
└── README.md                # User-facing documentation
```

## Common Development Commands

### Backend Development
```bash
cd be
npm install              # Installs dependencies (~500 MB Chromium download)
npm run build            # Compiles VenomBot TypeScript library (src/ → dist/)
npm run dev              # Concurrent: compiles TS + starts bot with hot reload
npm run bot              # Start bot only (requires build first)
npm run bot:local        # Start with system CA (fixes TLS issues in some networks)
npm test                 # Aria unit tests (node:test, no Chromium)
```

### Frontend Development
```bash
cd fe
npm install              # Install dependencies
npm run dev              # Start Vite dev server (http://localhost:5173)
npm run build            # Build for production (creates dist/)
npm run preview          # Preview production build
```

### Production Deployment (VPS)
```bash
# Build frontend
cd fe && npm install && npm run build

# Configure nginx (see deploy/nginx-aria.conf)
# Backend
cd be
pm2 start ecosystem.config.js
pm2 save && pm2 startup
```

### Useful PM2 Commands
```bash
pm2 status               # Check if Aria is running
pm2 logs aria            # View logs
pm2 restart aria         # Restart
pm2 stop aria            # Stop
```

## Architecture & Key Patterns

### Backend Architecture
- **Monolithic Entry:** `be/bot/index.js` starts both Express API and VenomBot in same process
- **Service Layer:** Business logic in `be/app/services/` (llm.service, whatsapp.service, mode.service, etc.)
- **Controllers:** Handle HTTP requests in `be/app/controllers/`
- **Models:** Mongoose schemas in `be/app/models/` (Contact, Message, Recado, Settings)
- **Message Flow:** WhatsApp → webhook.controller → services (mode check → LLM → classify) → MongoDB → Response

### Mode Priority System
When a message arrives, Aria checks modes in priority order:
1. **DND (Do Not Disturb):** If active, one greeting per contact until DND is turned off
2. **Sleep Mode (20:00–08:00 in `settings.timezone`):** If active and in hours, one greeting per contact
3. **Auto-Assist:** If `settings.autoAssist.globalEnabled` is on, AI continues the conversation (there is **no** per-contact autoAssist flag)
4. **Otherwise:** Silent (still classifies recado; no WhatsApp reply)

Logic lives in `be/app/lib/incoming.js` (`resolvePresence`, `decideTurn`).

### WhatsApp Integration
- **VenomBot Library:** Custom fork in `be/src/` (TypeScript). Compile with `npm run build`
- **Session Storage:** Tokens stored in `be/tokens/` (auto-generated after QR scan)
- **QR Generation:** QR code generated in `whatsapp.service.js`, displayed in "Estado" tab
- **Media Handling:** Incoming visuals saved under `be/media/` and served at `GET /api/media/:id`. Outgoing files via `whatsapp.service.sendFileBase64`. Do not store Base64 in Mongo.

### LLM Integration (OpenAI-compatible)
- **Service:** `be/app/services/llm.service.js` (`openai` package, Chat Completions)
- **Default base URL:** `https://api.groq.com/openai/v1` when `baseUrl` is empty
- **Other presets:** OpenAI, OpenRouter, xAI, or any `/v1` clone (Estado tab)
- **When Aria replies:** one combined turn (recado + content filter + reply + completed). Silence path: classify recado only. Rate limit 8 chats/min/contact.
- **Voice:** `POST /v1/audio/transcriptions` (Whisper). Not all providers implement it.
- **Configuration:** key/model/baseUrl/voiceModel in MongoDB `settings.groq` (historical field name), seeded from `.env`

### Database Models
- **Contact:** `{ contactId, number, name, avatarUrl, timestamps }` — **no** `autoAssist`
- **Message:** `{ contactId, contactName, role, content, via, isTranscribed, mediaPath, mediaType, aiClassification, timestamps }`. Legacy `mediaData` Base64 may still exist; `/api/media/:id` migrates it to disk.
- **Recado:** `{ contactId, contactName, content, originalContent, priority: "alta"|"media"|"baja", read, timestamps }`
- **Settings:** Singleton: DND, sleep, autoAssist.globalEnabled, identity, groq (OpenAI-compat blob), retention, timezone
- **ServiceAudit:** Health checks for IA (`service: "groq"`), MongoDB, WhatsApp

LLM conversation history is a RAM Map hydrated from Mongo on process start (`contact.service.ensureSession`). Idle > 20 min resets the thread. Dashboard history is always Mongo.

### Frontend Architecture
- **Tab Navigation:** 4 tabs (Conversaciones, Contacts, Settings, Estado)
- **API Client:** Fetch wrappers in `fe/src/api/`
- **State Management:** React useState per component (no global state)
- **Styling:** Tailwind CSS with custom design system (CSS variables in `fe/src/index.css`)
- **Real-time:** Conversaciones poll every 5s; Estado (WhatsApp/QR) every 4s

## Environment Variables

Required in `be/.env` (see `be/.env.example`). `GROQ_*` still works as alias:
```env
LLM_API_KEY=your_api_key_here
LLM_MODEL=qwen/qwen3-32b
LLM_BASE_URL=                         # empty = Groq OpenAI-compat URL
LLM_VOICE_MODEL=whisper-large-v3-turbo
MONGODB_URI=mongodb://localhost:27017/aria
PORT=3000
NODE_ENV=development
ARIA_API_TOKEN=          # X-Aria-Token; en prod nginx lo inyecta. openssl rand -hex 24
LISTEN_HOST=             # production default 127.0.0.1
CORS_ORIGIN=             # vacío = same-origin
VENOM_SESSION=aria
VENOM_BROWSER=chrome   # chrome | edge | chromium
```

## API Endpoints

### Messages & Conversations
- `GET /api/contacts` - List all contacts
- `GET /api/contacts/:id/messages` - Get conversation history
- `POST /api/contacts/:id/reply` - Send text reply
- `POST /api/contacts/:id/reply-file` - Send file/image reply

### Settings & Modes
- `GET /api/settings` - Get all settings
- `PATCH /api/settings/dnd` - Update DND mode
- `PATCH /api/settings/sleep` - Update sleep mode
- `PATCH /api/settings/auto-assist` - Toggle global auto-assist
- `PATCH /api/settings/groq` - Update OpenAI-compat key/model/baseUrl/voice (Mongo field still named `groq`)
- `GET /api/settings/groq/models` - List chat models (`GET /v1/models`)
- `GET /api/media/:id` - Serve a message image (disk or legacy Base64)

### WhatsApp & Status
- `GET /api/whatsapp/status` - Get connection status and QR code
- `POST /api/whatsapp/restart` - Restart WhatsApp session
- `GET /api/audit` - Get service health checks
- `POST /api/audit/check` - Run health check

## Important Implementation Details

### WhatsApp Session Management
- Session tokens stored in `be/tokens/` (gitignored; auto-generated)
- QR code needed only on first connect or after manual restart
- Multi-device support: host ID captured to prevent self-response loops

### MongoDB Connection Notes
- For local development with TLS interception: Use `npm run bot:local` (system CA)
- For Atlas in some networks: Use direct connection (`mongodb://`) instead of SRV (`mongodb+srv://`)

### Scheduled Tasks
- **Service Health Check:** Every 24 hours (audits LLM, MongoDB, WhatsApp)
- **Data Retention:** Every 12 hours (deletes recados/messages older than `settings.retention.days` and files in `be/media/`)
- Both schedulers defined in `be/bot/index.js`

### Voice Message Handling
- Voice messages transcribed via `/v1/audio/transcriptions` (Whisper-compatible)
- Transcription stored as text in Message; audio is not kept
- If the provider has no transcriptions endpoint, the message is stored as a generic audio label

## Development Workflow

1. **First-time setup:**
   - Copy `be/.env.example` to `be/.env` and fill in values
   - Run `npm install` in both `be/` and `fe/`
   - Run `cd be && npm run build` to compile VenomBot library
   - Start backend: `cd be && npm run dev`
   - Start frontend: `cd fe && npm run dev`
   - Open `http://localhost:5173`, go to "Estado" tab, scan QR code

2. **Making changes:**
   - Backend: Edit files in `be/app/`, changes hot-reload with `npm run dev`
   - Frontend: Edit files in `fe/src/`, changes hot-reload with Vite
   - VenomBot library: Edit `be/src/`, then run `npm run build` to recompile

3. **Testing changes:**
   - `cd be && npm test` for unit tests (incoming, modes, LLM parse, media paths, session)
   - Send messages to the WhatsApp bot for end-to-end
   - Check logs: `pm2 logs aria` (production) or console (development)
   - Use "Estado" tab to verify service health

## Code Patterns to Follow

### Service Pattern
Services in `be/app/services/` are pure business logic modules:
- Export functions, not classes
- Use async/await for database/LLM calls
- Handle errors gracefully (return defaults, don't crash)
- Cache in-memory where appropriate (LLM session Map, hydrated from Mongo)

### Controller Pattern
Controllers in `be/app/controllers/` handle HTTP concerns:
- Validate request data
- Call services for business logic
- Return appropriate HTTP status codes
- Handle errors with try/catch

### Frontend Component Pattern
- Functional components with hooks
- Tailwind classes for styling (use design system CSS variables)
- API calls in `useEffect` or event handlers
- Optimistic updates for better UX

## Deployment Notes

- **nginx:** Serves frontend, Basic Auth on the whole site, proxies `/api` to Express on 127.0.0.1 (injects `X-Aria-Token`)
- **PM2:** Keeps bot running 24/7, auto-restart on crash
- **Let's Encrypt:** HTTPS via Certbot (see `DEPLOY.md`)
- **Chromium:** Auto-downloaded during `npm install`, requires ~500MB space
- **Swap:** VPS with 1GB RAM needs 2GB swap file (see `DEPLOY.md`)

## Troubleshooting

- **WhatsApp not connecting:** Check `be/tokens/` permissions, ensure Chromium dependencies installed
- **LLM API errors:** Verify key/base URL in Estado, check service status there. Empty base URL = Groq.
- **MongoDB connection errors:** Check IP whitelist in Atlas, try direct connection format
- **Frontend build errors:** Clear `fe/node_modules` and reinstall
- **Backend build errors:** Clear `be/dist/` and run `npm run build` again

See `DEPLOY.md` for detailed VPS deployment guide.
