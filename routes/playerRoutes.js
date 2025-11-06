import express from 'express';
import { body } from 'express-validator';
import {
  getAllPlayers,
  getPlayerById,
  createPlayer,
  updatePlayer,
  deletePlayer
} from '../controllers/playerController.js';
import { handleValidationErrors } from '../middlewares/validation.js';

const router = express.Router();

// Validation rules
const playerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('expertise_level').isIn(['Intermediate', 'Expert']).withMessage('Expertise level must be Intermediate or Expert')
];

// Routes
router.get('/', getAllPlayers);
router.get('/:id', getPlayerById);
router.post('/', playerValidation, handleValidationErrors, createPlayer);
router.put('/:id', handleValidationErrors, updatePlayer);
router.delete('/:id', deletePlayer);

export default router;

