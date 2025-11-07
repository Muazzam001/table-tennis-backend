import express from 'express';
import { login, register, getCurrentUser, logout } from '../controllers/authController.js';
import { authenticate, isAdmin } from '../middlewares/auth.js';

const router = express.Router();

// Public routes
router.post('/login', login);
router.post('/logout', logout);

// Protected routes
router.get('/me', authenticate, getCurrentUser);

// Admin only routes
router.post('/register', authenticate, isAdmin, register);

export default router;

