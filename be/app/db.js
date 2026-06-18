const mongoose = require("mongoose");
const { MONGODB_URI } = require("./config");

async function connectDB() {
  await mongoose.connect(MONGODB_URI);
  console.log("✅ MongoDB conectado:", mongoose.connection.host);
}

module.exports = { connectDB };
