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

    const browser = await chromium.launch({
      headless: true,
      args: ['--disable-dev-shm-usage', '--no-sandbox']
    });
    let globalTimeout: NodeJS.Timeout | null = null;

    try {
      // 65-second global safety timeout
      const timeoutPromise = new Promise<void>((_, reject) => {
        globalTimeout = setTimeout(() => {
          reject(new Error('Global extraction timeout (65s) reached'));
        }, 65000);
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

        // Block heavy video/audio media streams and fonts to prevent CPU starvation on headless VPS
        await page.route('**/*', (route) => {
          const type = route.request().resourceType();
          if (type === 'media' || type === 'font') {
            return route.abort();
          }
          return route.continue();
        });

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
          
          const isReply = url.includes('/reply');
          try {
            const text = await response.text();
            if (!text || text.trim().length === 0) {
              if (!isReply && listPagesLoaded > 0) {
                listHasMore = false;
                log(`Comment page returned empty body, stopping main list pagination`);
              }
              return;
            }

            const json = JSON.parse(text);
            
            if (!isReply) {
              const count = json.comments?.length || 0;
              if (count === 0 && listPagesLoaded > 0) {
                listHasMore = false;
                log(`Comment page returned empty (cursor=${json.cursor}), stopping main list pagination`);
              } else {
                const cursor = json.cursor || 0;
                if (!seenCursors.has(cursor)) {
                  seenCursors.add(cursor);
                  listPagesLoaded++;
                  listHasMore = json.has_more === 1 || json.has_more === true;
                  log(`Comment page ${listPagesLoaded}: ${count} comments, cursor=${cursor}, has_more=${listHasMore}, total=${json.total || 0}`);
                }
              }
            } else {
              replyApisReceived++;
            }
            
            extractUrlsFromObject(json);
          } catch (e) {
            if (!isReply && listPagesLoaded > 0) {
              listHasMore = false;
              log(`Comment page returned non-JSON response, stopping main list pagination`);
            }
          }
        });

        // Navigate
        log(`Navigating to page...`);
        await page.goto(videoUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {
          log(`Navigation timeout, proceeding...`);
        });

        // Wait for TikTok React hydration (comment icon or comment list or unavailable message)
        log(`Waiting for TikTok UI hydration...`);
        await page.waitForFunction(
          () => {
            const hasCommentUi = !!document.querySelector(
              '[data-e2e="comment-icon"], [data-e2e="browse-comment-icon"], [data-e2e="comment-count"], [data-e2e="comment-list"], [class*="CommentListContainer"]'
            );
            const bodyText = document.body?.innerText || '';
            const isUnavailable =
              bodyText.includes('Video currently unavailable') ||
              bodyText.includes('Este video no está disponible') ||
              bodyText.includes("Couldn't find this account");
            return hasCommentUi || isUnavailable;
          },
          { timeout: 18000 }
        ).catch(() => {
          log(`Hydration wait timed out, continuing...`);
        });

        // Early exit if video does not exist / is unavailable
        const isVideoUnavailable = await page.evaluate(() => {
          const t = document.body?.innerText || '';
          return (
            t.includes('Video currently unavailable') ||
            t.includes('Este video no está disponible')
          ) && !document.querySelector('[data-e2e="comment-icon"], [data-e2e="browse-comment-icon"]');
        }).catch(() => false);

        if (isVideoUnavailable) {
          log(`Video is unavailable on TikTok, aborting early.`);
          return;
        }

        // Click comments
        log(`Clicking to load comments...`);
        try {
          const isCommentPanelVisible = async () => {
            return await page.evaluate(() => {
              const el = document.querySelector(
                '[class*="CommentListContainer"], [data-e2e="comment-list"], [class*="DivCommentObjectWrapper"], [class*="DivCommentMain"]'
              ) as HTMLElement | null;
              return !!(el && el.offsetHeight > 50);
            }).catch(() => false);
          };

          const triggerCommentsNative = async () => {
            if (listPagesLoaded > 0 || (await isCommentPanelVisible())) {
              return;
            }

            // Dismiss any login modal blocking the page using native DOM click/remove
            await page.evaluate(() => {
              const closeBtn = document.querySelector(
                '[data-e2e="modal-close-inner-button"], [id="loginModalContentContainer"] button'
              ) as HTMLElement | null;
              if (closeBtn) closeBtn.click();
              document.querySelectorAll('[data-e2e="login-modal"], [id="loginModalContentContainer"]').forEach(m => m.remove());
            }).catch(() => {});

            // Native DOM click on comment icon/count avoids Playwright actionability hang
            const clicked = await page.evaluate(() => {
              const targets = [
                '[data-e2e="browse-comment-icon"]',
                '[data-e2e="comment-icon"]',
                '[data-e2e="comment-count"]',
                '[class*="CommentIcon"]'
              ];
              for (const sel of targets) {
                const el = document.querySelector(sel) as HTMLElement | null;
                if (el) {
                  el.click();
                  if (el.parentElement) el.parentElement.click();
                  return sel;
                }
              }
              return null;
            }).catch(() => null);

            if (clicked) {
              log(`Triggered comments via native click on ${clicked}`);
            } else {
              await page.keyboard.press('c').catch(() => {});
              log(`Triggered comments via shortcut 'c'`);
            }
          };

          if (listPagesLoaded === 0) {
            await triggerCommentsNative();
            await page.waitForResponse(
              (res) => res.url().includes('/api/comment/list') && !res.url().includes('/reply'),
              { timeout: 10000 }
            ).catch(() => {});
            await page.waitForTimeout(400);
          }

          // Cold-start fallback: only click again if comment panel is STILL not visible and 0 pages loaded
          if (listPagesLoaded === 0 && !(await isCommentPanelVisible())) {
            log(`Cold start delay detected, retrying comment trigger...`);
            await triggerCommentsNative();
            await page.waitForResponse(
              (res) => res.url().includes('/api/comment/list') && !res.url().includes('/reply'),
              { timeout: 8000 }
            ).catch(() => {});
            await page.waitForTimeout(400);
          }

          // PHASE 1: Load ALL comment pages
          log(`Phase 1: Loading all comment pages...`);
          
          let consecutiveFailures = 0;
          const maxPages = 20;
          
          while (listHasMore && listPagesLoaded < maxPages && consecutiveFailures < 2) {
            const prevPages = listPagesLoaded;

            // Expand any visible reply buttons natively while scrolling (target <button> inside DivViewMoreRepliesWrapper)
            await page.evaluate(() => {
              const replyBtns = Array.from(
                document.querySelectorAll(
                  '[class*="DivViewMoreRepliesWrapper"] button, [data-e2e*="view-more"] button, [class*="DivViewMoreRepliesWrapper"]'
                )
              ) as HTMLElement[];
              for (const btn of replyBtns.slice(0, 12)) {
                const txt = (btn.innerText || '').toLowerCase();
                if (
                  txt.includes('view') ||
                  txt.includes('ver') ||
                  txt.includes('more') ||
                  txt.includes('más') ||
                  txt.includes('repl') ||
                  txt.includes('respuest')
                ) {
                  const innerBtn = btn.querySelector('button, [role="button"]') as HTMLElement | null;
                  if (innerBtn) innerBtn.click();
                  btn.click();
                }
              }
            }).catch(() => {});

            // Fast native DOM Scroll targeting DivCommentMain (including DivCommentMainWithoutScroll)
            const scrolledClass = await page.evaluate(() => {
              window.scrollBy(0, 3000);

              const listContainer = document.querySelector('[class*="CommentListContainer"]');
              if (listContainer && listContainer.lastElementChild) {
                listContainer.lastElementChild.scrollIntoView({ behavior: 'instant', block: 'end' });
              }

              const allDivs = Array.from(document.querySelectorAll('div'));
              let targetClass = 'none';
              // Note: Do NOT blacklist 'WithoutScroll' — TikTok names its main scrollable container DivCommentMainWithoutScroll!
              const blacklist = /Column|FlexLayout|TabContainer|CountContainer|PlayerContainer|VideoPlayer|ItemContainer/i;

              // Case B1: Priority match for DivCommentMain or CommentListContainer
              for (let i = 0; i < allDivs.length; i++) {
                const el = allDivs[i];
                const cls = el.className?.toString() || '';
                if (cls.match(/DivCommentMain|CommentListContainer|comment-main|CommentList/i) && !cls.match(blacklist)) {
                  if (el.scrollHeight > el.clientHeight && el.clientHeight > 100) {
                    el.scrollTop = el.scrollHeight + 3000;
                    el.dispatchEvent(new Event('scroll', { bubbles: true }));
                    targetClass = cls;
                    break;
                  }
                }
              }

              // Case C: broad fallback (any scrollable div)
              if (targetClass === 'none') {
                for (let i = 0; i < allDivs.length; i++) {
                  const el = allDivs[i];
                  const cls = el.className?.toString() || '';
                  if (!cls.match(blacklist) && el.scrollHeight > el.clientHeight && el.clientHeight > 100 && el.clientHeight < 900) {
                    el.scrollTop = el.scrollHeight + 3000;
                    el.dispatchEvent(new Event('scroll', { bubbles: true }));
                    targetClass = cls || 'unknown-div';
                    break;
                  }
                }
              }

              // Case D: Force-scroll comment container even if NOT scrollable yet
              if (targetClass === 'none') {
                for (let i = 0; i < allDivs.length; i++) {
                  const el = allDivs[i];
                  const cls = el.className?.toString() || '';
                  if (cls.match(/DivCommentMain|CommentListContainer|RightPanel/i) && !cls.match(blacklist) && el.clientHeight > 100) {
                    el.scrollTop = el.scrollHeight + 3000;
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
                { timeout: 2200 }
              );
              await page.waitForTimeout(200);
            } catch (e) {}

            if (!listHasMore) {
              break;
            }

            if (listPagesLoaded > prevPages) {
              consecutiveFailures = 0;
            } else {
              consecutiveFailures++;
              log(`Phase 1 pause (${consecutiveFailures}/2 failures). Container: ${scrolledClass.split(' ')[0]}`);

              // Try to close any login modal that might have popped up and blocked the scroll
              try {
                await page.evaluate(() => {
                  const closeBtn = document.querySelector(
                    '[data-e2e="modal-close-inner-button"], [id="loginModalContentContainer"] button'
                  ) as HTMLElement | null;
                  if (closeBtn) closeBtn.click();
                  const modals = document.querySelectorAll('[data-e2e="login-modal"], [id="loginModalContentContainer"]');
                  modals.forEach(m => m.remove());
                }).catch(() => {});

                if (listPagesLoaded === 0) {
                  await triggerCommentsNative();
                }
              } catch (e) {}

              // Jiggle scroll on DOM - force-scroll any comment-related container
              await page.evaluate(() => {
                const allDivs = Array.from(document.querySelectorAll('div'));
                const blacklist = /Column|FlexLayout|TabContainer|CountContainer|PlayerContainer|VideoPlayer|ItemContainer/i;
                for (let i = 0; i < allDivs.length; i++) {
                  const el = allDivs[i];
                  const cls = el.className?.toString() || '';
                  if (cls.match(/DivCommentMain|CommentListContainer|RightPanel/i) && !cls.match(blacklist) && el.clientHeight > 100) {
                    el.scrollTop = Math.max(0, el.scrollTop - 800);
                    el.dispatchEvent(new Event('scroll', { bubbles: true }));
                    setTimeout(() => {
                      el.scrollTop = el.scrollHeight + 3000;
                      el.dispatchEvent(new Event('scroll', { bubbles: true }));
                    }, 100);
                  }
                }
              });
              await page.waitForTimeout(500);
            }
          }

          log(`Phase 1 complete: ${listPagesLoaded} pages, has_more=${listHasMore}, ${result.stickers.length} stickers so far`);

          // PHASE 2: Expand remaining and multi-page reply threads natively
          log(`Phase 2: Expanding reply threads...`);
          for (let pass = 0; pass < 5; pass++) {
            const clickedCount = await page.evaluate(() => {
              const replyBtns = Array.from(
                document.querySelectorAll(
                  '[class*="DivViewMoreRepliesWrapper"] button, [data-e2e*="view-more"] button'
                )
              ) as HTMLElement[];
              let clicked = 0;
              for (const btn of replyBtns.slice(0, 20)) {
                const txt = (btn.innerText || '').toLowerCase();
                if (
                  txt.includes('view') ||
                  txt.includes('ver') ||
                  txt.includes('more') ||
                  txt.includes('más') ||
                  txt.includes('repl') ||
                  txt.includes('respuest')
                ) {
                  btn.click();
                  clicked++;
                }
              }
              return clicked;
            }).catch(() => 0);

            if (clickedCount === 0) break;
            log(`Reply pass ${pass + 1}: clicked ${clickedCount} buttons`);
            await page.waitForTimeout(1300);
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
              if ((src.includes('ibyteimg.com') || src.includes('byteimg.com') || src.includes('tiktokcdn')) && (src.includes('sticker') || src.includes('.awebp'))) {
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
