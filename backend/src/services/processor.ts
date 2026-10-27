import sharp from 'sharp';
import axios from 'axios';
import webp from 'node-webpmux';

export interface ProcessedStickerResult {
  buffer: Buffer;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  isAnimated: boolean;
}

export class ImageProcessor {
  private rawCache = new Map<string, { buffer: Buffer, time: number }>();

  /**
   * Downloads raw image buffer from URL (with 5-minute memory cache)
   */
  async downloadImage(url: string): Promise<Buffer> {
    const cached = this.rawCache.get(url);
    if (cached && Date.now() - cached.time < 5 * 60 * 1000) {
      return cached.buffer;
    }

    let referer = 'https://www.tiktok.com/';
    try {
      referer = new URL(url).origin + '/';
    } catch (e) {}

    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': referer,
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      }
    });
    
    const buffer = Buffer.from(response.data);
    this.rawCache.set(url, { buffer, time: Date.now() });
    
    // Simple cleanup of old entries to prevent memory leaks
    if (this.rawCache.size > 500) {
      const now = Date.now();
      for (const [key, val] of this.rawCache.entries()) {
        if (now - val.time > 5 * 60 * 1000) {
          this.rawCache.delete(key);
        }
      }
    }
    
    return buffer;
  }

  /**
   * Generates a safe, bug-free preview for the web grid (GIF for animated, WebP for static)
   */
  async createPreview(inputBuffer: Buffer): Promise<{ buffer: Buffer, mimeType: string, isAnimated: boolean }> {
    const metadata = await sharp(inputBuffer, { animated: true }).metadata();
    const isAnimated = (metadata.pages || 0) > 1;

    if (isAnimated) {
      // Chromium struggles rendering some .awebp native files natively in <img> tags.
      // Converting to a 256x256 GIF rasterizes the frames perfectly for the browser.
      const buffer = await sharp(inputBuffer, { animated: true })
        .resize(256, 256, { 
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .gif({ loop: 0 })
        .toBuffer();
      return { buffer, mimeType: 'image/gif', isAnimated: true };
    } else {
      const buffer = await sharp(inputBuffer)
        .resize(256, 256, { fit: 'inside' })
        .webp({ quality: 80 })
        .toBuffer();
      return { buffer, mimeType: 'image/webp', isAnimated: false };
    }
  }

  /**
   * Processes a TikTok sticker (.awebp / .webp) into a WhatsApp compatible 512x512 sticker
   */
  async processSticker(inputBuffer: Buffer, format: 'webp' | 'gif' = 'webp'): Promise<ProcessedStickerResult> {
    // 1. Read metadata from input image (enable animated: true for animated webp)
    const metadata = await sharp(inputBuffer, { animated: true }).metadata();
    const isAnimated = (metadata.pages || 0) > 1;

    let quality = 80;
    let processedBuffer: Buffer;

    // If GIF is requested and it's animated, return a GIF. 
    // WhatsApp's native mobile 'Create Sticker' converts GIFs to animated stickers!
    if (format === 'gif' && isAnimated) {
      processedBuffer = await sharp(inputBuffer, { animated: true })
        .resize(512, 512, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .gif({ loop: 0 })
        .toBuffer();

      return {
        buffer: processedBuffer,
        mimeType: 'image/gif',
        size: processedBuffer.length,
        width: 512,
        height: 512,
        isAnimated
      };
    }

    // 2. Perform resize to 512x512 while keeping aspect ratio and transparent padding (WEBP Flow)
    // For static images, check if the image is completely opaque; if so, use 510x510 + 1px transparent
    // border so libwebp always emits VP8X (alpha: true) + ALPH chunk required by WhatsApp Stickers.
    let needsAlphaBorder = false;
    if (!isAnimated) {
      if (!metadata.hasAlpha) {
        needsAlphaBorder = true;
      } else {
        const rawPixels = await sharp(inputBuffer).ensureAlpha().raw().toBuffer();
        let hasTransparentPixel = false;
        for (let i = 3; i < rawPixels.length; i += 4) {
          if (rawPixels[i] < 255) {
            hasTransparentPixel = true;
            break;
          }
        }
        if (!hasTransparentPixel) {
          needsAlphaBorder = true;
        }
      }
    }

    const buildWebpBuffer = async (q: number): Promise<Buffer> => {
      let pipeline = sharp(inputBuffer, { animated: isAnimated }).ensureAlpha();
      if (!isAnimated && needsAlphaBorder) {
        pipeline = pipeline
          .resize(510, 510, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          })
          .extend({
            top: 1,
            bottom: 1,
            left: 1,
            right: 1,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          });
      } else {
        pipeline = pipeline.resize(512, 512, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        });
      }
      return pipeline
        .webp({
          quality: q,
          alphaQuality: 100,
          effort: 4,
          loop: 0 // Infinite loop for WhatsApp stickers
        })
        .toBuffer();
    };

    processedBuffer = await buildWebpBuffer(quality);

    // 3. Size check: WhatsApp requires < 100KB for static stickers and < 500KB for animated stickers
    const MAX_SIZE_BYTES = isAnimated ? 490 * 1024 : 95 * 1024;
    while (processedBuffer.length > MAX_SIZE_BYTES && quality > 15) {
      quality -= 15;
      processedBuffer = await buildWebpBuffer(quality);
    }

    // 4. Inject WhatsApp EXIF Metadata so WhatsApp natively treats it as a Sticker
    try {
      processedBuffer = await this.addExifMetadata(processedBuffer);
    } catch (e) {
      console.error('[Processor] Failed to inject EXIF metadata:', e);
    }

    return {
      buffer: processedBuffer,
      mimeType: 'image/webp',
      size: processedBuffer.length,
      width: 512,
      height: 512,
      isAnimated
    };
  }

  /**
   * Injects WhatsApp sticker EXIF metadata into WebP buffer matching native STK-*.webp format
   */
  private async addExifMetadata(webpBuffer: Buffer): Promise<Buffer> {
    const img = new webp.Image();
    await img.load(webpBuffer);

    const json = {
      'sticker-pack-id': 'com.stickerity.app.stickercontentprovider 1',
      'sticker-pack-name': 'Stickerity',
      'sticker-pack-publisher': 'Stickerity',
      'android-app-store-link': 'https://stickerity.app',
      'ios-app-store-link': 'https://stickerity.app'
    };

    const jsonBuff = Buffer.from(JSON.stringify(json), 'utf-8');
    // Native WhatsApp WebP EXIF chunk starts directly with the Little-Endian TIFF header (II*\0),
    // WITHOUT the 6-byte JPEG "Exif\0\0" prefix, and uses offset 0x16 (22 bytes) to the JSON payload.
    const exifHeader = Buffer.from([
      0x49, 0x49, 0x2a, 0x00, // TIFF Little-Endian header ("II*\0")
      0x08, 0x00, 0x00, 0x00, // Offset to first IFD (8 bytes)
      0x01, 0x00,             // 1 IFD entry
      0x41, 0x57,             // Tag ID 0x5741 ("WA" in little-endian)
      0x07, 0x00              // Tag Type 7 (UNDEFINED)
    ]);
    const lengthBuff = Buffer.from([
      jsonBuff.length & 0xff,
      (jsonBuff.length >> 8) & 0xff,
      (jsonBuff.length >> 16) & 0xff,
      (jsonBuff.length >> 24) & 0xff
    ]);
    // 22 bytes (0x16) from start of TIFF header to start of JSON payload
    const offsetBuff = Buffer.from([0x16, 0x00, 0x00, 0x00]);

    const exif = Buffer.concat([exifHeader, lengthBuff, offsetBuff, jsonBuff]);
    img.exif = exif;

    const savedBuffer = await img.save(null);

    // Fix node-webpmux bug where saving animated WebP clears the Alpha flag (0x10) in VP8X
    if (
      webpBuffer.length > 20 &&
      savedBuffer.length > 20 &&
      webpBuffer.slice(12, 16).toString('ascii') === 'VP8X' &&
      savedBuffer.slice(12, 16).toString('ascii') === 'VP8X'
    ) {
      const originalAlphaFlag = webpBuffer[20] & 0x10;
      savedBuffer[20] = savedBuffer[20] | originalAlphaFlag;
    }

    return savedBuffer;
  }
}
