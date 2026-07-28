import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Add stealth plugin to playwright-extra
chromium.use(StealthPlugin());

export interface StickerExtractionResult {
  tiktok_url: string;
  stickers: string[];
}

export class TikTokScraper {
  async extractStickers(videoUrl: string): Promise<StickerExtractionResult> {
    if (!videoUrl.includes('tiktok.com')) {
      return this.extractGenericImages(videoUrl);
    }

    const result: StickerExtractionResult = {
      tiktok_url: videoUrl,
      stickers: []
    };

    console.log(`[Scraper] Starting extraction for ${videoUrl}`);

    const browser = await chromium.launch({ headless: true });
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
      locale: 'es-ES',
      timezoneId: 'America/Mexico_City',
    });
    
    const page = await context.newPage();

    // --- Deduplication ---
    const addedHashes = new Set<string>();
    const addStickerUrl = (rawUrl: string) => {
      if (!rawUrl || typeof rawUrl !== 'string') return;
      
      const hashMatch = rawUrl.match(/\/([a-f0-9]{32})/i);
      const uniqueKey = hashMatch ? hashMatch[1] : rawUrl.split('?')[0];

      if (rawUrl.includes('avt-') || rawUrl.includes('avatar')) return;
      if (rawUrl.includes('100x100') || rawUrl.includes('72x72') || rawUrl.includes('cropcenter')) return;
      
      if (!addedHashes.has(uniqueKey)) {
        addedHashes.add(uniqueKey);
        result.stickers.push(rawUrl);
        console.log(`[Scraper] Found sticker #${result.stickers.length} (${uniqueKey.substring(0, 8)}...)`);
      }
    };

    // --- Recursive JSON sticker extractor ---
    const extractUrlsFromObject = (obj: any) => {
      if (!obj) return;
      if (typeof obj === 'string') {
        const isCdn = obj.includes('ibyteimg.com') || obj.includes('byteimg.com') || obj.includes('tiktokcdn.com');
        if (isCdn && (obj.includes('sticker') || obj.includes('.awebp'))) {
          addStickerUrl(obj);
        }
      } else if (Array.isArray(obj)) {
        obj.forEach((item) => extractUrlsFromObject(item));
      } else if (typeof obj === 'object') {
        Object.keys(obj).forEach((key) => extractUrlsFromObject(obj[key]));
      }
    };

    // --- Track pagination state ---
    let listHasMore = true;
    let listPagesLoaded = 0;
    let replyApisReceived = 0;

    // Setup response interceptor
    page.on('response', async (response) => {
      const url = response.url();
      if (!url.includes('/api/comment/')) return;
      
      try {
        const json = await response.json();
        const isReply = url.includes('/reply');
        
        if (!isReply) {
          listPagesLoaded++;
          listHasMore = json.has_more === 1 || json.has_more === true;
          console.log(`[Scraper] Comment page ${listPagesLoaded}: ${json.comments?.length || 0} comments, cursor=${json.cursor || 0}, has_more=${listHasMore}, total=${json.total || 0}`);
        } else {
          replyApisReceived++;
        }
        
        extractUrlsFromObject(json);
      } catch (e) {}
    });

    // Navigate
    console.log(`[Scraper] Navigating to page...`);
    await page.goto(videoUrl, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {
      console.log(`[Scraper] Navigation timeout, proceeding...`);
    });
    await page.waitForTimeout(2000);

    // Dismiss popups
    try {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      await page.keyboard.press('Escape');
      
      const closeButtons = page.locator('button[aria-label="Close"], [class*="ButtonClose"], [class*="close-icon"]');
      const count = await closeButtons.count();
      for (let i = 0; i < count; i++) {
        if (await closeButtons.nth(i).isVisible()) {
          await closeButtons.nth(i).click().catch(() => {});
        }
      }
    } catch (e) {}

    // Click comments
    console.log(`[Scraper] Clicking to load comments...`);
    try {
      const commentIcon = page.locator('button[data-e2e="browse-comment-icon"], [data-e2e="comment-icon"], [class*="CommentIcon"]').first();
      const commentsTextTab = page.locator('text="Comments"').or(page.locator('text="Comentarios"')).first();

      if (await commentIcon.isVisible()) {
        await commentIcon.click({ force: true });
      } else if (await commentsTextTab.isVisible()) {
        await commentsTextTab.click({ force: true });
      }

      // Wait for first comment API response
      await page.waitForResponse(
        (res) => res.url().includes('/api/comment/list') && !res.url().includes('/reply'),
        { timeout: 10000 }
      ).catch(() => {});
      await page.waitForTimeout(1000);

      // ======================================================
      // PHASE 1: Load ALL comment pages
      // Key insight: We must scroll ONLY the DivCommentMain container.
      // Scrolling the DivColumnListContainer navigates to the next video!
      // ======================================================
      console.log(`[Scraper] Phase 1: Loading all comment pages...`);
      
      let consecutiveFailures = 0;
      const maxPages = 50;
      
      while (listHasMore && listPagesLoaded < maxPages && consecutiveFailures < 5) {
        const prevPages = listPagesLoaded;
        
        // Scroll the COMMENT container specifically (not the feed/page container)
        await page.evaluate(() => {
          // Find the comment container by class pattern (TikTok uses DivCommentMain)
          const allDivs = Array.from(document.querySelectorAll('div'));
          for (const el of allDivs) {
            const cls = el.className?.toString() || '';
            // Match the comment main container specifically
            if (cls.includes('CommentMain') || cls.includes('comment-main')) {
              if (el.scrollHeight > el.clientHeight && el.clientHeight > 100) {
                el.scrollTop = el.scrollHeight;
                return;
              }
            }
          }
          // Fallback: find the scrollable container that is NOT the full-page feed
          // The comment container typically has clientHeight between 300-700px
          // The feed container has clientHeight equal to viewport (800px)
          let commentContainer: HTMLElement | null = null;
          for (const el of allDivs) {
            if (el.scrollHeight > el.clientHeight && el.clientHeight > 100 && el.clientHeight < 750) {
              // Pick the one with the most scrollable content in the right size range
              if (!commentContainer || el.scrollHeight > commentContainer.scrollHeight) {
                commentContainer = el;
              }
            }
          }
          if (commentContainer) {
            commentContainer.scrollTop = commentContainer.scrollHeight;
          }
        });

        // Wait for a new comment LIST API response
        try {
          await page.waitForResponse(
            (res) => res.url().includes('/api/comment/list') && !res.url().includes('/reply') && res.status() === 200,
            { timeout: 4000 }
          );
          await page.waitForTimeout(300);
        } catch (e) {
          // No API response within timeout
        }

        if (listPagesLoaded > prevPages) {
          consecutiveFailures = 0;
        } else {
          consecutiveFailures++;
          // Alternative scroll attempts
          await page.evaluate(() => {
            const allDivs = Array.from(document.querySelectorAll('div'));
            for (const el of allDivs) {
              const cls = el.className?.toString() || '';
              if ((cls.includes('CommentMain') || cls.includes('comment-main') || cls.includes('CommentList')) && 
                  el.scrollHeight > el.clientHeight) {
                // Scroll incrementally instead of to bottom
                el.scrollTop += 3000;
                return;
              }
            }
            // Broad fallback: scroll all non-feed containers
            for (const el of allDivs) {
              if (el.scrollHeight > el.clientHeight && el.clientHeight > 100 && el.clientHeight < 750) {
                el.scrollTop += 3000;
              }
            }
          });
          await page.waitForTimeout(2000);
        }
      }
      
      console.log(`[Scraper] Phase 1 complete: ${listPagesLoaded} pages, has_more=${listHasMore}, ${result.stickers.length} stickers so far`);

      // ======================================================
      // PHASE 2: Expand reply threads
      // ======================================================
      console.log(`[Scraper] Phase 2: Expanding reply threads...`);
      
      for (let pass = 0; pass < 3; pass++) {
        const replyButtons = page.locator('text=/View.*repl|Ver.*respuest/i');
        const replyCount = await replyButtons.count();
        
        if (replyCount === 0) break;
        
        console.log(`[Scraper] Reply pass ${pass + 1}: ${replyCount} buttons`);
        
        for (let j = 0; j < replyCount; j++) {
          try {
            const btn = replyButtons.nth(j);
            if (await btn.isVisible({ timeout: 200 })) {
              await btn.click({ force: true }).catch(() => {});
              try {
                await page.waitForResponse(
                  (res) => res.url().includes('/api/comment/list/reply') && res.status() === 200,
                  { timeout: 3000 }
                );
              } catch (e) {}
              await page.waitForTimeout(200);
            }
          } catch (e) {}
        }
        
        // Also click "View more replies"
        const moreReplies = page.locator('text=/View more|Ver más/i');
        const moreCount = await moreReplies.count();
        for (let j = 0; j < moreCount; j++) {
          try {
            const btn = moreReplies.nth(j);
            if (await btn.isVisible({ timeout: 200 })) {
              await btn.click({ force: true }).catch(() => {});
              try {
                await page.waitForResponse(
                  (res) => res.url().includes('/api/comment/list/reply') && res.status() === 200,
                  { timeout: 3000 }
                );
              } catch (e) {}
              await page.waitForTimeout(200);
            }
          } catch (e) {}
        }

        // Scroll comment container to reveal more buttons
        await page.evaluate(() => {
          const allDivs = Array.from(document.querySelectorAll('div'));
          for (const el of allDivs) {
            const cls = el.className?.toString() || '';
            if ((cls.includes('CommentMain') || cls.includes('comment-main')) && el.scrollHeight > el.clientHeight) {
              el.scrollTop += 3000;
              return;
            }
          }
        });
        await page.waitForTimeout(500);
      }

      console.log(`[Scraper] Phase 2 complete: ${replyApisReceived} reply APIs`);

      // ======================================================
      // PHASE 3: DOM scan as safety net
      // ======================================================
      console.log(`[Scraper] Phase 3: DOM scan...`);
      const domStickerUrls = await page.evaluate(() => {
        const found: string[] = [];
        document.querySelectorAll('img').forEach((el) => {
          const src = el.src || el.getAttribute('data-src') || '';
          if ((src.includes('ibyteimg.com') || src.includes('byteimg.com')) && (src.includes('sticker') || src.includes('.awebp'))) {
            if (!found.includes(src)) found.push(src);
          }
        });
        return found;
      });
      domStickerUrls.forEach((url) => addStickerUrl(url));

    } catch (e) {
      console.log(`[Scraper] Error:`, e);
    }

    console.log(`[Scraper] Done! ${result.stickers.length} stickers from ${listPagesLoaded} pages + ${replyApisReceived} replies`);
    await browser.close();

    return result;
  }

  private async extractGenericImages(url: string): Promise<StickerExtractionResult> {
    const result: StickerExtractionResult = {
      tiktok_url: url,
      stickers: []
    };

    console.log(`[Scraper] Starting generic image extraction for ${url}`);
    const browser = await chromium.launch({ headless: true });
    
    try {
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 }
      });
      const page = await context.newPage();

      await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(2000);

      // Scroll a bit to lazy-load images
      await page.evaluate(() => window.scrollBy(0, 1500));
      await page.waitForTimeout(1000);

      const images = await page.evaluate(() => {
        const urls: string[] = [];
        const imgs = Array.from(document.querySelectorAll('img, svg image'));
        
        imgs.forEach((img: any) => {
          const src = img.src || img.getAttribute('data-src') || img.getAttribute('srcset') || '';
          if (!src || typeof src !== 'string' || !src.startsWith('http')) return;

          // Ignore tiny icons / favicons / logos
          const width = img.naturalWidth || img.clientWidth || 0;
          const height = img.naturalHeight || img.clientHeight || 0;
          if (width > 0 && width < 40) return;
          if (height > 0 && height < 40) return;
          
          if (src.includes('avatar') || src.includes('favicon') || src.includes('logo')) return;

          if (!urls.includes(src)) {
            urls.push(src);
          }
        });
        return urls;
      });

      result.stickers = images.slice(0, 50); // Limit to top 50 images
      console.log(`[Scraper] Found ${result.stickers.length} generic images from ${url}`);
    } catch (e) {
      console.error('[Scraper] Generic extraction error:', e);
    } finally {
      await browser.close();
    }

    return result;
  }
}
