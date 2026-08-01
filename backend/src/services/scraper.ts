import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Add stealth plugin to playwright-extra
chromium.use(StealthPlugin());

export interface StickerExtractionResult {
  source_url: string;
  stickers: string[];
}

export class StickerScraper {
  async extractStickers(
    targetUrl: string,
    onProgress?: (stickerUrl: string) => void
  ): Promise<StickerExtractionResult> {
    if (!targetUrl.includes('tiktok.com')) {
      return this.extractGenericImages(targetUrl, onProgress);
    }
    return this.extractTikTokStickers(targetUrl, onProgress);
  }

  /**
   * TikTok Specialized Comment Sticker Extractor
   */
  private async extractTikTokStickers(
    videoUrl: string,
    onProgress?: (stickerUrl: string) => void
  ): Promise<StickerExtractionResult> {
    const startTime = Date.now();
    const log = (msg: string) => {
      const ms = Date.now() - startTime;
      console.log(`[Scraper][${(ms / 1000).toFixed(2)}s] ${msg}`);
    };

    const result: StickerExtractionResult = {
      source_url: videoUrl,
      stickers: []
    };

    log(`Starting TikTok extraction for ${videoUrl}`);

    const browser = await chromium.launch({ headless: true });
    let globalTimeout: NodeJS.Timeout | null = null;

    try {
      // 55-second global safety timeout
      const timeoutPromise = new Promise<void>((_, reject) => {
        globalTimeout = setTimeout(() => {
          reject(new Error('Global extraction timeout (55s) reached'));
        }, 55000);
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
            log(`Found sticker #${result.stickers.length} (${uniqueKey.substring(0, 8)}...)`);
            if (onProgress) {
              try { onProgress(rawUrl); } catch (e) {}
            }
          }
        };

        // --- Recursive JSON sticker extractor ---
        const extractUrlsFromObject = (obj: any) => {
          if (!obj) return;
          if (typeof obj === 'string') {
            const isCdn = obj.includes('ibyteimg.com') || obj.includes('byteimg.com') || obj.includes('tiktokcdn');
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
                log(`Comment page ${listPagesLoaded}: ${json.comments?.length || 0} comments, cursor=${cursor}, has_more=${listHasMore}, total=${json.total || 0}`);
              }
            } else {
              replyApisReceived++;
            }
            
            extractUrlsFromObject(json);
          } catch (e) {}
        });

        // Navigate
        log(`Navigating to page...`);
        await page.goto(videoUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {
          log(`Navigation timeout, proceeding...`);
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
        log(`Clicking to load comments...`);
        try {
          const isCommentPanelVisible = async () => {
            const panel = page.locator('[class*="CommentListContainer"], [data-e2e="comment-list"], [class*="DivCommentObjectWrapper"]').first();
            return await panel.isVisible().catch(() => false);
          };

          const tryClickComments = async () => {
            // If the comment panel is ALREADY visible in the DOM, do not click again (avoid toggling it off!)
            if (await isCommentPanelVisible()) {
              return;
            }

            // Dismiss any TikTok login/cookie modals safely without using Escape
            const modalCloseBtn = page.locator('[data-e2e="modal-close-inner-button"], [class*="ModalClose"], [class*="CloseButton"]').first();
            if (await modalCloseBtn.isVisible().catch(() => false)) {
              await modalCloseBtn.click({ force: true }).catch(() => {});
              await page.waitForTimeout(300);
            }

            const commentIcon = page.locator('button[data-e2e="browse-comment-icon"], [data-e2e="comment-icon"], [class*="CommentIcon"]').first();
            const commentsTextTab = page.locator('text="Comments"').or(page.locator('text="Comentarios"')).first();
            const commentCount = page.locator('[class*="CommentCount"], [data-e2e="comment-count"]').first();

            if (await commentIcon.isVisible().catch(() => false)) {
              await commentIcon.click({ force: true }).catch(() => {});
            } else if (await commentsTextTab.isVisible().catch(() => false)) {
              await commentsTextTab.click({ force: true }).catch(() => {});
            } else if (await commentCount.isVisible().catch(() => false)) {
              await commentCount.click({ force: true }).catch(() => {});
            } else {
              // TikTok shortcut key 'c' opens/toggles comment panel
              await page.keyboard.press('c').catch(() => {});
            }
          };

          await tryClickComments();

          await page.waitForResponse(
            (res) => res.url().includes('/api/comment/list') && !res.url().includes('/reply'),
            { timeout: 3500 }
          ).catch(() => {});
          await page.waitForTimeout(300);

          // Cold-start fallback 1: If no comment API was triggered yet, retry clicking
          if (listPagesLoaded === 0) {
            log(`Cold start delay detected, retrying comment trigger...`);
            await tryClickComments();
            await page.waitForResponse(
              (res) => res.url().includes('/api/comment/list') && !res.url().includes('/reply'),
              { timeout: 5000 }
            ).catch(() => {});
            await page.waitForTimeout(300);
          }

          // Cold-start fallback 2: If still no comment API triggered, try shortcut 'c' & direct comment count click
          if (listPagesLoaded === 0) {
            log(`Second cold start retry, attempting direct clicks...`);
            if (!(await isCommentPanelVisible())) {
              await page.keyboard.press('c').catch(() => {});
              await page.waitForTimeout(300);
              const commentCount = page.locator('[class*="CommentCount"], [data-e2e="comment-count"]').first();
              if (await commentCount.isVisible().catch(() => false)) {
                await commentCount.click({ force: true }).catch(() => {});
              }
            }
            await page.waitForResponse(
              (res) => res.url().includes('/api/comment/list') && !res.url().includes('/reply'),
              { timeout: 6000 }
            ).catch(() => {});
            await page.waitForTimeout(300);
          }

          // PHASE 1: Load ALL comment pages
          log(`Phase 1: Loading all comment pages...`);
          
          let consecutiveFailures = 0;
          const maxPages = 20;
          
          while (listHasMore && listPagesLoaded < maxPages && consecutiveFailures < 5) {
            const prevPages = listPagesLoaded;
            
            // 1. Mouse Wheel Scroll (safest)
            // Target DivCommentListContainer, then fall back to RightPanel
            const hoverTarget = await page.$('[class*="CommentListContainer"], [class*="CommentList"]:not([class*="WithoutScroll"]), [class*="RightPanel"], [data-e2e="comment-list"]');
            if (hoverTarget) {
              await hoverTarget.hover({ timeout: 500 }).catch(() => {});
            }
            await page.mouse.wheel(0, 3000).catch(() => {});
            
            // 2. DOM Scroll Fallback
            const scrolledClass = await page.evaluate(() => {
              window.scrollBy(0, 3000); // Case A: window level scroll
              
              const allDivs = Array.from(document.querySelectorAll('div'));
              let targetClass = 'none';
              const blacklist = /Column|WithoutScroll|FlexLayout|TabContainer|CountContainer|PlayerContainer|VideoPlayer|ItemContainer/i;
              
              // Case B1: Exact match for CommentListContainer (the real scroll container)
              for (let i = 0; i < allDivs.length; i++) {
                const el = allDivs[i];
                const cls = el.className?.toString() || '';
                if (cls.match(/CommentListContainer/i) && !cls.match(blacklist)) {
                  if (el.scrollHeight > el.clientHeight && el.clientHeight > 100) {
                    el.scrollTop += 3000;
                    el.dispatchEvent(new Event('scroll', { bubbles: true }));
                    targetClass = cls;
                    break;
                  }
                }
              }

              // Case B2: broader strict match if B1 didn't trigger
              if (targetClass === 'none') {
                for (let i = 0; i < allDivs.length; i++) {
                  const el = allDivs[i];
                  const cls = el.className?.toString() || '';
                  if (cls.match(/CommentMain|comment-main|CommentList|RightPanel/i) && !cls.match(blacklist)) {
                    if (el.scrollHeight > el.clientHeight && el.clientHeight > 100) {
                      el.scrollTop += 3000;
                      el.dispatchEvent(new Event('scroll', { bubbles: true }));
                      targetClass = cls;
                      break;
                    }
                  }
                }
              }
              
              // Case C: broad fallback (any scrollable div)
              if (targetClass === 'none') {
                for (let i = 0; i < allDivs.length; i++) {
                  const el = allDivs[i];
                  const cls = el.className?.toString() || '';
                  if (!cls.match(blacklist) && el.scrollHeight > el.clientHeight && el.clientHeight > 100 && el.clientHeight < 900) {
                    el.scrollTop += 3000;
                    el.dispatchEvent(new Event('scroll', { bubbles: true }));
                    targetClass = cls || 'unknown-div';
                    break;
                  }
                }
              }

              // Case D: Force-scroll RightPanelContainer even if NOT scrollable yet
              // When comments just loaded (1 page), the list container may fit entirely
              // but we still need to trigger the IntersectionObserver
              if (targetClass === 'none') {
                for (let i = 0; i < allDivs.length; i++) {
                  const el = allDivs[i];
                  const cls = el.className?.toString() || '';
                  if (cls.match(/CommentListContainer|RightPanel/i) && !cls.match(blacklist) && el.clientHeight > 100) {
                    el.scrollTop = el.scrollHeight;
                    el.dispatchEvent(new Event('scroll', { bubbles: true }));
                    targetClass = 'force-' + (cls.split(' ')[0] || 'panel');
                    break;
                  }
                }
              }

              return targetClass;
            });

            try {
              await page.waitForResponse(
                (res) => res.url().includes('/api/comment/list') && !res.url().includes('/reply') && res.status() === 200,
                { timeout: 5500 }
              );
              await page.waitForTimeout(300);
            } catch (e) {}

            if (listPagesLoaded > prevPages) {
              consecutiveFailures = 0;
            } else {
              consecutiveFailures++;
              log(`Phase 1 pause (${consecutiveFailures}/5 failures). Container: ${scrolledClass.split(' ')[0]}`);
              
              // Try to close any login modal that might have popped up and blocked the scroll
              try {
                await page.keyboard.press('Escape');
                const closeBtn = page.locator('[data-e2e="modal-close-inner-button"], [data-e2e="login-modal"] button, button[aria-label="Close"], button[aria-label="Cerrar"], [class*="ModalClose"]');
                if (await closeBtn.count() > 0 && await closeBtn.first().isVisible().catch(() => false)) {
                  await closeBtn.first().click({ force: true }).catch(() => {});
                  await page.waitForTimeout(500);
                }
                // Fallback: force remove the modal DOM element if close button didn't work
                await page.evaluate(() => {
                  const modals = document.querySelectorAll('[data-e2e="login-modal"], [id="loginModalContentContainer"]');
                  modals.forEach(m => m.remove());
                }).catch(() => {});
              } catch (e) {}

              
              // Flick the mouse wheel to wake up intersection observer
              if (hoverTarget) await hoverTarget.hover({ timeout: 500 }).catch(() => {});
              await page.mouse.wheel(0, -1000).catch(() => {});
              await page.waitForTimeout(100);
              await page.mouse.wheel(0, 4000).catch(() => {});
              
              // Jiggle scroll on DOM - force-scroll any comment-related container
              await page.evaluate(() => {
                const allDivs = Array.from(document.querySelectorAll('div'));
                const blacklist = /Column|WithoutScroll|FlexLayout|TabContainer|CountContainer|PlayerContainer|VideoPlayer|ItemContainer/i;
                let scrolled = false;
                for (let i = 0; i < allDivs.length; i++) {
                  const el = allDivs[i];
                  const cls = el.className?.toString() || '';
                  // Priority: force-scroll any comment container regardless of scrollHeight
                  if (cls.match(/CommentListContainer|RightPanel/i) && !cls.match(blacklist) && el.clientHeight > 100) {
                    el.scrollTop = 0;
                    el.dispatchEvent(new Event('scroll', { bubbles: true }));
                    setTimeout(() => { 
                      el.scrollTop = el.scrollHeight + 3000; 
                      el.dispatchEvent(new Event('scroll', { bubbles: true }));
                    }, 150);
                    scrolled = true;
                  }
                }
                // Fallback: try any non-blacklisted scrollable div
                if (!scrolled) {
                  for (let i = 0; i < allDivs.length; i++) {
                    const el = allDivs[i];
                    const cls = el.className?.toString() || '';
                    if (!cls.match(blacklist) && el.scrollHeight > el.clientHeight && el.clientHeight > 100 && el.clientHeight < 900) {
                      el.scrollTop = Math.max(0, el.scrollTop - 1500);
                      el.dispatchEvent(new Event('scroll', { bubbles: true }));
                      setTimeout(() => { 
                        el.scrollTop = el.scrollHeight; 
                        el.dispatchEvent(new Event('scroll', { bubbles: true }));
                      }, 150);
                    }
                  }
                }
              });
              await page.waitForTimeout(1500);
            }
          }
          
          log(`Phase 1 complete: ${listPagesLoaded} pages, has_more=${listHasMore}, ${result.stickers.length} stickers so far`);

          // PHASE 2: Expand reply threads
          log(`Phase 2: Expanding reply threads...`);
          
          for (let pass = 0; pass < 3; pass++) {
            const replyButtons = page.locator('text=/View.*repl|Ver.*respuest/i');
            const replyCount = await replyButtons.count();
            
            if (replyCount === 0) break;
            
            log(`Reply pass ${pass + 1}: ${replyCount} buttons`);
            
            const maxReplies = Math.min(replyCount, 15);
            for (let j = 0; j < maxReplies; j++) {
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
            const maxMore = Math.min(moreCount, 15);
            for (let j = 0; j < maxMore; j++) {
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

          log(`Phase 2 complete: ${replyApisReceived} reply APIs`);

          // PHASE 3: DOM scan as safety net using specific data-e2e attribute
          log(`Phase 3: DOM scan...`);
          const domStickerUrls = await page.evaluate(() => {
            const found: string[] = [];
            
            // Priority 1: Exact data-e2e selector found in real TikTok DOM
            document.querySelectorAll('[data-e2e="comment-sticker-comment"] img, [class*="ImgStickerMedia"]').forEach((el) => {
              const img = el as HTMLImageElement;
              const src = img.src || img.getAttribute('data-src') || '';
              if (src && !found.includes(src)) found.push(src);
            });

            // Priority 2: Generic image scan fallback
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
          log(`Error during extraction steps: ${(e as Error).message}`);
        }

        log(`Done! ${result.stickers.length} stickers from ${listPagesLoaded} pages + ${replyApisReceived} replies`);
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
  private async extractGenericImages(
    url: string,
    onProgress?: (stickerUrl: string) => void
  ): Promise<StickerExtractionResult> {
    const startTime = Date.now();
    const log = (msg: string) => {
      const ms = Date.now() - startTime;
      console.log(`[Scraper][${(ms / 1000).toFixed(2)}s] ${msg}`);
    };

    const result: StickerExtractionResult = {
      source_url: url,
      stickers: []
    };

    log(`Starting generic image extraction for ${url}`);
    const browser = await chromium.launch({ headless: true });
    
    try {
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 }
      });
      const page = await context.newPage();

      await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(1500);

      const pathDeduper = new Set<string>();
      const excludeKeywords = ['tracking', 'pixel', 'spacer', 'ad-', 'icon', 'avatar'];

      const processUrl = (imgUrl: string) => {
        const lower = imgUrl.toLowerCase();
        if (excludeKeywords.some((kw) => lower.includes(kw))) return;

        let dedupeKey = imgUrl;
        try {
          const u = new URL(imgUrl);
          if (u.hostname.includes('giphy.com') && u.pathname.includes('/media/')) {
            const parts = u.pathname.split('/');
            const filename = parts.pop() || '';
            const parentDir = parts.pop() || '';
            dedupeKey = u.hostname + '/' + parentDir;
          } else if (u.hostname.includes('twimg.com')) {
            if (u.pathname.includes('/media/')) {
              dedupeKey = u.origin + u.pathname;
            } else {
              const cleanPath = u.pathname.replace(/_(mini|normal|bigger|reasonably_small|x96|\d+x\d+)\.[a-zA-Z0-9]+$/i, '');
              dedupeKey = u.origin + cleanPath;
            }
          } else if (u.hostname.includes('cdninstagram.com')) {
             dedupeKey = u.origin + u.pathname;
          } else {
            const proxyUrl = u.searchParams.get('url') || u.searchParams.get('src');
            if (proxyUrl) {
                try {
                   const proxyU = new URL(proxyUrl, u.origin);
                   dedupeKey = proxyU.origin + proxyU.pathname;
                } catch(e) {
                   dedupeKey = proxyUrl;
                }
            } else {
                let cleanPath = u.pathname.replace(/\/styles\/[^/]+\/public/, '');
                cleanPath = cleanPath.replace(/[-_]\d+x\d+(?=\.[a-zA-Z0-9]+$)/i, '');
                cleanPath = cleanPath.replace(/_[0-9]+(_[0-9]+)?(?=\.[a-zA-Z0-9]+$)/i, '');
                cleanPath = cleanPath.replace(/_(d4k|f4k|cfhd|efhd|bhd|hsd|gsd|mobile)(?=\.[a-z0-9]+$)/i, '');
                cleanPath = cleanPath.replace(/\.[a-zA-Z0-9]+$/i, '');
                dedupeKey = u.origin + cleanPath;
            }
          }
        } catch (e) {}

        if (!pathDeduper.has(dedupeKey)) {
          pathDeduper.add(dedupeKey);
          if (result.stickers.length < 150) {
            result.stickers.push(imgUrl);
            if (onProgress) {
              try { onProgress(imgUrl); } catch (e) {}
            }
          }
        }
      };

      // Function to extract currently visible images in the DOM and process them immediately
      const extractAndProcessDOM = async () => {
        const urls = await page.evaluate(() => {
          const found: string[] = [];
          const els = document.querySelectorAll('img, svg image, source, picture source');
          for (let i = 0; i < els.length; i++) {
            const el = els[i] as any;
            
            if (el.tagName === 'IMG') {
              const width = el.naturalWidth || el.clientWidth || 0;
              const height = el.naturalHeight || el.clientHeight || 0;
              if (width > 0 && width < 40) continue;
              if (height > 0 && height < 40) continue;
            }

            const candidates = [
              el.src, el.getAttribute('data-src'), el.getAttribute('data-original'),
              el.getAttribute('data-url'), el.getAttribute('data-src-webp')
            ];

            for (const src of candidates) {
              if (src && typeof src === 'string' && src.startsWith('http')) found.push(src);
            }

            const srcset = el.getAttribute('srcset') || el.getAttribute('data-srcset');
            if (srcset) {
              const parts = srcset.split(',');
              for (let j = 0; j < parts.length; j++) {
                const candidate = parts[j].trim().split(' ')[0];
                if (candidate && candidate.startsWith('http')) found.push(candidate);
              }
            }
          }

          const bgEls = document.querySelectorAll('div, span, a, section, article');
          for (let i = 0; i < bgEls.length; i++) {
            const style = window.getComputedStyle(bgEls[i]);
            const bg = style.backgroundImage;
            if (bg && bg !== 'none' && bg.includes('url(')) {
              const match = bg.match(/url\((['"]?)(.*?)\1\)/);
              if (match && match[2]) {
                let clean = match[2].trim();
                if (clean.startsWith('//')) clean = 'https:' + clean;
                if (clean.startsWith('http')) found.push(clean);
              }
            }
          }
          return found;
        });

        for (const u of urls) {
          processUrl(u);
        }
      };

      // Extract initially
      await extractAndProcessDOM();

      // Progressive multi-step scroll to trigger lazy loading and extract continuously
      for (let i = 0; i < 25; i++) {
        if (result.stickers.length >= 150) break;
        
        try {
          await page.keyboard.press('Escape');
          const closeBtns = page.locator('[aria-label="Close"], [aria-label="Cerrar"], .close, button:has-text("Not now"), button:has-text("Ahora no")');
          if (await closeBtns.count() > 0 && await closeBtns.first().isVisible().catch(()=>false)) {
            await closeBtns.first().click({ force: true }).catch(() => {});
          }
        } catch (e) {}

        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await page.waitForTimeout(800);
        await extractAndProcessDOM();
      }

      log(`Found ${result.stickers.length} generic images from ${url}`);

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
