import express from 'express';
import { body } from 'express-validator';
import {
  getAllTeams,
  getTeamById,
  createTeam,
  updateTeam,
  deleteTeam,
  deleteTeamsByDivision,
  generateRandomTeams,
  replaceTeamsForDivision,
} from '../controllers/teamController.js';
import { authenticate, isAdmin } from '../middlewares/auth.js';
import { handleValidationErrors } from '../middlewares/validation.js';

const router = express.Router();

const teamValidation = [
  body('team_name').trim().notEmpty().withMessage('Team name is required'),
  body('player1_id').isInt().withMessage('Player 1 ID must be a valid integer'),
  body('player2_id')
    .optional({ nullable: true })
    .isInt()
    .withMessage('Player 2 ID must be a valid integer when provided'),
];

const bulkTeamValidation = [
  body('teams').isArray({ min: 1 }).withMessage('teams must be a non-empty array'),
  body('teams.*.team_name').trim().notEmpty().withMessage('Team name is required'),
  body('teams.*.player1_id').isInt().withMessage('Player 1 ID must be a valid integer'),
  body('teams.*.player2_id')
    .optional({ nullable: true })
    .isInt()
    .withMessage('Player 2 ID must be a valid integer when provided'),
];

// Public routes (read-only for all users)
router.get('/', getAllTeams);
router.get('/:id', getTeamById);

// Admin-only routes (CRUD operations)
router.put(
  '/division/:division',
  authenticate,
  isAdmin,
  bulkTeamValidation,
  handleValidationErrors,
  replaceTeamsForDivision
);
router.post('/', authenticate, isAdmin, teamValidation, handleValidationErrors, createTeam);
router.put('/:id', authenticate, isAdmin, handleValidationErrors, updateTeam);
router.delete('/division/:division', authenticate, isAdmin, deleteTeamsByDivision);
router.delete('/:id', authenticate, isAdmin, deleteTeam);
router.post('/generate', authenticate, isAdmin, generateRandomTeams);

export default router;
