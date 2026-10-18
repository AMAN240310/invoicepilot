import { createWorker } from 'tesseract.js';

export class OcrService {
  /**
   * Performs optical character recognition on an image buffer (PNG, JPEG, etc.)
   * Includes resource limits and timeout handling.
   */
  static async extractTextFromImage(buffer: Buffer, timeoutMs: number = 45000): Promise<string> {
    let worker: Tesseract.Worker | null = null;
    let timer: NodeJS.Timeout | null = null;

    try {
      const ocrPromise = (async () => {
        worker = await createWorker('eng');
        const ret = await worker.recognize(buffer);
        return ret.data.text ? ret.data.text.trim() : '';
      })();

      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`OCR processing timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      const text = await Promise.race([ocrPromise, timeoutPromise]);
      return text;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`OCR extraction failed: ${message}`);
    } finally {
      if (timer) clearTimeout(timer);
      if (worker) {
        try {
          await (worker as Tesseract.Worker).terminate();
        } catch {
          // Ignore termination errors during cleanup
        }
      }
    }
  }
}
