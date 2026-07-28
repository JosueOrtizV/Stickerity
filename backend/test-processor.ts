import { ImageProcessor } from './src/services/processor';
import fs from 'fs';
import path from 'path';

async function run() {
  const processor = new ImageProcessor();
  const testStickerUrl = 'https://p16-tiktok-dm-sticker-sign-sg.ibyteimg.com/tos-alisg-i-dhq7zx4c1p-sg/97dfb996fba5436da5cb18196e340a89~tplv-dhq7zx4c1p-full.awebp?rk3s=00edd399&x-expires=1787617619&x-signature=yFWMWyatsLa3U7MHR6l%2F6y5RXhE%3D';

  console.log('Testing Image Processor Pipeline...');
  console.log(`Downloading: ${testStickerUrl}`);

  try {
    const rawBuffer = await processor.downloadImage(testStickerUrl);
    console.log(`Raw download size: ${(rawBuffer.length / 1024).toFixed(2)} KB`);

    console.log('Processing to WhatsApp sticker format (512x512 animated WebP)...');
    const result = await processor.processSticker(rawBuffer);

    console.log('\n--- Processing Successful ---');
    console.log(`Dimensions: ${result.width}x${result.height}`);
    console.log(`MimeType: ${result.mimeType}`);
    console.log(`Final Size: ${(result.size / 1024).toFixed(2)} KB`);
    console.log(`WhatsApp Limit Check (<500KB): ${result.size < 500 * 1024 ? '✅ PASSED' : '❌ EXCEEDED'}`);

    const outputPath = path.join(__dirname, 'output-test-sticker.webp');
    fs.writeFileSync(outputPath, result.buffer);
    console.log(`Saved output file to: ${outputPath}`);

  } catch (error) {
    console.error('Error during image processing:', error);
  }
}

run();
