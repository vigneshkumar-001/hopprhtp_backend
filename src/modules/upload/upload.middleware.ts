import multer from 'multer';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../../config/env';
import { BadRequest } from '../../common/errors';

const MAX_BYTES = env.UPLOAD_MAX_MB * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

// Memory storage so we can validate the real bytes before anything touches disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1, fields: 2 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG, PNG or WebP images are allowed'));
  },
}).single('file');

/** Single-image multer handler that maps upload errors to clean 400s. */
export function uploadImage(req: Request, res: Response, next: NextFunction): void {
  upload(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(BadRequest(`Image is too large (max ${env.UPLOAD_MAX_MB}MB)`));
      }
      return next(BadRequest(err.message));
    }
    return next(BadRequest(err instanceof Error ? err.message : 'Upload failed'));
  });
}
