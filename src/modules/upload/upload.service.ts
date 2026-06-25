import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from '../../config/env';
import { BadRequest } from '../../common/errors';

const UPLOAD_DIR = path.resolve(process.cwd(), env.UPLOAD_DIR);

/**
 * Detects the image type from magic bytes — the client's `mimetype` is
 * spoofable, so we verify the actual content before trusting it.
 */
function detectImageExt(buf: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return 'png';
  }
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'webp';
  }
  return null;
}

export const uploadService = {
  /** Validates the bytes and writes the file under a random, safe name. */
  async saveImage(file: Express.Multer.File): Promise<{ path: string }> {
    const ext = detectImageExt(file.buffer);
    if (!ext) throw BadRequest('The file is not a valid image');

    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const name = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
    // `wx` → fail if the (random) name somehow exists; never overwrite.
    await fs.writeFile(path.join(UPLOAD_DIR, name), file.buffer, { flag: 'wx' });

    return { path: `/uploads/${name}` };
  },
};
