import { Router } from 'express';
import { authRoutes } from './modules/auth/auth.routes';
import { userRoutes } from './modules/user/user.routes';
import { transactionRoutes } from './modules/transaction/transaction.routes';
import { walletRoutes } from './modules/wallet/wallet.routes';
import { disputeRoutes } from './modules/dispute/dispute.routes';
import { uploadRoutes } from './modules/upload/upload.routes';
import { checkoutRoutes } from './modules/checkout/checkout.routes';
import { supportRoutes } from './modules/support/support.routes';
import { notificationRoutes } from './modules/notification/notification.routes';

/** All JSON API routes, mounted under /api/v1 (webhooks are mounted separately). */
export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', uptime: process.uptime() } });
});

apiRouter.use('/auth', authRoutes);
apiRouter.use('/users', userRoutes);
apiRouter.use('/transactions', transactionRoutes);
apiRouter.use('/wallet', walletRoutes);
apiRouter.use('/disputes', disputeRoutes);
apiRouter.use('/uploads', uploadRoutes);
apiRouter.use('/checkout', checkoutRoutes); // public hosted-checkout API
apiRouter.use('/support', supportRoutes);
apiRouter.use('/notifications', notificationRoutes);
