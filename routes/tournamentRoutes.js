import express from 'express';
import {
  getTournamentOverview,
  getTournamentSetup,
  getDivisionGroups,
} from '../controllers/tournamentController.js';
import {
  archiveTournament,
  getTournamentHistory,
  getTournamentHistoryDetail,
} from '../controllers/tournamentArchiveController.js';
import {
  getPyramidTiers,
  assignPyramidTiers,
  getPyramidSetup,
  getPyramidProgressionLogHandler,
  overridePyramidAdvancementHandler,
  regeneratePyramidStageHandler,
  activateLevel1BHandler,
} from '../controllers/tierPyramidController.js';
import { authenticate, isAdmin } from '../middlewares/auth.js';

const router = express.Router();

router.get('/setup', getTournamentSetup);
router.get('/groups', getDivisionGroups);
router.get('/overview', getTournamentOverview);
router.get('/history', getTournamentHistory);
router.get('/history/:id', getTournamentHistoryDetail);
router.post('/archive', authenticate, isAdmin, archiveTournament);

router.get('/pyramid/setup', getPyramidSetup);
router.get('/pyramid/tiers', getPyramidTiers);
router.get('/pyramid/progression-log', getPyramidProgressionLogHandler);
router.post('/pyramid/assign-tiers', authenticate, isAdmin, assignPyramidTiers);
router.post('/pyramid/override-advancement', authenticate, isAdmin, overridePyramidAdvancementHandler);
router.post('/pyramid/regenerate-stage', authenticate, isAdmin, regeneratePyramidStageHandler);
router.post('/pyramid/activate-level1b', authenticate, isAdmin, activateLevel1BHandler);

export default router;
