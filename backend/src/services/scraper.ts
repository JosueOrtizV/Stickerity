import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Add stealth plugin to playwright-extra
chromium.use(StealthPlugin());

export interface StickerExtractionResult {
  source_url: string;
  stickers: string[];
}

export class StickerScraper {
  async extractStickers(targetUrl: string): Promise<StickerExtractionResult> {
    if (!targetUrl.includes('tiktok.com')) {
      return this.extractGenericImages(targetUrl);
    }
    return this.extractTikTokStickers(targetUrl);
  }

  /**
   * TikTok Specialized Comment Sticker Extractor
   */
  private async extractTikTokStickers(videoUrl: string): Promise<StickerExtractionResult> {
    const result: StickerExtractionResult = {
      source_url: videoUrl,
      stickers: []
    };

    console.log(`[Scraper] Starting TikTok extraction for ${videoUrl}`);

    const browser = await chromium.launch({ headless: true });
    let globalTimeout: NodeJS.Timeout | null = null;

    try {
      // 90-second global safety timeout
      const timeoutPromise = new Promise<void>((_, reject) => {
        globalTimeout = setTimeout(() => {
          reject(new Error('Global extraction timeout (90s) reached'));
        }, 90000);
      });

      const extractionPromise = (async () => {
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
        const seenCursors = new Set<number>();

        // Setup response interceptor
        page.on('response', async (response) => {
          const url = response.url();
          if (!url.includes('/api/comment/')) return;
          
          try {
            const json = await response.json();
            const isReply = url.includes('/reply');
            
            if (!isReply) {
              const cursor = json.cursor || 0;
              if (!seenCursors.has(cursor)) {
                seenCursors.add(cursor);
                listPagesLoaded++;
                listHasMore = json.has_more === 1 || json.has_more === true;
                console.log(`[Scraper] Comment page ${listPagesLoaded}: ${json.comments?.length || 0} comments, cursor=${cursor}, has_more=${listHasMore}, total=${json.total || 0}`);
              }
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

          await page.waitForResponse(
            (res) => res.url().includes('/api/comment/list') && !res.url().includes('/reply'),
            { timeout: 10000 }
          ).catch(() => {});
          await page.waitForTimeout(1000);

          // PHASE 1: Load ALL comment pages
          console.log(`[Scraper] Phase 1: Loading all comment pages...`);
          
          let consecutiveFailures = 0;
          const maxPages = 50;
          
          while (listHasMore && listPagesLoaded < maxPages && consecutiveFailures < 3) {
            const prevPages = listPagesLoaded;
            
            await page.evaluate(() => {
              const allDivs = Array.from(document.querySelectorAll('div'));
              for (const el of allDivs) {
                const cls = el.className?.toString() || '';
                if (cls.includes('CommentMain') || cls.includes('comment-main')) {
                  if (el.scrollHeight > el.clientHeight && el.clientHeight > 100) {
                    el.scrollTop = el.scrollHeight;
                    return;
                  }
                }
              }
              let commentContainer: HTMLElement | null = null;
              for (const el of allDivs) {
                if (el.scrollHeight > el.clientHeight && el.clientHeight > 100 && el.clientHeight < 750) {
                  if (!commentContainer || el.scrollHeight > commentContainer.scrollHeight) {
                    commentContainer = el;
                  }
                }
              }
              if (commentContainer) {
                commentContainer.scrollTop = commentContainer.scrollHeight;
              }
            });

            try {
              await page.waitForResponse(
                (res) => res.url().includes('/api/comment/list') && !res.url().includes('/reply') && res.status() === 200,
                { timeout: 3500 }
              );
              await page.waitForTimeout(200);
            } catch (e) {}

            if (listPagesLoaded > prevPages) {
              consecutiveFailures = 0;
            } else {
              consecutiveFailures++;
              await page.evaluate(() => {
                const allDivs = Array.from(document.querySelectorAll('div'));
                for (const el of allDivs) {
                  const cls = el.className?.toString() || '';
                  if ((cls.includes('CommentMain') || cls.includes('comment-main') || cls.includes('CommentList')) && 
                      el.scrollHeight > el.clientHeight) {
                    el.scrollTop += 3000;
                    return;
                  }
                }
                for (const el of allDivs) {
                  if (el.scrollHeight > el.clientHeight && el.clientHeight > 100 && el.clientHeight < 750) {
                    el.scrollTop += 3000;
                  }
                }
              });
              await page.waitForTimeout(1500);
            }
          }
          
          console.log(`[Scraper] Phase 1 complete: ${listPagesLoaded} pages, has_more=${listHasMore}, ${result.stickers.length} stickers so far`);

          // PHASE 2: Expand reply threads
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
                      { timeout: 2500 }
                    );
                  } catch (e) {}
                  await page.waitForTimeout(150);
                }
              } catch (e) {}
            }
            
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
                      { timeout: 2500 }
                    );
                  } catch (e) {}
                  await page.waitForTimeout(150);
                }
              } catch (e) {}
            }

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
            await page.waitForTimeout(400);
          }

          console.log(`[Scraper] Phase 2 complete: ${replyApisReceived} reply APIs`);

          // PHASE 3: DOM scan as safety net
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
          console.log(`[Scraper] Error during extraction steps:`, e);
        }

        console.log(`[Scraper] Done! ${result.stickers.length} stickers from ${listPagesLoaded} pages + ${replyApisReceived} replies`);
      })();

      await Promise.race([extractionPromise, timeoutPromise]);

    } catch (e: any) {
      console.error(`[Scraper] TikTok extraction ended with notice:`, e.message || e);
    } finally {
      if (globalTimeout) clearTimeout(globalTimeout);
      await browser.close().catch(() => {});
    }

    return result;
  }

  /**
   * Generic Web Image Extractor
   */
  private async extractGenericImages(url: string): Promise<StickerExtractionResult> {
    const result: StickerExtractionResult = {
      source_url: url,
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
      await page.waitForTimeout(1500);

      // Progressive multi-step scroll to trigger lazy loading
      for (let i = 0; i < 4; i++) {
        await page.evaluate(() => window.scrollBy(0, 600));
        await page.waitForTimeout(600);
      }

      const rawUrls = await page.evaluate(() => {
        const found: string[] = [];

        // 1. Scan <img> elements
        const imgs = document.querySelectorAll('img, svg image');
        for (let i = 0; i < imgs.length; i++) {
          const img = imgs[i] as any;
          const width = img.naturalWidth || img.clientWidth || 0;
          const height = img.naturalHeight || img.clientHeight || 0;
          if (width > 0 && width < 40) continue;
          if (height > 0 && height < 40) continue;

          const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-original') || '';
          if (src && typeof src === 'string' && src.startsWith('http') && !found.includes(src)) {
            found.push(src);
          }

          const srcset = img.getAttribute('srcset');
          if (srcset) {
            const parts = srcset.split(',');
            for (let j = 0; j < parts.length; j++) {
              const candidate = parts[j].trim().split(' ')[0];
              if (candidate && candidate.startsWith('http') && !found.includes(candidate)) {
                found.push(candidate);
              }
            }
          }
        }

        // 2. Scan background images in CSS
        const els = document.querySelectorAll('div, span, a, section');
        for (let i = 0; i < els.length; i++) {
          const style = window.getComputedStyle(els[i]);
          const bg = style.backgroundImage;
          if (bg && bg !== 'none' && bg.includes('url(')) {
            const match = bg.match(/url\((['"]?)(.*?)\1\)/);
            if (match && match[2]) {
              let clean = match[2].trim();
              if (clean.startsWith('//')) clean = 'https:' + clean;
              if (clean.startsWith('http') && !found.includes(clean)) {
                found.push(clean);
              }
            }
          }
        }

        return found;
      });

      // Filter and deduplicate on backend by pathname
      const pathDeduper = new Set<string>();
      const excludeKeywords = ['icon', 'sprite', 'tracking', 'pixel', 'spacer', 'ad-', 'banner', 'badge', 'avatar', 'favicon', 'logo', 'button'];

      for (const imgUrl of rawUrls) {
        const lower = imgUrl.toLowerCase();
        if (excludeKeywords.some((kw) => lower.includes(kw))) continue;

        try {
          const parsed = new URL(imgUrl);
          const pathname = parsed.pathname;

          if (!pathDeduper.has(pathname)) {
            pathDeduper.add(pathname);
            result.stickers.push(imgUrl);
          }
        } catch (e) {
          result.stickers.push(imgUrl);
        }
      }

      result.stickers = result.stickers.slice(0, 50); // Limit top 50
      console.log(`[Scraper] Found ${result.stickers.length} generic images from ${url}`);

    } catch (e) {
      console.error('[Scraper] Generic extraction error:', e);
    } finally {
      await browser.close().catch(() => {});
    }

    return result;
  }
}

// Export alias for backward compatibility
export { StickerScraper as TikTokScraper };
