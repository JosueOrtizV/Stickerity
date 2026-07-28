import { FastifyInstance } from 'fastify';
import { ImageProcessor } from '../services/processor';

const processor = new ImageProcessor();

interface StickerQuery {
  url: string;
  download?: string;
  format?: 'webp' | 'gif';
}

export default async function (fastify: FastifyInstance) {
  /**
   * GET /api/sticker?url=<TIKTOK_CDN_URL>
   * Fetches raw TikTok .awebp sticker, processes to 512x512 <500KB WebP, and streams it.
   */
  fastify.get<{ Querystring: StickerQuery }>('/sticker', async (request, reply) => {
    const { url } = request.query;

    if (!url) {
      return reply.status(400).send({ error: 'Missing url parameter' });
    }

    try {
      // 1. Download raw image from TikTok CDN
      const rawBuffer = await processor.downloadImage(url);

      // 2. If a format is explicitly requested ('webp' or 'gif'), process for WhatsApp download
      if (request.query.format) {
        const format = request.query.format === 'gif' ? 'gif' : 'webp';
        const processed = await processor.processSticker(rawBuffer, format);

        const isDownload = request.query.download === 'true';
        const ext = processed.mimeType === 'image/gif' ? 'gif' : 'webp';
        const disposition = isDownload 
          ? `attachment; filename="stickerity-sticker.${ext}"` 
          : `inline; filename="sticker.${ext}"`;

        reply.header('X-Sticker-Animated', processed.isAnimated ? 'true' : 'false');

        return reply
          .header('Content-Type', processed.mimeType)
          .header('Content-Disposition', disposition)
          .header('Cache-Control', 'public, max-age=86400')
          .send(processed.buffer);
      }

      // 3. Default for site preview: generate a safe GIF or WebP preview
      // Chromium struggles rendering raw TikTok .awebp files natively. 
      // Generating a 256x256 GIF rasterizes it perfectly for the web browser.
      const preview = await processor.createPreview(rawBuffer);

      return reply
        .header('Content-Type', preview.mimeType)
        .header('Cache-Control', 'public, max-age=86400')
        .send(preview.buffer);

    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to process sticker image' });
    }
  });
}
