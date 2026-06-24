import { Router } from 'express';
import { asyncHandler } from '../../common/http/asyncHandler';
import { webhookController } from './webhook.controller';

// Note: this router is mounted with `express.raw()` upstream so the controller
// can verify the HMAC signature over the exact bytes Escrow.com sent.
const router = Router();

router.post('/escrow', asyncHandler(webhookController.escrow));

export const webhookRoutes = router;
