import express from 'express';
import { seedPlayers, seedTeamsAndMatches } from '../controllers/seedController.js';
import { authenticate, isAdmin } from '../middlewares/auth.js';

const router = express.Router();

router.post('/players', authenticate, isAdmin, seedPlayers);
// Legacy alias — seeds players only
router.post('/teams-and-matches', authenticate, isAdmin, seedTeamsAndMatches);

export default router;

