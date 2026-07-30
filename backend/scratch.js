import { chromium } from 'playwright';
import fs from 'fs';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.goto('https://giphy.com/?type=stickers', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => window.scrollBy(0, 1000));
    await page.waitForTimeout(1000);
  }
  
  const data = await page.evaluate(() => {
    const els = document.querySelectorAll('img, source, picture');
    const results = [];
    els.forEach(el => {
      const attrs = {};
      for (const attr of el.attributes) {
        attrs[attr.name] = attr.value;
      }
      results.push({ tag: el.tagName, attrs });
    });
    return results;
  });
  
  fs.writeFileSync('giphy-dom.json', JSON.stringify(data, null, 2));
  console.log(`Saved ${data.length} elements to giphy-dom.json`);
  
  await browser.close();
})();
