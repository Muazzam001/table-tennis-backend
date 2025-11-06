import express from 'express';
import { seedTeamsAndMatches } from '../controllers/seedController.js';

const router = express.Router();

// Route for seeding teams and matches
router.post('/teams-and-matches', seedTeamsAndMatches);

export default router;

