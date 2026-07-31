# Stickerity 🚀

**Stickerity** es una plataforma web integral que permite a los usuarios extraer stickers animados (WebP) e imágenes estáticas desde enlaces de redes sociales (como TikTok) y descargarlos listos para importar a WhatsApp.

🔗 **[Visitar Stickerity en Producción](https://stickerity.app)**

## 🌟 Características Principales

*   **Extracción Universal:** Capaz de extraer recursos ocultos (como stickers animados `.awebp` en comentarios de TikTok) usando un motor avanzado basado en Playwright.
*   **Conversión Automática:** Transforma cualquier sticker o GIF animado a WebP optimizado (< 500kb, 512x512) compatible con WhatsApp.
*   **Descargas Individuales o en Lote (.ZIP):** Descarga un solo sticker o toda una colección empaquetada en un archivo ZIP.
*   **SPA Ultrarrápida:** Interfaz de usuario moderna, reactiva y traducida (i18n) construida con React y Vite.
*   **Diseño Premium y Dark Mode:** Interfaz cristalina (Glassmorphism), moderna, con animaciones fluidas que se ve perfecta en móviles y escritorios.

---

## 🏗️ Arquitectura y Tecnologías

El proyecto es un monorepo que contiene tanto el frontend como el backend:

### Frontend (`/frontend`)
*   **Framework:** React 19 + TypeScript + Vite.
*   **Estilos:** CSS Modules y Tailwind CSS, con un diseño personalizado avanzado.
*   **Enrutamiento:** React Router DOM (v7).
*   **Internacionalización (i18n):** Soporte en múltiples idiomas mediante `react-i18next`.
*   **Despliegue:** Construido en estático y servido a través de **Nginx** en un contenedor Docker ultraligero.

### Backend (`/backend`)
*   **Servidor API:** Node.js con Fastify (ligero y de alto rendimiento).
*   **Motor de Scraping:** Microsoft Playwright con Chromium stealth, que permite renderizar y capturar respuestas de red dinámicas en TikTok y otras plataformas.
*   **Procesamiento de Imágenes:**
    *   `fluent-ffmpeg`: Transcodificación de video/animación.
    *   `sharp`: Redimensionamiento y optimización de WebP estáticos.
    *   `node-webpmux`: Manipulación de metadatos y frames WebP.
*   **Caché:** `lru-cache` para almacenar metadatos de descargas recientes, acelerando peticiones repetidas.
*   **Rate Limiting y CORS:** Seguridad configurada vía Fastify plugins.

---

## 🚀 Despliegue (CI/CD)

Stickerity está optimizado para su ejecución en servidores privados virtuales (VPS) y automatizado completamente mediante **GitHub Actions**.

1. **Docker Compose:** La aplicación completa puede levantarse con un solo comando `docker compose up -d`.
2. **Reverse Proxy (Caddy):** En producción, el VPS utiliza Caddy Server, el cual gestiona los certificados **SSL/HTTPS (Let's Encrypt)** automáticamente y funciona como proxy inverso hacia nuestros contenedores.
3. **Flujo de GitHub Actions:** Cada `push` a la rama `main` dispara un workflow que se conecta por SSH al VPS, actualiza el código desde el repositorio y reconstruye las imágenes de Docker.

### Variables de Entorno (Requeridas)
**Para el Backend (`/backend/.env`):**
```env
PORT=3000
NODE_ENV=production
# (En caso de usar S3/Cloudflare R2 o Supabase en el futuro, añadir aquí las llaves)
```

**Para el Frontend (`/frontend/.env` - opcional en prod):**
```env
VITE_API_URL=https://api.stickerity.app/api
```

## 👨‍💻 Desarrollo Local

### 1. Clonar y Configurar
```bash
git clone https://github.com/JosueOrtizV/Stickerity.git
cd Stickerity
```

### 2. Correr el Backend
Requiere tener Node.js 20+ y dependencias del sistema operativo (Playwright/FFmpeg).
```bash
cd backend
npm install
# Instalar binarios de Playwright
npx playwright install chromium
npm run dev
```
*(El servidor de desarrollo correrá en el puerto 3000 con Nodemon)*

### 3. Correr el Frontend
```bash
cd frontend
npm install
npm run dev
```
*(La aplicación estará disponible en `http://localhost:5173`)*

---

**© 2026 Stickerity** — Desarrollado por Josué Ortiz.
