import fastify from 'fastify';
import cors from '@fastify/cors';
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
