import express from 'express';
import { body } from 'express-validator';
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
  generateFinal
} from '../controllers/matchController.js';
import { handleValidationErrors } from '../middlewares/validation.js';

const router = express.Router();

// Validation rules
const matchValidation = [
  body('team1_id').isInt().withMessage('Team 1 ID must be a valid integer'),
  body('team2_id').isInt().withMessage('Team 2 ID must be a valid integer'),
  body('scheduled_date').isISO8601().withMessage('Scheduled date must be a valid ISO 8601 date'),
  body('venue').optional().trim(),
  body('round_type').optional().isIn(['Qualifying', 'Quarter Final', 'Semi Final', 'Final']),
  body('pool').optional().isIn(['A', 'B'])
];

// Routes
router.get('/', getAllMatches);
router.get('/round/:roundType', getMatchesByRound);
router.get('/standings', getTeamStandings);
router.get('/:id', getMatchById);
router.post('/', matchValidation, handleValidationErrors, createMatch);
router.post('/multiple', createMultipleMatches);
router.post('/generate-schedule', generateMatchSchedule);
router.post('/generate-quarter-finals', generateQuarterFinals);
router.post('/generate-semi-finals', generateSemiFinals);
router.post('/generate-final', generateFinal);
router.put('/:id/result', updateMatchResult);

export default router;

