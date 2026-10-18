import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __dirname = import.meta.dirname || path.dirname(new URL(import.meta.url).pathname);
const ROOT_DIR = path.resolve(__dirname, '../../');
const DATA_DIR = process.env.DATA_DIR 
  ? path.resolve(ROOT_DIR, process.env.DATA_DIR) 
  : path.resolve(ROOT_DIR, 'data');
const UPLOAD_DIR = process.env.UPLOAD_DIR 
  ? path.resolve(ROOT_DIR, process.env.UPLOAD_DIR) 
  : path.resolve(DATA_DIR, 'uploads');
const DB_PATH = process.env.DB_PATH 
  ? path.resolve(ROOT_DIR, process.env.DB_PATH) 
  : path.resolve(DATA_DIR, 'invoicepilot.db');

// Ensure storage directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  dataDir: DATA_DIR,
  uploadDir: UPLOAD_DIR,
  dbPath: DB_PATH,
  maxFileSizeBytes: parseInt(process.env.MAX_FILE_SIZE_BYTES || '10485760', 10), // 10MB default
  maxFilesPerBatch: parseInt(process.env.MAX_FILES_PER_BATCH || '10', 10),
  allowedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'],
  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'gemma4:e2b-it-qat',
    timeoutMs: parseInt(process.env.OLLAMA_TIMEOUT_MS || '60000', 10),
  },
  mockAiMode: process.env.MOCK_AI_MODE === 'true',
};
