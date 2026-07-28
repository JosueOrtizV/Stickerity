import { TikTokScraper } from './src/services/scraper';

async function test() {
  const scraper = new TikTokScraper();
  console.log('=== EXTRACTING STICKERS ===');
  const res = await scraper.extractStickers('https://www.tiktok.com/@alexia.perez.ovalles/video/7664699520386649365');
  console.log(JSON.stringify(res.stickers, null, 2));
}

test().catch(console.error);
