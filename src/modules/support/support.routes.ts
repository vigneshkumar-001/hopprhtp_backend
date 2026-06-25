import { Router } from 'express';
import { authGuard } from '../../common/middleware/authGuard';
import { validate } from '../../common/middleware/validate';
import { asyncHandler } from '../../common/http/asyncHandler';
import { supportController } from './support.controller';
import { createTicketSchema } from './support.schema';

const router = Router();
router.use(authGuard);

router.get('/overview', asyncHandler(supportController.overview));
router.get('/tickets', asyncHandler(supportController.listMine));
router.post('/tickets', validate({ body: createTicketSchema }), asyncHandler(supportController.createTicket));

export const supportRoutes = router;
