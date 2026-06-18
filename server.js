import 'dotenv/config';
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
import leagueRoutes from './routes/leagueRoutes.js';
import teamPairingRuleRoutes from './routes/teamPairingRuleRoutes.js';

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
app.use('/api/leagues', leagueRoutes);
app.use('/api/team-pairing-rules', teamPairingRuleRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Table Tennis Tournament API is running' });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Export app for Vercel serverless functions
export default app;

// Start server only if not in Vercel environment
let server;

if (process.env.VERCEL !== '1') {
  const port = PORT || 3000;

  server = app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Stop the other process or change PORT in backend/.env`);
      process.exit(1);
    }
    throw err;
  });

  const shutdown = () => {
    if (!server) {
      process.exit(0);
      return;
    }
    server.close(() => process.exit(0));
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

