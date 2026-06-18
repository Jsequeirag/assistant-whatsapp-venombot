require("dotenv").config();

module.exports = {
  PORT: process.env.PORT || 3000,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  GROQ_MODEL: process.env.GROQ_MODEL || "qwen/qwen3-32b",
  MONGODB_URI: process.env.MONGODB_URI || "mongodb://localhost:27017/aria",
  NODE_ENV: process.env.NODE_ENV || "development",
};
