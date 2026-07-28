# 📄 Stickerity — Plan de Arquitectura e Implementación

## 1. Visión del Producto

Una herramienta **web-first** que permite a los usuarios extraer stickers animados (`.awebp`) de los comentarios de videos públicos de TikTok, procesarlos a formato compatible (512×512, <500KB) y compartirlos directamente a WhatsApp desde el navegador del celular usando `navigator.share()`.

El producto se construye en fases progresivas. Cada fase agrega funcionalidad **sin reescribir** la anterior. El backend (API REST) es compartido entre todas las plataformas, permitiendo agregar una app nativa en el futuro sin cambios en la infraestructura.

---

## 2. Estrategia: Web-First

### ¿Por qué empezar con la web?

| Ventaja | Explicación |
| :--- | :--- |
| **Sin App Store = sin riesgo de removal** | No pasamos por review de Google/Apple. Si TikTok se queja, cambiamos de dominio |
| **Funciona desde el celular** | El usuario abre la web en Chrome, pega el link, y comparte stickers a WhatsApp con `navigator.share()` |
| **Iteración rápida** | Se puede lanzar en 2-3 semanas vs 8-10 de una app nativa |
| **Valida la idea** | Si la gente lo usa, se invierte en app nativa. Si no, no se perdió tiempo |
| **El scraper corre en el backend** | El usuario solo pega la URL del video (fácil de copiar desde TikTok en el celular) |

### Hallazgo técnico clave: `navigator.share()` + `.webp`

Cuando se comparte un archivo `.webp` desde un navegador móvil usando la Web Share API, **WhatsApp automáticamente lo trata como sticker**. El usuario puede guardarlo en favoritos para usarlo después. Esto elimina la necesidad de una app nativa para el MVP.

### Limitación vs app nativa

| Función | Web (Fase 1) | App nativa (Fase 3) |
| :--- | :--- | :--- |
| Extraer stickers de un link | ✅ | ✅ |
| Ver stickers animados | ✅ | ✅ |
| Enviar sticker individual a WhatsApp | ✅ (`navigator.share`) | ✅ |
| Instalar pack de 30 stickers de golpe | ❌ | ✅ (ContentProvider) |
| Gestionar packs | ❌ | ✅ |
| Sin App Store risk | ✅ | ❌ |

---

## 3. Arquitectura del Sistema (API-First)

El backend es **100% reutilizable** entre web y app. La app sería solo un nuevo frontend consumiendo la misma API.

```
                       FASE 1 (Web)                    FASE 3 (+ App)

                       ┌──────────┐                    ┌──────────┐
                       │  Web App │                    │  Web App │
                       │  (React) │                    │  (React) │
                       └────┬─────┘                    └────┬─────┘
                            │                               │
                       API REST ◄────────────────────► API REST (la misma)
                            │                               │
                       ┌────┴─────┐                    ┌────┴─────┐
                       │ Backend  │                    │ Backend  │ ← 0 cambios
                       │ Fastify  │                    │ Fastify  │
                       │ Scraper  │                    │ Scraper  │
                       │ Sharp    │                    │ Sharp    │
                       └────┬─────┘                    └────┬─────┘
                            │                               │
                       ┌────┴─────┐                    ┌────┴─────┐
                       │ Supabase │                    │ Supabase │ ← 0 cambios
                       │ R2       │                    │ R2       │
                       └──────────┘                    └──────────┘
                                                            │
                                                       ┌────┴──────────┐
                                                       │  App Android   │ ← NUEVO
                                                       │  React Native  │   (solo frontend)
                                                       │  ContentProv.  │
                                                       └───────────────┘
```

### Detalle del Backend

```
┌────────────────────────────────────────────────────────────────────┐
│                   VPS (Node.js Backend)                             │
│                                                                    │
│   ┌────────────────────────────────────────────────────┐          │
│   │         API Gateway (Fastify + TypeScript)          │          │
│   │       Rate Limiting · Validación · CORS             │          │
│   └──────┬──────────────────┬──────────────────┬───────┘          │
│          │                  │                  │                   │
│   ┌──────▼──────┐   ┌──────▼──────┐   ┌──────▼──────┐           │
│   │  Scraper     │   │  Processor   │   │  Pack       │           │
│   │  Module      │   │  Pipeline    │   │  Manager    │           │
│   │              │   │              │   │  (Fase 3)   │           │
│   │ Playwright   │   │ Sharp        │   │             │           │
│   │ + Stealth    │   │ + FFmpeg     │   │ CRUD packs  │           │
│   │              │   │ + webpmux    │   │ Validación  │           │
│   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘           │
│          │                  │                  │                   │
└──────────┼──────────────────┼──────────────────┼───────────────────┘
           │                  │                  │
    ┌──────▼──────┐   ┌──────▼──────┐   ┌──────▼──────┐
    │Cloudflare R2│   │  Supabase   │   │  Supabase   │
    │ (Storage)   │   │ (PostgreSQL)│   │ (Auth)      │
    │             │   │             │   │ (Fase 2)    │
    │ .webp files │   │ Metadata    │   │             │
    └─────────────┘   └─────────────┘   └─────────────┘
```

