# Despliegue de Aria en un VPS (DigitalOcean) — guía para principiantes

Esta guía monta Aria en un droplet Ubuntu **usando la IP directa con HTTP**.
Cuando consigas un dominio, al final está la sección para agregar HTTPS.

```
Internet → IP del droplet → nginx ┬→ panel React (estático)
                                  └→ /api → Express + Bot (Node :3000) → WhatsApp + MongoDB Atlas
```

Convención de esta guía: el repo se clona en `/var/www/aria` (queda `/var/www/aria/be` y `/var/www/aria/fe`).

> 💡 Tip: cada bloque de comandos se copia y pega completo en la terminal del droplet.
> Las líneas que empiezan con `#` son comentarios (no hacen nada, solo explican).

---

## Paso 1 — Conectarte al droplet por SSH

Desde tu PC (PowerShell o Git Bash), reemplazá `LA_IP` por la IP de tu droplet
(la ves en el panel de DigitalOcean):

```bash
ssh root@LA_IP
```

La primera vez te pregunta si confiás en el host → escribí `yes`.
Si DigitalOcean te pidió contraseña al crear el droplet, la ingresás; si usaste llave SSH, entra solo.

---

## Paso 2 — Preparar el servidor (actualizar, swap, firewall)

```bash
# Actualizar la lista de paquetes e instalar actualizaciones
apt update && apt upgrade -y

# Crear 2 GB de "swap" (memoria de respaldo en disco). Chromium/WhatsApp consume
# RAM; sin esto un droplet de 1 GB se puede quedar sin memoria y morir.
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Firewall: permitir SSH y web (HTTP/HTTPS), bloquear el resto
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
```

---

## Paso 3 — Instalar Node.js 20, git, nginx y PM2

```bash
# Node.js 20 (el repo de Ubuntu trae uno viejo; usamos el oficial de NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs git nginx

# PM2 (mantiene Aria corriendo 24/7) — se instala global con npm
npm install -g pm2

# Verificá versiones (Node debe ser v20.x)
node -v && npm -v
```

---

## Paso 4 — Dependencias de Chromium (para WhatsApp Web)

Aria usa un navegador headless (Chromium) para conectarse a WhatsApp. En un servidor
sin escritorio hay que instalarle las librerías del sistema que Chromium necesita:

```bash
apt install -y \
  ca-certificates fonts-liberation libasound2t64 libatk-bridge2.0-0 libatk1.0-0 \
  libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libgcc-s1 \
  libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libx11-6 libxcomposite1 \
  libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 xdg-utils libu2f-udev
```

> Este es el paso que más suele fallar. Si al final el bot no levanta el navegador,
> volvemos acá.

---

## Paso 5 — Clonar el repositorio

```bash
git clone https://github.com/Jsequeirag/Aria-assistant-whatsapp-venombot.git /var/www/aria
cd /var/www/aria
```

---

## Paso 6 — Backend: variables de entorno y build

```bash
cd /var/www/aria/be

# Crear el archivo .env a partir del ejemplo
cp .env.example .env

# Editarlo (se abre el editor "nano")
nano .env
```

En el editor, dejá el `.env` así (completá tus valores reales):

```env
GROQ_API_KEY=tu_api_key_de_groq
GROQ_MODEL=qwen/qwen3-32b
PORT=3000
NODE_ENV=production
VENOM_SESSION=aria
VENOM_BROWSER=chrome
MONGODB_URI=tu_string_de_conexion_de_mongodb_atlas
```

Guardar en nano: `Ctrl + O`, `Enter`, luego salir con `Ctrl + X`.

> En el VPS podés usar `mongodb+srv://...` normal de Atlas (el problema de SRV era de tu
> router en casa). Acordate de agregar la IP del droplet en Atlas → Network Access.

Ahora instalar dependencias y compilar la librería venom (TypeScript → `dist/`):

```bash
npm install
npm run build
```

---

## Paso 7 — Frontend: build

```bash
cd /var/www/aria/fe
npm install
npm run build
```

Esto genera `/var/www/aria/fe/dist`, que es lo que servirá nginx.

---

## Paso 8 — Configurar nginx

```bash
# Copiar la config incluida en el repo
cp /var/www/aria/deploy/nginx-aria.conf /etc/nginx/sites-available/aria

# Activarla (symlink) y desactivar la default
ln -s /etc/nginx/sites-available/aria /etc/nginx/sites-enabled/aria
rm -f /etc/nginx/sites-enabled/default

# Probar que la config no tenga errores y recargar
nginx -t
systemctl reload nginx
```

Probá en el navegador: `http://LA_IP` → deberías ver el panel de Aria.

---

## Paso 9 — Arrancar Aria con PM2

```bash
cd /var/www/aria/be

# Arrancar usando la config de PM2
pm2 start ecosystem.config.js

# Guardar la lista de procesos y hacer que arranque solo al reiniciar el servidor
pm2 save
pm2 startup
# ↑ pm2 startup imprime UN comando que tenés que copiar y pegar para confirmar.
```

---

## Paso 10 — Conectar WhatsApp (escanear QR)

```bash
# Ver los logs en vivo (ahí aparece el QR en ASCII)
pm2 logs aria
```

Escaneá el QR con WhatsApp del teléfono (WhatsApp → Dispositivos vinculados → Vincular dispositivo).
La sesión queda guardada en `be/tokens/` y no hay que volver a escanear.

> También podés ver el QR como imagen en el panel: `http://LA_IP` → pestaña **Estado**.

Para salir de los logs: `Ctrl + C` (no apaga el bot, solo deja de mostrar logs).

---

## Comandos útiles del día a día

```bash
pm2 status          # ver si Aria está corriendo
pm2 logs aria       # ver logs
pm2 restart aria    # reiniciar
pm2 stop aria       # detener
```

Para actualizar Aria cuando subas cambios nuevos al repo:

```bash
cd /var/www/aria && git pull
cd be && npm install && npm run build
cd ../fe && npm install && npm run build
pm2 restart aria
systemctl reload nginx
```

---

## Paso 11 (más adelante) — Dominio + HTTPS 🔒

Cuando tengas un dominio:

1. En tu proveedor de DNS, creá un registro **A**: `aria.tudominio.com → LA_IP`.
2. Editá `/etc/nginx/sites-available/aria` y cambiá `server_name _;` por `server_name aria.tudominio.com;`. Recargá: `nginx -t && systemctl reload nginx`.
3. Instalá Certbot y pedí el certificado (gratis, Let's Encrypt):

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d aria.tudominio.com
```

Certbot configura HTTPS y la redirección http→https automáticamente. Listo, candadito 🔒.
