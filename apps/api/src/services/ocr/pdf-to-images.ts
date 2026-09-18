import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const executeFile = promisify(execFile);
const MAX_PAGES = 5;

/**
 * Converts at most five PDF pages to JPEG image buffers.
 *
 * Requires Poppler's pdftocairo installed on the host:
 *   macOS:  brew install poppler
 *   Linux:  apt-get install poppler-utils
 */
export async function pdfToImages(pdfBuffer: Buffer): Promise<Buffer[]> {
  const temporaryDirectoryPath = path.join(os.tmpdir(), `ocr-${randomUUID()}`);
  const pdfPath = path.join(temporaryDirectoryPath, 'document.pdf');
  const outputPrefix = path.join(temporaryDirectoryPath, 'page');
  await fs.mkdir(temporaryDirectoryPath, { recursive: true });

  try {
    await fs.writeFile(pdfPath, pdfBuffer);
    await executeFile(
      'pdftocairo',
      ['-jpeg', '-r', '200', '-f', '1', '-l', String(MAX_PAGES), pdfPath, outputPrefix],
      { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, timeout: 30_000 },
    );

    const outputFiles = (await fs.readdir(temporaryDirectoryPath))
      .filter((fileName) => /^page-\d+\.jpg$/u.test(fileName))
      .sort((firstFileName, secondFileName) => {
        const firstPageNumber = Number(firstFileName.match(/\d+/u)?.[0] ?? 0);
        const secondPageNumber = Number(secondFileName.match(/\d+/u)?.[0] ?? 0);
        return firstPageNumber - secondPageNumber;
      })
      .slice(0, MAX_PAGES);

    return Promise.all(
      outputFiles.map((fileName) => fs.readFile(path.join(temporaryDirectoryPath, fileName))),
    );
  } finally {
    await fs.rm(temporaryDirectoryPath, { recursive: true, force: true });
  }
}
