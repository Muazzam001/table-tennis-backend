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
import { authenticate, isAdmin } from '../middlewares/auth.js';
import { handleValidationErrors } from '../middlewares/validation.js';

const router = express.Router();

// Validation rules for creating a team
const teamValidation = [
  body('team_name').trim().notEmpty().withMessage('Team name is required'),
  body('player1_id').isInt().withMessage('Player 1 ID must be a valid integer'),
  body('player2_id').isInt().withMessage('Player 2 ID must be a valid integer')
];

// Public routes (read-only for all users)
router.get('/', getAllTeams);
router.get('/:id', getTeamById);

// Admin-only routes (CRUD operations)
router.post('/', authenticate, isAdmin, teamValidation, handleValidationErrors, createTeam);
router.put('/:id', authenticate, isAdmin, handleValidationErrors, updateTeam);
router.delete('/:id', authenticate, isAdmin, deleteTeam);
router.post('/generate', authenticate, isAdmin, generateRandomTeams);

export default router;

