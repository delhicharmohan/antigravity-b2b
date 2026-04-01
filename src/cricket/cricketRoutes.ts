import { Router } from 'express';
import { authenticateMerchant, authenticateAdmin } from '../middleware/auth';
import * as cricket from './cricketController';

// ===== Merchant Routes (/v1/ipl) =====

export const iplMerchantRoutes = Router();

iplMerchantRoutes.use(authenticateMerchant);

iplMerchantRoutes.get('/tournaments', cricket.listTournaments);
iplMerchantRoutes.get('/matches', cricket.listMatches);
iplMerchantRoutes.get('/matches/:matchKey', cricket.getMatchDetail);
iplMerchantRoutes.get('/matches/:matchKey/contests', cricket.getMatchContests);
iplMerchantRoutes.get('/matches/:matchKey/micro', cricket.getLiveMicroContests);
iplMerchantRoutes.get('/players', cricket.listPlayers);

// ===== Admin Routes (/admin/ipl) =====

export const iplAdminRoutes = Router();

iplAdminRoutes.use(authenticateAdmin);

iplAdminRoutes.post('/sync', cricket.triggerSync);
iplAdminRoutes.post('/generate-markets/:matchKey', cricket.generateMarkets);
iplAdminRoutes.post('/generate-today', cricket.generateTodaysMarkets);
iplAdminRoutes.get('/dashboard', cricket.getDashboard);
iplAdminRoutes.post('/subscribe/:matchKey', cricket.subscribeToMatch);
iplAdminRoutes.post('/unsubscribe/:matchKey', cricket.unsubscribeFromMatch);
iplAdminRoutes.post('/micro/toggle/:matchKey', cricket.toggleMicroContests);
iplAdminRoutes.post('/micro/enable/:matchKey', cricket.enableMicroContests);
