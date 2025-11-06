import express from 'express';
import { body } from 'express-validator';
import {
  getAllTeams,
  getTeamById,
  createTeam,
  updateTeam,
  deleteTeam,
  generateRandomTeams
} from '../controllers/teamController.js';
import { handleValidationErrors } from '../middlewares/validation.js';

const router = express.Router();

// Validation rules for creating a team
const teamValidation = [
  body('team_name').trim().notEmpty().withMessage('Team name is required'),
  body('player1_id').isInt().withMessage('Player 1 ID must be a valid integer'),
  body('player2_id').isInt().withMessage('Player 2 ID must be a valid integer')
];

// Routes
router.get('/', getAllTeams);                           // Get all teams
router.get('/:id', getTeamById);                        // Get team by ID
router.post('/', teamValidation, handleValidationErrors, createTeam);  // Create new team
router.put('/:id', handleValidationErrors, updateTeam); // Update team
router.delete('/:id', deleteTeam);                      // Delete team
router.post('/generate', generateRandomTeams);          // Generate random teams

export default router;

