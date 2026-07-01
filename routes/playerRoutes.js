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
  body('email')
    .optional({ values: 'falsy' })
    .trim()
    .isEmail()
    .withMessage('Please enter a valid email address'),
  body('expertise_level').isIn(['Beginner', 'Intermediate', 'Expert']).withMessage('Expertise level must be Beginner, Intermediate, or Expert'),
  body('category').optional().isIn(['Men', 'Women']).withMessage('Category must be Men or Women'),
  body('pyramid_tier')
    .optional({ nullable: true })
    .custom((value) => value === null || value === '' || [1, 2, 3, '1', '2', '3'].includes(value))
    .withMessage('Pyramid tier must be 1, 2, or 3'),
];

// Public routes (read-only for all users)
router.get('/', getAllPlayers);
router.get('/:id', getPlayerById);

// Admin-only routes (CRUD operations)
router.post('/', authenticate, isAdmin, playerValidation, handleValidationErrors, createPlayer);
router.put('/:id', authenticate, isAdmin, playerValidation, handleValidationErrors, updatePlayer);
router.delete('/:id', authenticate, isAdmin, deletePlayer);

export default router;


