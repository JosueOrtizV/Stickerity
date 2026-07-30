import fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import dotenv from 'dotenv';
import extractRoutes from './routes/extract';
import stickerRoutes from './routes/sticker';

// Load environment variables
dotenv.config();

const server = fastify({
  logger: true
});

// Register plugins
server.register(cors, {
  origin: true, // Allow all for now, restrict in production
  exposedHeaders: ['X-Sticker-Animated']
});

// Rate limit: only applied per-route (global: false), not to every endpoint.
// The /api/sticker proxy must NOT be rate-limited because the frontend
// makes one request per sticker to render images.
server.register(rateLimit, {
  global: false
});

// Register routes
server.register(extractRoutes, { prefix: '/api' });
server.register(stickerRoutes, { prefix: '/api' });

// Health check route
server.get('/health', async () => {
  return { status: 'ok', service: 'Stickerity API' };
});

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3000', 10);
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`Server listening on http://localhost:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
