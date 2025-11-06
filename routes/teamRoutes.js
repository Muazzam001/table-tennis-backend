import express from 'express';
import { body } from 'express-validator';
import {
  getAllTeams,
  getTeamById,
  createTeam,
  generateRandomTeams
} from '../controllers/teamController.js';
import { handleValidationErrors } from '../middlewares/validation.js';

const router = express.Router();

// Validation rules
const teamValidation = [
  body('team_name').trim().notEmpty().withMessage('Team name is required'),
  body('player1_id').isInt().withMessage('Player 1 ID must be a valid integer'),
  body('player2_id').isInt().withMessage('Player 2 ID must be a valid integer')
];

// Routes
router.get('/', getAllTeams);
router.get('/:id', getTeamById);
router.post('/', teamValidation, handleValidationErrors, createTeam);
router.post('/generate', generateRandomTeams);

export default router;

