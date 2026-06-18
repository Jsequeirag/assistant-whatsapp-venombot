require("dotenv").config();

module.exports = {
  PORT: process.env.PORT || 3000,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
  MONGODB_URI: process.env.MONGODB_URI || "mongodb://localhost:27017/aria",
  NODE_ENV: process.env.NODE_ENV || "development",
};
