import { Router } from 'express';
import { authenticateMerchant } from '../middleware/auth';
import { placeWager } from '../controllers/wagerController';
import * as marketController from '../controllers/marketController';
import * as transactionController from '../controllers/transactionController';

const router = Router();

// Protect all v1 routes with Merchant Auth
router.use(authenticateMerchant);

router.post('/wager', placeWager);
router.get('/markets', marketController.listMarkets);
router.get('/markets/:id', marketController.getMarketDetails);

// Market Groups
router.get('/market-groups', marketController.listMarketGroups);
router.get('/market-groups/:id', marketController.getMarketGroupDetails);

router.get('/balance', transactionController.getBalance);
router.get('/transactions', transactionController.getTransactions);

export default router;
