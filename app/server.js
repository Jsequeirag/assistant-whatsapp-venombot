const express = require("express");
const cors = require("cors");
const { PORT } = require("./config");
const routes = require("./routes");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => res.json({ status: "Aria API running" }));
app.use("/api", routes);

function startServer() {
  return new Promise((resolve) => {
    app.listen(PORT, () => {
      console.log(`🌐 API escuchando en http://localhost:${PORT}/api`);
      resolve();
    });
  });
}

module.exports = { startServer };
