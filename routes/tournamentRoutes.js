import express from 'express';
import {
  getTournamentOverview,
  getTournamentSetup,
  getLeagueGroups,
} from '../controllers/tournamentController.js';

const router = express.Router();

router.get('/setup', getTournamentSetup);
router.get('/groups', getLeagueGroups);
router.get('/overview', getTournamentOverview);

export default router;
