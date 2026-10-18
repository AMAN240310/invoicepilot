import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config/index.js';
import { sanitizeFilename, isPathInsideDirectory } from '../utils/security.js';

export class StorageService {
  /**
   * Computes SHA-256 hash of a file buffer
   */
  static computeSha256(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Saves uploaded file buffer to secure storage with a unique, safe filename
   */
  static saveFile(
    buffer: Buffer,
    originalFilename: string
  ): { storedFilename: string; storagePath: string; fileHash: string; fileSize: number } {
    const fileHash = this.computeSha256(buffer);
    const ext = path.extname(originalFilename).toLowerCase() || '.bin';
    const safeBase = sanitizeFilename(path.basename(originalFilename, ext));
    const uniqueSuffix = crypto.randomBytes(8).toString('hex');
    const storedFilename = `${safeBase}_${uniqueSuffix}${ext}`;
    const storagePath = path.join(config.uploadDir, storedFilename);

    // Verify target path does not escape upload directory
    if (!isPathInsideDirectory(storagePath, config.uploadDir)) {
      throw new Error('Invalid storage path target.');
    }

    fs.writeFileSync(storagePath, buffer);
    return {
      storedFilename,
      storagePath,
      fileHash,
      fileSize: buffer.length,
    };
  }

  /**
   * Retrieves a file buffer from storage
   */
  static getFileBuffer(storagePath: string): Buffer {
    if (!isPathInsideDirectory(storagePath, config.uploadDir)) {
      throw new Error('Access denied: Path outside storage directory');
    }
    if (!fs.existsSync(storagePath)) {
      throw new Error('File not found on disk');
    }
    return fs.readFileSync(storagePath);
  }

  /**
   * Deletes a file from storage safely
   */
  static deleteFile(storagePath: string): boolean {
    if (!isPathInsideDirectory(storagePath, config.uploadDir)) {
      return false;
    }
    if (fs.existsSync(storagePath)) {
      try {
        fs.unlinkSync(storagePath);
        return true;
      } catch (err) {
        console.error('Failed to unlink file:', err);
        return false;
      }
    }
    return true;
  }
}
