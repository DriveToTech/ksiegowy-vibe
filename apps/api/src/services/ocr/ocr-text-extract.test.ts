import fs from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockExecuteFile } = vi.hoisted(() => ({
  mockExecuteFile: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: mockExecuteFile,
}));

vi.mock('node:util', () => ({
  promisify: (functionToPromisify: (...argumentsList: unknown[]) => unknown) => (...argumentsList: unknown[]) =>
    new Promise((resolve, reject) => {
      functionToPromisify(...argumentsList, (error: Error | null, output: string) => {
        if (error) {
          reject(error);
          return;
        }

        resolve({ stdout: output, stderr: '' });
      });
    }),
}));

import { extractTextWithTesseract } from './ocr-text-extract.js';

describe('extractTextWithTesseract()', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('extracts text through the Tesseract executable and removes the temporary image', async () => {
    const unlinkSpy = vi.spyOn(fs, 'unlink');
    const tsvOutput = [
      'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
      ...Array.from({ length: 6 }, (_, index) =>
        `5\t1\t1\t1\t${index + 1}\t1\t0\t0\t100\t20\t85.00\tfaktura numer ${index + 1} kwota brutto 100.00`,
      ),
    ].join('\n');

    mockExecuteFile.mockImplementationOnce((...argumentsList: unknown[]) => {
      const callback = argumentsList.at(-1) as unknown as (error: null, output: string, errorOutput: string) => void;
      callback(null, tsvOutput, '');
    });

    const extractedText = await extractTextWithTesseract([Buffer.from('image')]);
    const temporaryFilePath = mockExecuteFile.mock.calls[0][1][0];

    expect(extractedText).toContain('faktura numer 1');
    expect(mockExecuteFile).toHaveBeenCalledWith(
      'tesseract',
      [temporaryFilePath, 'stdout', '-l', 'pol', '--oem', '1', '--psm', '6', 'tsv'],
      { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, timeout: 30_000 },
      expect.any(Function),
    );
    expect(unlinkSpy).toHaveBeenCalledWith(temporaryFilePath);
  });

  it('removes the temporary image when Tesseract fails', async () => {
    const unlinkSpy = vi.spyOn(fs, 'unlink');

    mockExecuteFile.mockImplementationOnce((...argumentsList: unknown[]) => {
      const callback = argumentsList.at(-1) as unknown as (error: Error, output: string, errorOutput: string) => void;
      callback(new Error('Tesseract failed'), '', '');
    });

    await expect(extractTextWithTesseract([Buffer.from('image')])).rejects.toThrow('Tesseract failed');

    const temporaryFilePath = mockExecuteFile.mock.calls[0][1][0];
    expect(unlinkSpy).toHaveBeenCalledWith(temporaryFilePath);
  });
});
