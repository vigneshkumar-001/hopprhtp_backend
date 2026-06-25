import { Router } from 'express';
import { authGuard } from '../../common/middleware/authGuard';
import { validate } from '../../common/middleware/validate';
import { asyncHandler } from '../../common/http/asyncHandler';
import { notificationController } from './notification.controller';
import { idParam, listQuerySchema } from './notification.schema';

const router = Router();
router.use(authGuard);

router.get('/', validate({ query: listQuerySchema }), asyncHandler(notificationController.list));
router.get('/unread-count', asyncHandler(notificationController.unreadCount));
router.post('/read-all', asyncHandler(notificationController.markAllRead));
router.post('/:id/read', validate({ params: idParam }), asyncHandler(notificationController.markRead));

export const notificationRoutes = router;
