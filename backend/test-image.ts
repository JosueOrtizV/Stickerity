import sharp from 'sharp';
import fs from 'fs/promises';
import axios from 'axios';

const url = 'https://p16-tiktok-dm-sticker-sign-sg.ibyteimg.com/tos-alisg-i-dhq7zx4c1p-sg/8ef2c18fe83d437f90481298c969ad3c~tplv-dhq7zx4c1p-full.awebp?rk3s=00edd399&x-expires=1787798998&x-signature=eMOLeto06Hn439RzSNStL4K0oHU%3D';

async function testProcessing() {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  const buffer = Buffer.from(response.data);
  
  await fs.writeFile('raw.webp', buffer);
  console.log('Saved raw.webp');

  const sharpWebp = await sharp(buffer, { animated: true })
    .resize(200, 200, { fit: 'contain' })
    .webp({ effort: 1, loop: 0 })
    .toBuffer();
  await fs.writeFile('sharp.webp', sharpWebp);
  console.log('Saved sharp.webp');

  console.time('gif-conversion');
  const sharpGif = await sharp(buffer, { animated: true })
    .resize(200, 200, { fit: 'contain' })
    .gif({ loop: 0 })
    .toBuffer();
  console.timeEnd('gif-conversion');
  await fs.writeFile('sharp.gif', sharpGif);
  console.log('Saved sharp.gif');
}

testProcessing().catch(console.error);