---

## 4. Hallazgos Técnicos

### Stickers de TikTok
- Los stickers son archivos **`.awebp`** (Animated WebP estándar, solo cambia la extensión por convención de ByteDance). WhatsApp los acepta como `.webp` sin conversión de formato.
- Se alojan en el CDN de ByteDance: `p16-tiktok-dm-sticker-sign-sg.ibyteimg.com`
- Las URLs del CDN incluyen firma criptográfica (`x-signature`) y **expiran** (`x-expires`, típicamente 24h-30 días). El backend debe descargar y almacenar los archivos inmediatamente.
- **No existe API oficial** de TikTok para acceder a stickers de comentarios. Se verificó la documentación completa en `developers.tiktok.com`:
  - La Research API devuelve solo texto de comentarios, NO media/stickers
  - La Research API es solo para académicos, uso comercial prohibido
  - Ninguna otra API (Display, Content Posting, Login Kit, Share Kit) proporciona acceso a stickers
- El endpoint interno web es `https://www.tiktok.com/api/comment/list/` con parámetros `aweme_id`, `cursor`, `count`.
- Los stickers aparecen en `sticker.animate_url.url_list[]` dentro del JSON de respuesta.
- Requiere tokens de seguridad dinámicos: `msToken`, `X-Bogus`, `_signature`.
- **Solución**: Playwright headless con stealth plugins intercepta las respuestas automáticamente (el navegador genera los tokens).

### Integración con WhatsApp
- **Desde web móvil**: `navigator.share()` con un archivo `.webp` → WhatsApp lo recibe como sticker automáticamente. El usuario lo guarda en favoritos.
- **Desde web desktop**: WhatsApp Web tiene herramienta nativa "Crear sticker" que acepta archivos subidos.
- **Desde app nativa (Fase 3)**: `ContentProvider` + Intent para instalar packs completos de 3-30 stickers.
- Especificaciones obligatorias:
  - Dimensiones: **512 × 512 px** exactos
  - Peso: **< 500 KB** (animados) / **< 100 KB** (estáticos)
  - Formato: `.webp` con canal alfa (transparencia)
  - Tray Icon (Fase 3): **96 × 96 px**, < 50 KB
  - Pack (Fase 3): mínimo **3**, máximo **30** stickers
  - Loop: infinito (`loop: 0`)
  - Metadata EXIF requerida (Pack Name + Author) via `node-webpmux`

---

## 5. Consideraciones Legales y de Marca

### Legalidad del Scraping
- **TOS de TikTok (Sección 5, actualizada enero 2026)**: Prohíbe explícitamente scraping automatizado sin aprobación escrita.
- **Precedentes legales favorables (EE.UU.)**: hiQ v. LinkedIn (2022) y Meta v. Bright Data (2024) establecen que scraping de datos **públicos** (sin login) NO viola la CFAA (ley anti-hacking). Los TOS solo aplican a usuarios registrados/logueados.
- **Copyright**: Los stickers pueden tener copyright de ByteDance, del creador, o de terceros (Tenor/Giphy). Para la biblioteca comunitaria (Fase 4) se requiere mecanismo DMCA.
- **Estrategia de mitigación**: Al ser web-only, no hay riesgo de App Store removal. Si TikTok envía cease & desist, se puede migrar de dominio.

### Uso de Marcas Registradas
- **En el nombre del producto**: NO usar "TikTok" ni "WhatsApp" en el nombre. "TokSticker" contiene "Tok" y podría ser problemático en App Stores. Alternativas seguras: **StickerSnap**, **StickerGrab**, **PackIt**, **StickerFlow**, **StickerPort**.
- **En la UI**: Se puede usar lenguaje descriptivo genérico: "Pega el link del video", "Compartir sticker". Si es necesario mencionar las plataformas, usar uso nominativo: "Compatible con TikTok y WhatsApp".
- **Prohibido**: Usar logos oficiales de TikTok o WhatsApp.
- **Disclaimer obligatorio** en footer:
  > *"Este sitio no está afiliado, respaldado ni patrocinado por TikTok, ByteDance, WhatsApp o Meta Platforms."*

