import express from 'express';
import { body } from 'express-validator';
import {
  getAllPairingRules,
  getBuiltInPairingRules,
  getEffectivePairingRulesHandler,
  createPairingRule,
  deletePairingRule,
} from '../controllers/teamPairingRuleController.js';
import { authenticate, isAdmin } from '../middlewares/auth.js';
import { handleValidationErrors } from '../middlewares/validation.js';

const router = express.Router();

const createRuleValidation = [
  body('player_id').isInt().withMessage('player_id must be an integer'),
  body('related_player_id').isInt().withMessage('related_player_id must be an integer'),
  body('rule_type')
    .isIn(['must_pair', 'never_pair', 'prefer_pair'])
    .withMessage('rule_type must be must_pair, never_pair, or prefer_pair'),
  body('division')
    .isIn(['Expert', 'Intermediate', 'Women'])
    .withMessage('division must be Expert, Intermediate, or Women'),
  body('priority').optional().isInt({ min: 0, max: 100 }).withMessage('priority must be 0–100'),
];

router.get('/', authenticate, isAdmin, getAllPairingRules);
router.get('/built-in', authenticate, isAdmin, getBuiltInPairingRules);
router.get('/effective', authenticate, isAdmin, getEffectivePairingRulesHandler);
router.post('/', authenticate, isAdmin, createRuleValidation, handleValidationErrors, createPairingRule);
router.delete('/:id', authenticate, isAdmin, deletePairingRule);

export default router;
