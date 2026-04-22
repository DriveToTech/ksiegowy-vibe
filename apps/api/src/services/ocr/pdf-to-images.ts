import { fromBuffer } from 'pdf2pic';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Converts each page of a PDF buffer to JPEG image buffers.
 *
 * Requires GraphicsMagick or ImageMagick installed on the host:
 *   macOS:  brew install graphicsmagick
 *   Linux:  apt-get install graphicsmagick
 */
export async function pdfToImages(pdfBuffer: Buffer): Promise<Buffer[]> {
  const tmpDir = path.join(os.tmpdir(), `ocr-${randomUUID()}`);
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    const convert = fromBuffer(pdfBuffer, {
      density: 200,
      saveFilename: 'page',
      savePath: tmpDir,
      format: 'jpeg',
      width: 2000,
      height: 2828,
    });

    const result = await convert.bulk(-1, { responseType: 'buffer' });

    return result
      .filter((r) => r.buffer != null)
      .map((r) => r.buffer as Buffer);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}
