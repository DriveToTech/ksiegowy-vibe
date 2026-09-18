import { existsSync, writeFileSync } from 'node:fs';
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
      functionToPromisify(...argumentsList, (error: Error | null) => {
        if (error) {
          reject(error);
          return;
        }

        resolve({ stdout: '', stderr: '' });
      });
    }),
}));

import { pdfToImages } from './pdf-to-images.js';

describe('pdfToImages()', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('renders only the first five pages and removes temporary files', async () => {
    mockExecuteFile.mockImplementationOnce((...argumentsList: unknown[]) => {
      const commandArguments = argumentsList[1] as string[];
      const callback = argumentsList.at(-1) as unknown as (error: null) => void;

      for (let pageNumber = 1; pageNumber <= 6; pageNumber++) {
        writeFileSync(`${commandArguments.at(-1)}-${pageNumber}.jpg`, `page-${pageNumber}`);
      }

      callback(null);
    });

    const imageBuffers = await pdfToImages(Buffer.from('pdf'));
    const temporaryDirectoryPath = mockExecuteFile.mock.calls[0][1][7].replace(
      /\/document\.pdf$/u,
      '',
    );

    expect(imageBuffers).toHaveLength(5);
    expect(imageBuffers.map((imageBuffer) => imageBuffer.toString())).toEqual([
      'page-1',
      'page-2',
      'page-3',
      'page-4',
      'page-5',
    ]);
    expect(mockExecuteFile).toHaveBeenCalledWith(
      'pdftocairo',
      ['-jpeg', '-r', '200', '-f', '1', '-l', '5', expect.stringMatching(/document\.pdf$/u), expect.stringMatching(/page$/u)],
      { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, timeout: 30_000 },
      expect.any(Function),
    );
    expect(existsSync(temporaryDirectoryPath)).toBe(false);
  });

  it('removes temporary files when pdftocairo fails', async () => {
    mockExecuteFile.mockImplementationOnce((...argumentsList: unknown[]) => {
      const callback = argumentsList.at(-1) as unknown as (error: Error) => void;
      callback(new Error('pdftocairo failed'));
    });

    await expect(pdfToImages(Buffer.from('pdf'))).rejects.toThrow('pdftocairo failed');

    const temporaryDirectoryPath = mockExecuteFile.mock.calls[0][1][7].replace(
      /\/document\.pdf$/u,
      '',
    );
    expect(existsSync(temporaryDirectoryPath)).toBe(false);
  });
});
