/**
 * Configuración del auto-respondedor.
 * Ajustá horarios, mensajes y comportamiento aquí — no hace falta tocar el resto.
 */
module.exports = {
  // Nombre de la sesión de venom (carpeta donde guarda el login para no re-escanear el QR)
  session: "asistente",

  // Navegador a usar:
  //   'chrome' / 'edge'  → usa el que tengas instalado (recomendado si NO descargaste Chromium)
  //   'chromium'         → usa el Chromium de Puppeteer (requiere el postinstall / descarga)
  browser: "chrome",
  headless: true,

  // Prefijo de los comandos que escribís desde TU propio teléfono para controlar el bot
  commandPrefix: "/",

  // No auto-responder en grupos (true = solo chats individuales)
  ignoreGroups: true,

  // Tiempo mínimo entre auto-respuestas al MISMO contacto, en minutos.
  // Evita responder cada mensaje suelto y parecer spam (clave para no ser baneado).
  cooldownMinutes: 60,

  // Ventanas horarias recurrentes en las que el bot responde solo.
  // Formato 24h "HH:MM". Soporta cruzar la medianoche (ej. 23:00 → 07:00).
  // days (opcional): 0=Dom, 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie, 6=Sáb. Omitir = todos los días.
  schedules: [
    {
      name: "Durmiendo",
      start: "23:00",
      end: "07:00",
      message:
        "Hola 👋 En este momento estoy descansando (23:00–07:00). " +
        "Vi tu mensaje y te respondo apenas me despierte. ¡Gracias por la paciencia!",
    },
    // Ejemplo de horario laboral (descomentá y ajustá si querés):
    // {
    //   name: "Fuera de horario",
    //   start: "18:00",
    //   end: "09:00",
    //   days: [1, 2, 3, 4, 5], // lunes a viernes
    //   message: "Gracias por escribir 🙌 Mi horario de atención es 9:00–18:00. Te respondo mañana.",
    // },
  ],

  // Mensaje cuando activás el modo "No molestar" manualmente (/dnd)
  dndMessage:
    "Hola 👋 Estoy ocupado en este momento y no puedo responder. " +
    "Te contesto en cuanto me libere. ¡Gracias!",
};
