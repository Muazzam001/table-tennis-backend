import express from 'express';
import { body } from 'express-validator';
import {
  listLeagueSettings,
  getLeagueSetting,
  updateLeagueSetting,
} from '../controllers/leagueSettingsController.js';
import { authenticate, isAdmin } from '../middlewares/auth.js';
import { handleValidationErrors } from '../middlewares/validation.js';

const router = express.Router();

const formatValidation = [
  body('competition_format')
    .isIn(['doubles', 'singles'])
    .withMessage('competition_format must be doubles or singles'),
];

router.get('/', listLeagueSettings);
router.get('/:league', getLeagueSetting);
router.put(
  '/:league',
  authenticate,
  isAdmin,
  formatValidation,
  handleValidationErrors,
  updateLeagueSetting
);

export default router;
