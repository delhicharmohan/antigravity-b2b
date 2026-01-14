import { Router } from 'express';
import { authenticateMerchant } from '../middleware/auth';
import { placeWager } from '../controllers/wagerController';
import * as marketController from '../controllers/marketController';

const router = Router();

// Protect all v1 routes with Merchant Auth
router.use(authenticateMerchant);

router.post('/wager', placeWager);
router.get('/markets', marketController.listMarkets);
router.get('/markets/:id', marketController.getMarketDetails);

export default router;
