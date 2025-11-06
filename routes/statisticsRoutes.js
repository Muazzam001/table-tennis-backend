import express from 'express';
import {
  getAllStatistics,
  getPlayerStatistics,
  getTeamStatistics
} from '../controllers/statisticsController.js';

const router = express.Router();

// Routes
router.get('/', getAllStatistics);
router.get('/player/:playerId', getPlayerStatistics);
router.get('/team/:teamId', getTeamStatistics);

export default router;

