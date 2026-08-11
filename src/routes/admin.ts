import { Router } from 'express';
import * as adminController from '../controllers/adminController';
import { authenticateAdmin } from '../middleware/auth';

const router = Router();

// Public login
router.post('/login', adminController.adminLogin);

// Protected routes
router.use(authenticateAdmin);

// Merchants
router.post('/merchants', adminController.createMerchant);
router.get('/merchants', adminController.listMerchants);
router.put('/merchants/:id', adminController.updateMerchant);
router.delete('/merchants/:id', adminController.deleteMerchant);

// Markets
router.post('/markets', adminController.createMarket);
router.get('/markets', adminController.listMarkets);
router.put('/markets/:id', adminController.updateMarket);
router.delete('/markets/:id', adminController.deleteMarket);

router.post('/markets/:id/settle', adminController.settleMarketController);
router.post('/markets/:id/resolve', adminController.resolveMarketController);
router.post('/markets/:id/void', adminController.voidMarket);
router.get('/wagers', adminController.listWagers);
router.get('/stats', adminController.getStatsController);
router.get('/logs', adminController.listLogs);
router.post('/scout', adminController.runScout);
router.post('/scout/preview', adminController.previewScout);
router.post('/scout/import', adminController.importMarkets);
router.post('/scout/import/preview', adminController.previewImport);
router.get('/meta', adminController.getSystemMeta);
router.get('/webhooks/logs', adminController.listWebhookLogs);
router.get('/markets/:id/payouts', adminController.getMarketPayoutSummary);
router.get('/trends', adminController.getTrends);

// Market Groups
router.post('/market-groups', adminController.createMarketGroupController);
router.get('/market-groups', adminController.listMarketGroupsController);
router.delete('/market-groups/:id', adminController.deleteMarketGroupController);

export default router;
