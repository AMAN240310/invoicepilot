import { extractText } from 'unpdf';

export interface PdfExtractionResult {
  text: string;
  pageCount: number;
  isDigital: boolean; // false if text is too sparse, requiring OCR fallback
}

export class PdfService {
  /**
   * Extracts selectable digital text from PDF buffer using unpdf.
   * If text is insufficient or empty, flags for OCR fallback.
   */
  static async extractText(buffer: Buffer): Promise<PdfExtractionResult> {
    try {
      const uint8 = new Uint8Array(buffer);
      const result = await extractText(uint8);

      const rawPages = Array.isArray(result.text) ? result.text.join('\n') : String(result.text || '');
      const cleanedText = rawPages
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        .trim();

      const pageCount = result.totalPages || 1;
      // An invoice with less than 30 characters of readable text is almost certainly scanned
      const isDigital = cleanedText.length >= 30;

      return {
        text: cleanedText,
        pageCount,
        isDigital,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to parse PDF document: ${message}`);
    }
  }
}
