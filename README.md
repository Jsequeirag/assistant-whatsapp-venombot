# 🤖 Aria — AI WhatsApp Personal Assistant

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen?logo=node.js)](https://nodejs.org)
[![React](https://img.shields.io/badge/react-18.3-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/atlas)
[![Groq](https://img.shields.io/badge/LLM-Groq-F55036?logo=groq)](https://groq.com)

> **24/7 AI-powered WhatsApp personal assistant** with a web dashboard. Connects to your WhatsApp via QR code, auto-responds using an OpenAI-compatible LLM (Groq by default: Qwen, Llama, DeepSeek), classifies incoming messages as recados with priority levels, transcribes voice notes via Whisper, and features DND/Sleep modes — all manageable from a React dashboard (`fe/`).

---

## ✨ Features

| Category | Capabilities |
|---|---|
| 🧠 **AI Responses** | Auto-reply via OpenAI-compatible Chat Completions · Groq default · OpenAI / OpenRouter / xAI presets |
| 📋 **Task Classification** | Detects "Recados" · Priority: alta / media / baja |
| 🎙 **Voice Transcription** | Whisper (`/v1/audio/transcriptions`) when the provider supports it |
| 📱 **WhatsApp Integration** | QR pairing · Real-time messages · Send text, images & files |
| 🌙 **Operational Modes** | DND · Sleep (20:00–08:00) · Auto-Assist **global** (no per-contact flag) |
| 📊 **Web Dashboard** | Conversaciones · Contactos · Configuración · Estado (`fe/`) |
| 🗄 **Persistence** | MongoDB for history · Images on disk (`be/media/`) · Configurable retention |
| 🔍 **Service Health** | Audit logs · LLM latency · MongoDB · WhatsApp |

---

## 🛠 Tech Stack

| Layer | Technologies |
|---|---|
| **Backend** | Node.js 20+, Express 5, TypeScript |
| **WhatsApp** | VenomBot, Puppeteer 24 (Chromium) |
| **AI / LLM** | `openai` SDK (Chat Completions). Default Groq; any `/v1` provider |
| **Database** | MongoDB Atlas, Mongoose 9 |
| **Frontend** | React 18, Vite 5, Tailwind CSS 3, Lucide |
| **Deployment** | PM2, nginx, Let's Encrypt (VPS / DigitalOcean) |

---

## 📋 System Requirements

- Node.js ≥ 20
- MongoDB (local or [Atlas free tier](https://www.mongodb.com/atlas))
- LLM API key (Groq by default — [console.groq.com](https://console.groq.com); or OpenAI / OpenRouter / xAI)
- ~700 MB disk space (Chromium auto-downloaded on `npm install`)
- Linux VPS recommended for 24/7 uptime (Ubuntu 22.04+)

---

## 🚀 Installation

### 1 — Clone the repository

```bash
git clone https://github.com/Jsequeirag/aria-whatsapp-assistant.git
cd aria-whatsapp-assistant
```

### 2 — Configure the backend

```bash
cd be
cp .env.example .env   # edit .env with your credentials (see below)
npm install            # also downloads Chromium (~500 MB)
```

### 3 — Configure the frontend

```bash
cd ../fe
npm install
```

### 4 — Start in development mode

```bash
# Terminal 1 — backend (auto-compiles TypeScript + starts bot)
cd be && npm run dev

# Terminal 2 — frontend
cd fe && npm run dev
```

Open your browser at `http://localhost:5173` and scan the QR code shown in the **Estado** tab.

---

## ⚙️ Configuration

Create `be/.env` from the example and fill in your values:

```env
# Required (GROQ_API_KEY / GROQ_MODEL still work as aliases)
LLM_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxx
LLM_MODEL=qwen/qwen3-32b
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/aria

# Optional
LLM_BASE_URL=              # empty = https://api.groq.com/openai/v1
LLM_VOICE_MODEL=whisper-large-v3-turbo
PORT=3000
NODE_ENV=development
VENOM_SESSION=aria
```

All other settings (assistant name, DND message, retention days, custom LLM provider) are configurable from the dashboard **without restarting** the bot.

---

## 🖥 Dashboard Overview

| Tab | Purpose |
|---|---|
| **Conversaciones** | View message threads per contact, send replies or files |
| **Contactos** | Manage contacts (name / number). Auto-assist is global, in Configuración |
| **Configuración** | Modes (DND/Sleep/Auto-Assist global), identity, retention |
| **Estado** | WhatsApp QR, LLM provider (OpenAI-compat presets), service health |
---

## 🚢 Production Deployment (VPS)

```bash
# Build frontend
cd fe && npm run build

# Configure nginx to serve fe/dist/ and proxy /api → :3000
# (see deploy/nginx-aria.conf for a ready-to-use config)

# Start backend with PM2
cd be
pm2 start ecosystem.config.js
pm2 save && pm2 startup
```

---

## 📅 Commit Strategy

Maintaining visible GitHub activity for a personal project:

| Frequency | What to commit |
|---|---|
| **After every feature** | New capability, UI component, API endpoint |
| **After every fix** | Bug squash, behaviour correction |
| **Weekly** | Dependency bumps (`npm update`), config tweaks |
| **Monthly** | Refactors, performance improvements, docs updates |

Suggested branch strategy: work directly on `main` for solo projects; create a branch only for larger features (`feat/voice-replies`).

---

## 📄 License

MIT — see [LICENSE](LICENSE).

---

<sub>Built with ❤️ using VenomBot, Groq, and MongoDB.</sub>
