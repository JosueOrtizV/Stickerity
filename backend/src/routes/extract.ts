import { FastifyInstance } from 'fastify';
import { TikTokScraper } from '../services/scraper';

interface ExtractRequestBody {
  url: string;
}

const scraper = new TikTokScraper();

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
      return reply.status(400).send({ error: 'Por favor ingresa una URL válida (http:// o https://)' });
    }

    try {
      fastify.log.info(`Processing extraction request for URL: ${url}`);
      const result = await scraper.extractStickers(url);
      
      return reply.send({
        status: 'success',
        url_processed: result.tiktok_url,
        count: result.stickers.length,
        stickers: result.stickers
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'No se pudieron extraer stickers del enlace proporcionado' });
    }
  });
}
