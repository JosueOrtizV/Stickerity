import { FastifyInstance } from 'fastify';
import { StickerScraper } from '../services/scraper';

interface ExtractRequestBody {
  url: string;
}

const scraper = new StickerScraper();

export default async function (fastify: FastifyInstance) {
  fastify.post<{ Body: ExtractRequestBody }>('/extract', async (request, reply) => {
    const { url } = request.body;
    
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        throw new Error('Invalid protocol');
      }
    } catch (e) {
      return reply.status(400).send({ error: 'invalid_url', message: 'Por favor ingresa una URL válida (http:// o https://)' });
    }

    try {
      fastify.log.info(`Processing extraction request for URL: ${url}`);

      // Set headers for NDJSON streaming
      reply.raw.writeHead(200, {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });

      const result = await scraper.extractStickers(url, (stickerUrl) => {
        try {
          reply.raw.write(JSON.stringify({ type: 'sticker', sticker: stickerUrl }) + '\n');
        } catch (e) {}
      });
      
      reply.raw.write(JSON.stringify({
        type: 'done',
        status: 'success',
        url_processed: result.source_url,
        count: result.stickers.length
      }) + '\n');

      reply.raw.end();
    } catch (error) {
      fastify.log.error(error);
      if (!reply.raw.headersSent) {
        return reply.status(500).send({ error: 'extraction_failed', message: 'No se pudieron extraer stickers del enlace proporcionado' });
      } else {
        reply.raw.write(JSON.stringify({ type: 'error', error: 'extraction_failed' }) + '\n');
        reply.raw.end();
      }
    }
  });
}
