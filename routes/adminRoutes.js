import express from 'express';
import { resetApplicationData } from '../controllers/adminController.js';
import { authenticate, isAdmin } from '../middlewares/auth.js';

const router = express.Router();

router.post('/reset', authenticate, isAdmin, resetApplicationData);

export default router;
