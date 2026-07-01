import express from 'express';
import { body } from 'express-validator';
import {
  listDivisionSettings,
  getDivisionSetting,
  updateDivisionSetting,
} from '../controllers/divisionSettingsController.js';
import { authenticate, isAdmin } from '../middlewares/auth.js';
import { handleValidationErrors } from '../middlewares/validation.js';

const router = express.Router();

const formatValidation = [
  body('competition_format')
    .optional()
    .isIn(['doubles', 'singles'])
    .withMessage('competition_format must be doubles or singles'),
  body('tournament_format')
    .optional()
    .isIn(['groups', 'single-group', 'pools-2', 'tier-pyramid'])
    .withMessage('tournament_format must be a supported format'),
];

router.get('/', listDivisionSettings);
router.get('/:division', getDivisionSetting);
router.put(
  '/:division',
  authenticate,
  isAdmin,
  formatValidation,
  handleValidationErrors,
  updateDivisionSetting
);

export default router;
