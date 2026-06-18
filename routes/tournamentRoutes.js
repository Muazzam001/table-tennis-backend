import express from 'express';
import {
  getTournamentOverview,
  getTournamentSetup,
  getLeagueGroups,
} from '../controllers/tournamentController.js';
import {
  archiveTournament,
  getTournamentHistory,
  getTournamentHistoryDetail,
} from '../controllers/tournamentArchiveController.js';
import { authenticate, isAdmin } from '../middlewares/auth.js';

const router = express.Router();

router.get('/setup', getTournamentSetup);
router.get('/groups', getLeagueGroups);
router.get('/overview', getTournamentOverview);
router.get('/history', getTournamentHistory);
router.get('/history/:id', getTournamentHistoryDetail);
router.post('/archive', authenticate, isAdmin, archiveTournament);

export default router;
