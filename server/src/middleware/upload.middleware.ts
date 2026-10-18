import multer from 'multer';
import path from 'path';
import { config } from '../config/index.js';

// Memory storage so we can hash the file and validate before writing to disk
const storage = multer.memoryStorage();

const fileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg'];
  const ext = path.extname(file.originalname).toLowerCase();

  const isMimeAllowed = config.allowedMimeTypes.includes(file.mimetype.toLowerCase());
  const isExtAllowed = allowedExtensions.includes(ext);

  if (isMimeAllowed && isExtAllowed) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Invalid file type '${file.mimetype}'. Only PDF, PNG, and JPEG formats are supported.`
      )
    );
  }
};

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: config.maxFileSizeBytes,
    files: config.maxFilesPerBatch,
  },
  fileFilter,
});
