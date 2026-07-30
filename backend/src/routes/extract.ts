import { FastifyInstance } from 'fastify';
import { StickerScraper } from '../services/scraper';
import { stickerCache } from '../services/cache';

interface ExtractRequestBody {
  url: string;
}

const scraper = new StickerScraper();

export default async function (fastify: FastifyInstance) {
  fastify.post<{ Body: ExtractRequestBody }>('/extract', {
    config: {
      rateLimit: {
        max: 15,
        timeWindow: '10 minutes',
        errorResponseBuilder: (_request: any, context: any) => ({
          statusCode: 429,
          error: 'Too Many Requests',
          message: `Has superado el límite de extracciones. Por favor intenta de nuevo en ${Math.ceil(context.ttl / 1000 / 60)} minutos.`
        })
      }
    }
  }, async (request, reply) => {
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

    const cacheKey = parsedUrl.href;

    try {
      fastify.log.info(`Processing extraction request for URL: ${url}`);

      // Set headers for NDJSON streaming
      reply.raw.writeHead(200, {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });

      // Check cache first
      const cachedResult = stickerCache.get(cacheKey);
      if (cachedResult && cachedResult.length > 0) {
        fastify.log.info(`Cache HIT for URL: ${url}`);
        for (const sticker of cachedResult) {
          reply.raw.write(JSON.stringify({ type: 'sticker', sticker }) + '\n');
        }
        reply.raw.write(JSON.stringify({
          type: 'done',
          status: 'success',
          url_processed: url,
          count: cachedResult.length,
          cached: true
        }) + '\n');
        return reply.raw.end();
      }

      fastify.log.info(`Cache MISS for URL: ${url}. Running scraper...`);

      const result = await scraper.extractStickers(url, (stickerUrl) => {
        try {
          reply.raw.write(JSON.stringify({ type: 'sticker', sticker: stickerUrl }) + '\n');
        } catch (e) {}
      });
      
      // Save to cache if stickers were found
      if (result.stickers && result.stickers.length > 0) {
        stickerCache.set(cacheKey, result.stickers);
        fastify.log.info(`Saved ${result.stickers.length} stickers to cache for URL: ${url}`);
      }

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