---

## 6. Stack Tecnológico

| Capa | Tecnología | Justificación |
| :--- | :--- | :--- |
| **Web Frontend** | Vite + React + CSS Vanilla | Rápido, ligero, diseño premium, responsive |
| **Backend API** | Node.js + TypeScript + Fastify | Performance, tipado estricto, ecosistema maduro |
| **Scraper** | Playwright + `puppeteer-extra-plugin-stealth` | Maneja JS rendering y tokens criptográficos automáticamente |
| **Image Processing** | Sharp (resize) + FFmpeg (FPS fallback) + node-webpmux (EXIF) | Pipeline completo de conversión |
| **Base de Datos** | Supabase (PostgreSQL) | Tier gratuito, MCP configurado, API REST auto-generada |
| **Storage** | Cloudflare R2 | $0 egress, compatible con API S3, CDN global |
| **Hosting** | VPS propio | Control total, sin costos adicionales |
| **App Móvil (Fase 3)** | React Native + Expo (EAS Custom Dev Builds) | Reutiliza lógica, acceso a módulos nativos |

---

## 7. Pipeline de Procesamiento de Imagen

```
Input .awebp (TikTok CDN)
  │
  ├── Calcular SHA-256 → ¿Ya existe en DB? → SÍ → Retornar sticker existente
  │                                          NO ↓
  ▼
Sharp: resize 512x512 (fit: contain, bg transparente rgba(0,0,0,0))
  │   pageHeight: 512, loop: 0 (infinito), effort: 6
  │
  ▼
¿Tamaño < 490 KB?  ── SÍ ──→  Subir a R2 + registrar en DB  ──→  ✅ Listo
  │
  NO → Sharp: reducir calidad (75 → 55 → 40)
  │
  ▼
¿Tamaño < 490 KB?  ── SÍ ──→  Subir a R2 + registrar en DB  ──→  ✅ Listo
  │
  NO → FFmpeg: reducir FPS a 15, recomprimir
  │
  ▼
¿Tamaño < 490 KB?  ── SÍ ──→  Subir a R2 + registrar en DB  ──→  ✅ Listo
  │
  NO → Sharp: escalar contenido a 400x400 dentro de canvas 512x512
  │
  ▼
Subir a R2 + registrar en DB  ──→  ✅ Listo
```

---

## 8. Modelo de Datos

### Fase 1 (Web MVP — sin auth)

```sql
-- Stickers extraídos y procesados
CREATE TABLE stickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tiktok_sticker_id TEXT UNIQUE,
  file_hash TEXT UNIQUE,                -- SHA-256 para deduplicación
  storage_url TEXT NOT NULL,            -- URL permanente en Cloudflare R2
  original_tiktok_url TEXT,             -- URL original CDN (expira)
  source_video_url TEXT,                -- URL del video TikTok fuente
  original_width INTEGER,
  original_height INTEGER,
  processed_size_bytes INTEGER,
  frame_count INTEGER,
  processing_status TEXT DEFAULT 'pending',  -- pending | processing | done | failed
  downloads_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Cache de extracciones por video (evitar re-scrapear)
CREATE TABLE video_extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_url TEXT NOT NULL,
  video_id TEXT UNIQUE,                 -- aweme_id extraído del URL
  sticker_count INTEGER DEFAULT 0,
  last_extracted_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Relación video → stickers encontrados
CREATE TABLE video_stickers (
  video_extraction_id UUID REFERENCES video_extractions(id) ON DELETE CASCADE,
  sticker_id UUID REFERENCES stickers(id) ON DELETE CASCADE,
  PRIMARY KEY (video_extraction_id, sticker_id)
);

-- Índices
CREATE INDEX idx_stickers_hash ON stickers(file_hash);
CREATE INDEX idx_stickers_tiktok_id ON stickers(tiktok_sticker_id);
CREATE INDEX idx_stickers_downloads ON stickers(downloads_count DESC);
CREATE INDEX idx_video_extractions_video_id ON video_extractions(video_id);
```

### Fase 2 (se agregan, no se cambian las anteriores)

