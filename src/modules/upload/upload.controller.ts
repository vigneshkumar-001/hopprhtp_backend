import type { Request, Response } from 'express';
import { uploadService } from './upload.service';
import { ok } from '../../common/types';
import { BadRequest } from '../../common/errors';
import { env } from '../../config/env';

export const uploadController = {
  async image(req: Request, res: Response) {
    if (!req.file) throw BadRequest('No image uploaded — use the form field "file"');
    const { path } = await uploadService.saveImage(req.file);
    const base = env.PUBLIC_BASE_URL ?? `${req.protocol}://${req.get('host')}`;
    res.status(201).json(ok({ url: `${base}${path}`, path }));
  },
};
