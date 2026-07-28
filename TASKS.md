# 📋 Stickerity — Lista de Tareas (Roadmap & Checkpoints)

Basado en el [Plan de Arquitectura e Implementación](file:///d:/Proyectos/TokSticker/Plan.md).

---

## 🚀 FASE 1: Web MVP + Core Scraper (COMPLETADO AL 90%)

### 1.1 Backend & Scraper (VPS / Node.js + Fastify)
- [x] **Inicialización:** Proyecto Node.js con TypeScript, Fastify y dependencias.
- [x] **Modulo Scraper:** Implementar Playwright Stealth + extracción directa de DOM para detectar `.awebp` e `ibyteimg.com`.
- [x] **Endpoint API Extracción:** Crear ruta `POST /api/extract` para procesar URLs de TikTok.
- [x] **Pipeline de Procesamiento de Imagen:**
  - [x] Descargador de `.awebp` firmado desde TikTok CDN.
  - [x] Redimensionamiento a 512x512 conservando ratio de aspecto y transparencia.
  - [x] Ajuste automático de calidad para asegurar peso <500KB (límite WhatsApp).
  - [x] Generación de archivo `.webp` animado validado.
- [x] **Endpoint Servidor de Archivos / Streaming:** Ruta `GET /api/sticker?url=...` que procesa al vuelo y sirve el sticker listo para compartir.

### 1.2 Frontend Web App (Vite + React)
- [x] **Inicialización:** Proyecto Vite + React + TypeScript.
- [x] **Diseño & UI:** Interfaz moderna en tema oscuro con bordes neón y estética glassmorphism.
- [x] **Componente de Extracción:** Formulario para ingresar URL de TikTok con animaciones y estados de carga.
- [x] **Grid de Galería:** Mostrar los stickers extraídos en tarjetas responsive con previsualización animada WebP.
- [x] **Web Share API (`navigator.share`):** Botón para compartir el sticker directo a WhatsApp en smartphones.
- [x] **Fallback Desktop:** Botón de descarga directa en ordenadores para arrastrar a WhatsApp Web.

### 1.3 Almacenamiento & Caché Inicial
- [ ] **Integración Supabase DB:** Guardar metadata de stickers extraídos (deduplicación por URL).
- [ ] **Cloudflare R2 / Local Cache:** Almacenar permanentemente los archivos WebP procesados (Opcional para v1.1).

---

## 🔒 FASE 2: Cuentas, Colecciones & Historial (Próximamente)

- [ ] Integrar Supabase Auth (Email / Google / TikTok OAuth).
- [ ] Panel de usuario: "Mis Stickers Extraídos".
- [ ] Creación de colecciones/packs personalizados en la web.
- [ ] Guardar stickers favoritos.

---

## 📱 FASE 3: App Nativa Android (React Native + Expo) (Próximamente)

- [ ] Inicializar proyecto Expo.
- [ ] Reutilizar API REST del backend (sin cambios).
- [ ] Integración nativa con WhatsApp vía `ContentProvider` / Android Intents (exportar pack completo de 30 stickers en 1-clic).
- [ ] Monetización inicial: Anuncios recompensados (Rewarded Ads).

---

## 🌐 FASE 4: Biblioteca Comunitaria (Próximamente)

- [ ] Explorador público de stickers populares y trending.
- [ ] Búsqueda por tags y categorías.
- [ ] Sistema de reportes (DMCA / Moderación).
