import express from 'express';
import { body } from 'express-validator';
import {
  getAllPlayers,
  getPlayerById,
  createPlayer,
  updatePlayer,
  deletePlayer
} from '../controllers/playerController.js';
import { authenticate, isAdmin } from '../middlewares/auth.js';
import { handleValidationErrors } from '../middlewares/validation.js';

const router = express.Router();

// Validation rules
const playerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('expertise_level').isIn(['Intermediate', 'Expert']).withMessage('Expertise level must be Intermediate or Expert'),
  body('category').optional().isIn(['Men', 'Women']).withMessage('Category must be Men or Women'),
];

// Public routes (read-only for all users)
router.get('/', getAllPlayers);
router.get('/:id', getPlayerById);

// Admin-only routes (CRUD operations)
router.post('/', authenticate, isAdmin, playerValidation, handleValidationErrors, createPlayer);
router.put('/:id', authenticate, isAdmin, handleValidationErrors, updatePlayer);
router.delete('/:id', authenticate, isAdmin, deletePlayer);

export default router;