```sql
-- Usuarios (gestionado por Supabase Auth)
-- Solo se agrega tabla de favoritos y historial

CREATE TABLE user_favorites (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  sticker_id UUID REFERENCES stickers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, sticker_id)
);

CREATE TABLE user_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  video_extraction_id UUID REFERENCES video_extractions(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Fase 3 (se agregan packs)

```sql
CREATE TABLE sticker_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  publisher TEXT DEFAULT 'Stickerity',
  tray_image_url TEXT,
  is_animated BOOLEAN DEFAULT true,
  sticker_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE pack_stickers (
  pack_id UUID REFERENCES sticker_packs(id) ON DELETE CASCADE,
  sticker_id UUID REFERENCES stickers(id) ON DELETE CASCADE,
  position INTEGER CHECK (position BETWEEN 1 AND 30),
  PRIMARY KEY (pack_id, sticker_id)
);
```

---

## 9. Endpoints de la API

### Fase 1 (Web MVP)

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| `POST` | `/api/extract` | Recibe URL de TikTok, retorna lista de stickers encontrados |
| `GET` | `/api/extract/:videoId` | Retorna stickers de una extracción anterior (cache) |
| `GET` | `/api/stickers/:id` | Metadata de un sticker |
| `GET` | `/api/stickers/:id/file` | Descarga el archivo `.webp` procesado |

### Fase 2 (se agregan)

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Login via Supabase Auth |
| `GET` | `/api/me/favorites` | Stickers favoritos del usuario |
| `POST` | `/api/me/favorites/:stickerId` | Agregar favorito |
| `DELETE` | `/api/me/favorites/:stickerId` | Quitar favorito |
| `GET` | `/api/me/history` | Historial de extracciones |

### Fase 3 (se agregan)

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| `POST` | `/api/packs` | Crear pack |
| `GET` | `/api/packs/:id` | Detalle de un pack |
| `PUT` | `/api/packs/:id` | Actualizar pack |
| `DELETE` | `/api/packs/:id` | Eliminar pack |
| `POST` | `/api/packs/:id/stickers` | Agregar stickers al pack |
| `DELETE` | `/api/packs/:id/stickers/:stickerId` | Quitar sticker |
| `GET` | `/api/packs/:id/export` | Pack completo para WhatsApp (manifest + assets) |

---

## 10. Flujo del Scraper (Playwright)

1. **Recepción:** Backend recibe URL de video TikTok via `POST /api/extract`
2. **Cache check:** ¿Ya se extrajo este video? → retornar stickers guardados
3. **Extracción de ID:** Parsear `aweme_id` del URL (regex o seguir redirección)
4. **Navegación:** Playwright navega al video en modo headless con stealth
5. **Intercepción:** Escuchar respuestas de `api/comment/list` via `page.on('response')`
6. **Paginación:** Iterar con `cursor` para cargar más comentarios
7. **Filtrado:** Identificar comentarios con objeto `sticker` en el JSON
8. **Deduplicación:** Calcular hash de cada URL, verificar si ya existe
9. **Descarga:** Descargar cada `.awebp` nuevo de `sticker.animate_url.url_list[0]`
10. **Procesamiento:** Enviar a pipeline de imagen (resize + compress)
11. **Storage:** Subir resultado a Cloudflare R2 + registrar en Supabase
12. **Respuesta:** Retornar lista de stickers procesados al frontend

---

## 11. Frontend Web (Fase 1)

### Pantalla única: Extractor

```
┌──────────────────────────────────────────────────┐
│                                                  │
│          🎭 Stickerity                         │
│     Extrae stickers de videos y compártelos      │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │  Pega el link del video aquí...     [→]  │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │                                            │  │
│  │   [sticker]  [sticker]  [sticker]          │  │
│  │   Compartir  Compartir  Compartir          │  │
│  │                                            │  │
│  │   [sticker]  [sticker]  [sticker]          │  │
│  │   Compartir  Compartir  Compartir          │  │
│  │                                            │  │
│  │   X stickers encontrados                   │  │
│  │                                            │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ─────────────────────────────────────────────── │
│  Este sitio no está afiliado con TikTok, etc.    │
└──────────────────────────────────────────────────┘
```

- **Input**: Campo para pegar URL + botón de acción
- **Loading**: Animación durante la extracción (~10-30 segundos)
- **Resultados**: Grid de stickers animados (previsualización en loop)
- **Acciones por sticker**: Botón "Compartir" (usa `navigator.share` en móvil) + Botón "Descargar"
- **Diseño**: Dark mode, glassmorphism, micro-animaciones, responsive mobile-first

### Tecnología
- Vite + React + CSS Vanilla
- Mobile-first responsive design
- `navigator.share()` para compartir a WhatsApp desde móvil
- Fallback a descarga directa en desktop

---

## 12. Performance del Backend

- **Concurrencia del Scraper:** Limitar a 2-4 workers simultáneos de Playwright (alto consumo de RAM)
- **Queue de procesamiento:** `p-limit` para encolar requests de extracción
- **Sharp config:** `sharp.concurrency(2)` y `sharp.cache(false)` para evitar memory leaks
- **Deduplicación:** Hash SHA-256 evita reprocesar stickers ya conocidos
- **Cache de videos:** Si un video ya fue procesado, retornar stickers guardados sin re-scrapear
- **Cleanup:** Eliminar archivos temporales de FFmpeg inmediatamente tras subir a R2

---

## 13. Costos Estimados

| Componente | Costo Mensual |
| :--- | :--- |
| Supabase (Free tier) | $0 |
| Cloudflare R2 (Free tier, ~25GB) | $0 |
| VPS (backend + web) | Ya lo tienes |
| Dominio (opcional) | ~$12/año |
| **Total Fase 1** | **~$0-1/mes** |

---

## 14. Roadmap de Fases

### Fase 1 — Web MVP (Semanas 1-3)
**Objetivo:** Validar la idea. ¿La gente quiere extraer stickers de TikTok?

- Setup proyecto Node.js + TypeScript + Fastify
- Implementar módulo Playwright scraper con stealth
- Implementar pipeline de procesamiento de imagen (Sharp + FFmpeg + node-webpmux)
- Setup Supabase (schema Fase 1 + migraciones)
- Setup Cloudflare R2 (storage)
- Endpoints `POST /api/extract` y `GET /api/stickers/:id/file`
- Frontend Vite + React (pantalla de extracción + grid + compartir/descargar)
- Deploy en VPS
- **Entregable:** Web funcional donde cualquiera puede pegar un link de TikTok, ver los stickers, y compartirlos a WhatsApp desde el celular
- **Sin login, sin packs, sin biblioteca**

### Fase 2 — Web mejorada (Semana 4-5)
**Objetivo:** Retención. Que los usuarios vuelvan.

- Integrar Supabase Auth (login con Google)
- Agregar tablas de favoritos e historial
- UI: sección "Mis stickers", favoritos, historial de links
- **Entregable:** Usuarios pueden guardar sus stickers favoritos y ver su historial

### Fase 3 — App Android (Semanas 6-9)
**Objetivo:** Exportación nativa de packs completos a WhatsApp.

- Setup React Native + Expo EAS (custom dev builds)
- Implementar `StickerContentProvider` nativo (Kotlin)
- Implementar Intent de exportación a WhatsApp
- UI: Extractor + Gestor de Packs + Exportar a WhatsApp 1-tap
- Agregar tablas de packs en Supabase
- Testing en dispositivos reales
- Publicar en Google Play Store (presentada como "Sticker Creator")
- **Entregable:** APK que extrae stickers y los exporta como packs a WhatsApp

### Fase 4 — Biblioteca Comunitaria (Semanas 10-12)
**Objetivo:** Descubrimiento. Que los usuarios encuentren stickers sin pegar un link.

- Feed de stickers populares (más descargados/compartidos)
- Buscar por tendencia
- Packs públicos de la comunidad
- Sistema de moderación + mecanismo DMCA
- **Entregable:** Sección "Explorar" con stickers populares y packs de la comunidad

### Fase 5 — iOS + Monetización (Futuro)
- App iOS con UIPasteboard + URL scheme `whatsapp://stickerPack`
- Ads recompensados (ver anuncio antes de exportar pack)
- Freemium opcional ($1.99/mes sin ads + features premium)

---

## 15. Alcance Fase 1 (Lo que construimos ahora)

### Incluido
- Extracción de stickers de comentarios públicos via URL de video
- Procesamiento automático a formato WhatsApp (512×512, <500KB, .webp)
- Previsualización animada de stickers en la web
- Compartir sticker individual a WhatsApp desde móvil (`navigator.share`)
- Descarga individual de archivos `.webp`
- Deduplicación por hash (no reprocesar stickers ya conocidos)
- Cache de extracciones por video (no re-scrapear videos ya procesados)
- Diseño premium responsive (dark mode, mobile-first)

### Excluido (diferido a fases posteriores)
- Login / autenticación de usuarios
- Favoritos e historial
- Packs de stickers
- Biblioteca comunitaria
- App móvil nativa
- Monetización
- iOS