# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Aria is a 24/7 AI-powered WhatsApp personal assistant with a web dashboard. It connects to WhatsApp via QR code, auto-responds using Groq LLM (Qwen, Llama, DeepSeek), classifies incoming messages as tasks with priority levels, transcribes voice notes via Whisper, and features DND/Sleep modes — all manageable from a React dashboard.

**Tech Stack:**
- **Backend:** Node.js 20+, Express 5, TypeScript (VenomBot library)
- **WhatsApp:** VenomBot (custom fork in `be/src/`), Puppeteer 24 (Chromium)
- **AI/LLM:** Groq SDK (Qwen3, Llama3, DeepSeek), Whisper for voice transcription
- **Database:** MongoDB Atlas, Mongoose 9
- **Frontend:** React 18, Vite 5, Tailwind CSS 3, Lucide icons
- **Deployment:** PM2, nginx, Let's Encrypt (VPS/DigitalOcean)

## Repository Structure

```
assistant-whatsapp-venombot/
├── be/                      # Backend (main application)
│   ├── src/                 # VenomBot library TypeScript source (DO NOT MODIFY)
│   ├── dist/                # Compiled VenomBot library (npm run build)
│   ├── app/                 # Express application
│   │   ├── config/          # Environment variables
│   │   ├── controllers/     # Request handlers (webhook, settings, contacts, etc.)
│   │   ├── models/          # Mongoose schemas (Contact, Message, Recado, Settings)
│   │   ├── services/        # Business logic (llm, whatsapp, mode, contact, etc.)
│   │   ├── routes/          # Express route definitions
│   │   ├── db.js            # MongoDB connection
│   │   └── server.js        # Express app setup
│   ├── bot/                 # Entry point
│   │   └── index.js         # Main entry: starts Express + VenomBot
│   ├── tokens/              # WhatsApp session tokens (auto-generated)
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
1. **DND (Do Not Disturb):** If active, responds with DND prompt once per contact
2. **Sleep Mode (20:00-08:00):** If active, responds with sleep prompt once per contact
3. **Auto-Assist:** If enabled globally AND per-contact, AI responds normally
4. **Otherwise:** Silent (only classifies as recado, no response)

### WhatsApp Integration
- **VenomBot Library:** Custom fork in `be/src/` (TypeScript). Compile with `npm run build`
- **Session Storage:** Tokens stored in `be/tokens/` (auto-generated after QR scan)
- **QR Generation:** QR code generated in `whatsapp.service.js`, displayed in "Estado" tab
- **Media Handling:** Files sent via temporary files (see `whatsapp.service.sendFileBase64`)

### LLM Integration (Groq)
- **Service:** `be/app/services/llm.service.js`
- **Models:** Supports Groq models (qwen/qwen3-32b, llama3, deepseek) + custom OpenAI-compatible providers
- **Features:** 
  - Chat responses with conversation history
  - Recado classification with priority (alta/media/baja)
  - Content moderation (inappropriate content detection)
  - Voice transcription (Whisper)
- **Configuration:** API key and model stored in MongoDB Settings, seeded from .env

### Database Models
- **Contact:** `{ contactId, number, name, autoAssist, timestamps }`
- **Message:** `{ contactId, contactName, role: "user"|"assistant", content, via: "auto"|"manual", timestamps }`
- **Recado:** `{ contactId, contactName, content, priority: "alta"|"media"|"baja", read, timestamps }`
- **Settings:** Singleton with DND, sleep, autoAssist, identity, groq, retention configs
- **ServiceAudit:** Health check results for Groq/MongoDB/WhatsApp

### Frontend Architecture
- **Tab Navigation:** 4 tabs (Conversaciones, Contacts, Settings, Estado)
- **API Client:** Fetch wrappers in `fe/src/api/`
- **State Management:** React useState per component (no global state)
- **Styling:** Tailwind CSS with custom design system (CSS variables in `fe/src/index.css`)
- **Real-time:** Polling for WhatsApp status and QR code

## Environment Variables

Required in `be/.env`:
```env
GROQ_API_KEY=your_groq_api_key_here   # https://console.groq.com/keys
GROQ_MODEL=qwen/qwen3-32b
MONGODB_URI=mongodb://localhost:27017/aria  # or Atlas connection string
PORT=3000
NODE_ENV=development
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
- `PATCH /api/settings/groq` - Update Groq API key/model
- `GET /api/settings/groq/models` - List available Groq models

### WhatsApp & Status
- `GET /api/whatsapp/status` - Get connection status and QR code
- `POST /api/whatsapp/restart` - Restart WhatsApp session
- `GET /api/audit` - Get service health checks
- `POST /api/audit/check` - Run health check

## Important Implementation Details

### WhatsApp Session Management
- Session tokens stored in `be/tokens/aria-session/` (auto-generated)
- QR code needed only on first connect or after manual restart
- Multi-device support: host ID captured to prevent self-response loops

### MongoDB Connection Notes
- For local development with TLS interception: Use `npm run bot:local` (system CA)
- For Atlas in some networks: Use direct connection (`mongodb://`) instead of SRV (`mongodb+srv://`)

### Scheduled Tasks
- **Service Health Check:** Every 24 hours (audits Groq, MongoDB, WhatsApp)
- **Data Retention:** Every 12 hours (deletes messages older than `settings.retention.days`)
- Both schedulers defined in `be/bot/index.js`

### Voice Message Handling
- Voice messages transcribed using Whisper (Groq)
- Transcription stored as text in Message model
- Audio not persisted (transcription only)

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
   - Send messages to the WhatsApp bot
   - Check logs: `pm2 logs aria` (production) or console (development)
   - Use "Estado" tab to verify service health

## Code Patterns to Follow

### Service Pattern
Services in `be/app/services/` are pure business logic modules:
- Export functions, not classes
- Use async/await for database/LLM calls
- Handle errors gracefully (return defaults, don't crash)
- Cache in-memory where appropriate (e.g., contact conversation history)

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

- **nginx:** Serves frontend static files, proxies `/api` to backend
- **PM2:** Keeps bot running 24/7, auto-restart on crash
- **Let's Encrypt:** HTTPS via Certbot (see `DEPLOY.md`)
- **Chromium:** Auto-downloaded during `npm install`, requires ~500MB space
- **Swap:** VPS with 1GB RAM needs 2GB swap file (see `DEPLOY.md`)

## Troubleshooting

- **WhatsApp not connecting:** Check `be/tokens/` permissions, ensure Chromium dependencies installed
- **Groq API errors:** Verify API key in MongoDB Settings, check service status in "Estado" tab
- **MongoDB connection errors:** Check IP whitelist in Atlas, try direct connection format
- **Frontend build errors:** Clear `fe/node_modules` and reinstall
- **Backend build errors:** Clear `be/dist/` and run `npm run build` again

See `DEPLOY.md` for detailed VPS deployment guide.
