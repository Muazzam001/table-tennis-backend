import cors from 'cors';
import express from 'express';
import { errorHandler } from './middlewares/errorHandler.js';
import authRoutes from './routes/authRoutes.js';
import matchRoutes from './routes/matchRoutes.js';
import playerRoutes from './routes/playerRoutes.js';
import seedRoutes from './routes/seedRoutes.js';
import statisticsRoutes from './routes/statisticsRoutes.js';
import teamRoutes from './routes/teamRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import tournamentRoutes from './routes/tournamentRoutes.js';

const app = express();
const PORT = process.env.PORT;

// Middlewares
app.use(cors({
  origin: process.env.CORS_ORIGIN,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/statistics', statisticsRoutes);
app.use('/api/seed', seedRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/tournament', tournamentRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Table Tennis Tournament API is running' });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Export app for Vercel serverless functions
export default app;

// Start server only if not in Vercel environment
if (process.env.VERCEL !== '1') {
  const port = PORT;
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

