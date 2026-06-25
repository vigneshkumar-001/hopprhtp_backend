import { Router } from 'express';
import { authGuard } from '../../common/middleware/authGuard';
import { asyncHandler } from '../../common/http/asyncHandler';
import { uploadImage } from './upload.middleware';
import { uploadController } from './upload.controller';

const router = Router();

// POST /api/v1/uploads — authenticated single-image upload (multipart/form-data).
router.post('/', authGuard, uploadImage, asyncHandler(uploadController.image));

export const uploadRoutes = router;
