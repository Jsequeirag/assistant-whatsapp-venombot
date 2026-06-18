// Configuración de PM2 para correr Aria en el VPS.
// PM2 mantiene el proceso vivo, lo reinicia si crashea y guarda logs.
// Uso (desde la carpeta be/):  pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "aria",
      script: "bot/index.js",
      instances: 1,
      autorestart: true,
      // Si el proceso supera esta memoria, PM2 lo reinicia (Chromium puede inflarse).
      max_memory_restart: "600M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
