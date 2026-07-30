import { LRUCache } from 'lru-cache';

// Cache max 500 URLs, TTL 24 hours
export const stickerCache = new LRUCache<string, string[]>({
  max: 500,
  ttl: 1000 * 60 * 60 * 24, // 24 hours in milliseconds
});
