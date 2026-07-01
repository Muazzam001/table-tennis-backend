import express from 'express';
import { body } from 'express-validator';
import { MATCH_ROUND_TYPES } from '@shared/tournament/roundTypes.js';
import {
  getAllMatches,
  getMatchById,
  getMatchesByRound,
  createMatch,
  createMultipleMatches,
  updateMatchResult,
  getTeamStandings,
  generateMatchSchedule,
  generateQuarterFinals,
  generateSemiFinals,
  generateFinal,
  generateThirdPlace,
  autoFillMatchResults,
} from '../controllers/matchController.js';
import { authenticate, isAdmin } from '../middlewares/auth.js';
import { handleValidationErrors } from '../middlewares/validation.js';

const router = express.Router();

// Validation rules
const matchValidation = [
  body('team1_id').isInt().withMessage('Team 1 ID must be a valid integer'),
  body('team2_id').isInt().withMessage('Team 2 ID must be a valid integer'),
  body('scheduled_date').isISO8601().withMessage('Scheduled date must be a valid ISO 8601 date'),
  body('venue').optional().trim(),
  body('round_type').optional().isIn(MATCH_ROUND_TYPES),
  body('pool').optional().isString().isLength({ min: 1, max: 5 })
];

// Public routes (read-only for all users)
router.get('/', getAllMatches);
router.get('/round/:roundType', getMatchesByRound);
router.get('/standings', getTeamStandings);
router.get('/:id', getMatchById);

// Admin-only routes (CRUD operations)
router.post('/', authenticate, isAdmin, matchValidation, handleValidationErrors, createMatch);
router.post('/multiple', authenticate, isAdmin, createMultipleMatches);
router.post('/generate-schedule', authenticate, isAdmin, generateMatchSchedule);
router.post('/generate-quarter-finals', authenticate, isAdmin, generateQuarterFinals);
router.post('/generate-semi-finals', authenticate, isAdmin, generateSemiFinals);
router.post('/generate-final', authenticate, isAdmin, generateFinal);
router.post('/generate-third-place', authenticate, isAdmin, generateThirdPlace);
router.post('/auto-fill-results', authenticate, isAdmin, autoFillMatchResults);
router.put('/:id/result', authenticate, isAdmin, updateMatchResult);

export default router;



