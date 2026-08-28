require("dotenv").config();

/** Endpoint OpenAI-compatible de Groq (default de fábrica). */
const GROQ_OPENAI_BASE = "https://api.groq.com/openai/v1";

const LLM_API_KEY = process.env.LLM_API_KEY || process.env.GROQ_API_KEY;
const LLM_MODEL = process.env.LLM_MODEL || process.env.GROQ_MODEL || "qwen/qwen3-32b";
const LLM_BASE_URL = process.env.LLM_BASE_URL || "";
const LLM_VOICE_MODEL = process.env.LLM_VOICE_MODEL || "whisper-large-v3-turbo";

const NODE_ENV = process.env.NODE_ENV || "development";

module.exports = {
  PORT: process.env.PORT || 3000,
  // Prod detrás de nginx: solo loopback. Local: todas las interfaces.
  LISTEN_HOST: process.env.LISTEN_HOST || (NODE_ENV === "production" ? "127.0.0.1" : "0.0.0.0"),
  ARIA_API_TOKEN: (process.env.ARIA_API_TOKEN || "").trim(),
  CORS_ORIGIN: process.env.CORS_ORIGIN || "",
  LLM_API_KEY,
  LLM_MODEL,
  LLM_BASE_URL,
  LLM_VOICE_MODEL,
  GROQ_OPENAI_BASE,
  // Alias: seed y docs viejos siguen usando GROQ_*
  GROQ_API_KEY: LLM_API_KEY,
  GROQ_MODEL: LLM_MODEL,
  MONGODB_URI: process.env.MONGODB_URI || "mongodb://localhost:27017/aria",
  NODE_ENV,
  // Zona para Sleep 20:00–08:00. No usar TZ del VPS (suele ser UTC).
  DEFAULT_TZ: process.env.ARIA_TZ || "America/Argentina/Buenos_Aires",
};
