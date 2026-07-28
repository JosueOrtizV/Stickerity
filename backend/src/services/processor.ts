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
  /**
   * Downloads raw image buffer from URL
   */
  async downloadImage(url: string): Promise<Buffer> {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        'Referer': 'https://www.tiktok.com/',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      }
    });
    return Buffer.from(response.data);
  }

  /**
   * Generates a safe, bug-free preview for the web grid (GIF for animated, WebP for static)
   */
  async createPreview(inputBuffer: Buffer): Promise<{ buffer: Buffer, mimeType: string }> {
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
      return { buffer, mimeType: 'image/gif' };
    } else {
      const buffer = await sharp(inputBuffer)
        .resize(256, 256, { fit: 'inside' })
        .webp({ quality: 80 })
        .toBuffer();
      return { buffer, mimeType: 'image/webp' };
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
    const sharpInstance = sharp(inputBuffer, { animated: true })
      .resize(512, 512, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .webp({
        quality,
        effort: 4,
        loop: 0 // Infinite loop for WhatsApp stickers
      });

    processedBuffer = await sharpInstance.toBuffer();

    // 3. Size check: If larger than 500KB (WhatsApp limit), reduce quality iteratively
    const MAX_SIZE_BYTES = 490 * 1024; // 490 KB safety threshold
    while (processedBuffer.length > MAX_SIZE_BYTES && quality > 20) {
      quality -= 15;
      processedBuffer = await sharp(inputBuffer, { animated: true })
        .resize(512, 512, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .webp({
          quality,
          effort: 4,
          loop: 0
        })
        .toBuffer();
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
   * Injects WhatsApp sticker EXIF metadata into WebP buffer
   */
  private async addExifMetadata(webpBuffer: Buffer): Promise<Buffer> {
    const img = new webp.Image();
    await img.load(webpBuffer);

    const json = {
      'sticker-pack-id': 'Stickerity',
      'sticker-pack-name': 'Stickerity',
      'sticker-pack-publisher': 'Stickerity'
    };

    const jsonBuff = Buffer.from(JSON.stringify(json), 'utf-8');
    const exifHeader = Buffer.from([
      0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00
    ]);
    const lengthBuff = Buffer.from([
      jsonBuff.length & 0xff,
      (jsonBuff.length >> 8) & 0xff,
      (jsonBuff.length >> 16) & 0xff,
      (jsonBuff.length >> 24) & 0xff
    ]);
    const zeroBuff = Buffer.from([0x00, 0x00, 0x00, 0x00]);

    const exif = Buffer.concat([exifHeader, lengthBuff, zeroBuff, jsonBuff]);
    img.exif = exif;

    return await img.save(null);
  }
}
