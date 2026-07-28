import sharp from 'sharp';
import fs from 'fs';

async function test() {
  const metadata = await sharp('d:\\Proyectos\\TokSticker\\backend\\test-input.webp', { animated: true }).metadata();
  console.log('Pages (animation frames):', metadata.pages);
  
  // If we had a webp... wait I don't have a local webp to test with.
}
test();
