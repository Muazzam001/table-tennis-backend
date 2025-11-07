import express from 'express';
import { seedTeamsAndMatches } from '../controllers/seedController.js';
import { authenticate, isAdmin } from '../middlewares/auth.js';

const router = express.Router();

// Admin-only route for seeding teams and matches
router.post('/teams-and-matches', authenticate, isAdmin, seedTeamsAndMatches);

export default router;

