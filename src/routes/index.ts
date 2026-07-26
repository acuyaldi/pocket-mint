import { Router } from 'express';
import { transactionRouter } from './transaction.routes';
import { userRouter } from './user.routes';
import { walletRouter } from './walletRoutes';
import { dashboardRouter } from './dashboardRoutes';
import { installmentRouter } from './installmentRoutes';
import { categoryRouter } from './categoryRoutes';
import { recurringTransactionRouter } from './recurringTransaction.routes';
import { notificationRouter } from './notification.routes';
import { savingGoalRouter } from './savingGoal.routes';
import { budgetRouter } from './budgetRoutes';
import { analyticsRouter } from './analyticsRoutes';
import { merchantMappingRouter } from './merchantMappingRoutes';
import { assistantRouter } from './assistantRoutes';
import { channelRouter } from './channelRoutes';
import { telegramRouter } from './telegramRoutes';

const router = Router();

// API v1
router.use('/v1/dashboard', dashboardRouter);
router.use('/v1/transactions', transactionRouter);
router.use('/v1/wallets', walletRouter);
router.use('/v1/users', userRouter);
router.use('/v1/categories', categoryRouter);
router.use('/v1/bills', installmentRouter);
router.use('/v1/installments', installmentRouter);
router.use('/v1/recurring-transactions', recurringTransactionRouter);
router.use('/v1/notifications', notificationRouter);
router.use('/v1/saving-goals', savingGoalRouter);
router.use('/v1/budgets', budgetRouter);
router.use('/v1/analytics', analyticsRouter);
router.use('/v1/merchant-mappings', merchantMappingRouter);
router.use('/v1/assistant', assistantRouter);
router.use('/v1/channels', channelRouter);
router.use('/v1/telegram', telegramRouter);

export { router };
