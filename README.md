# Table Tennis Tournament - Backend API

A Node.js/Express REST API for managing table tennis tournaments, with MySQL database integration and JWT authentication.

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [API Endpoints](#api-endpoints)
- [Authentication](#authentication)
- [Database](#database)
- [Environment Variables](#environment-variables)
- [Development](#development)
- [Production Deployment](#production-deployment)
- [Troubleshooting](#troubleshooting)

## 🎯 Overview

This is the backend API for the Table Tennis Tournament Management System. It provides RESTful endpoints for managing players, teams, matches, statistics, and user authentication.

## ✨ Features

- **RESTful API** - Clean, consistent API design
- **Player Management** - Full CRUD operations for players
- **Team Management** - Create teams with validation (one Intermediate + one Expert)
- **Match Management** - Schedule matches, record results, generate rounds
- **Statistics** - Player and team statistics tracking
- **Authentication** - JWT-based authentication
- **Database Seeding** - Automated database setup and seeding
- **Error Handling** - Comprehensive error handling middleware
- **Validation** - Request validation using express-validator
- **CORS** - Configurable CORS support

## 🛠 Tech Stack

- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **MySQL2** - MySQL database driver
- **JWT** - JSON Web Tokens for authentication
- **bcryptjs** - Password hashing
- **express-validator** - Request validation
- **dotenv** - Environment variable management
- **CORS** - Cross-Origin Resource Sharing

## 📁 Project Structure

```
backend/
├── controllers/          # Request handlers
│   ├── authController.js
│   ├── playerController.js
│   ├── teamController.js
│   ├── matchController.js
│   ├── statisticsController.js
│   └── seedController.js
├── middlewares/          # Custom middlewares
│   ├── auth.js          # JWT authentication middleware
│   ├── errorHandler.js  # Global error handler
│   └── validation.js    # Request validation
├── routes/              # API routes
│   ├── authRoutes.js
│   ├── playerRoutes.js
│   ├── teamRoutes.js
│   ├── matchRoutes.js
│   ├── statisticsRoutes.js
│   └── seedRoutes.js
├── scripts/             # Utility scripts
│   └── createAdmin.js   # Create admin user
├── utils/               # Utility functions
│   └── database.js      # Database connection pool
├── logs/                # Application logs
├── server.js            # Entry point
└── package.json         # Dependencies and scripts
```

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher)
- MySQL Server (v8.0 or higher)
- npm or yarn

### Installation

1. **Navigate to backend directory:**
   ```bash
   cd backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up database:**
   ```bash
   # Run database schema
   mysql -u root -p < ../database/schema.sql
   
   # (Optional) Seed sample data
   mysql -u root -p < ../database/seed.sql
   ```

4. **Create environment file:**
   ```bash
   # Create .env file with your configuration
   ```

5. **Start development server:**
   ```bash
   npm run dev
   ```

The API will be available at `http://localhost:3000`

## 🔧 Environment Variables

Create a `.env` file in the `backend/` directory:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=table_tennis_tournament

# Server Configuration
PORT=3000
NODE_ENV=development

# CORS Configuration
CORS_ORIGIN=http://localhost:5173

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
JWT_EXPIRES_IN=7d

# Admin User (for initial setup)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change_this_password
```

**Security Note:** Never commit `.env` file to version control!

## 📡 API Endpoints

### Health Check

- **GET** `/api/health`
  - Returns API status
  - Response: `{ status: "OK", message: "..." }`

### Authentication

- **POST** `/api/auth/register`
  - Register new user
  - Body: `{ username, email, password }`

- **POST** `/api/auth/login`
  - Login user
  - Body: `{ username/email, password }`
  - Returns: JWT token

### Players

- **GET** `/api/players`
  - Get all active players
  - Returns: Array of players

- **GET** `/api/players/:id`
  - Get player by ID
  - Returns: Player object

- **POST** `/api/players`
  - Create new player
  - Body: `{ name, email, expertise_level }`
  - Returns: Created player

- **PUT** `/api/players/:id`
  - Update player
  - Body: `{ name?, email?, expertise_level?, is_active? }`
  - Returns: Success message

- **DELETE** `/api/players/:id`
  - Soft delete player (sets is_active to false)
  - Returns: Success message

### Teams

- **GET** `/api/teams`
  - Get all teams with player details
  - Returns: Array of teams

- **GET** `/api/teams/:id`
  - Get team by ID
  - Returns: Team object

- **POST** `/api/teams`
  - Create team manually
  - Body: `{ team_name, player1_id, player2_id }`
  - Validation: One Intermediate + one Expert required
  - Returns: Created team

- **PUT** `/api/teams/:id`
  - Update team
  - Body: `{ team_name?, player1_id?, player2_id? }`
  - Returns: Success message

- **DELETE** `/api/teams/:id`
  - Delete team
  - Returns: Success message

- **POST** `/api/teams/generate`
  - Generate random teams automatically
  - Pairs one Intermediate + one Expert per team
  - Returns: Generated teams

### Matches

- **GET** `/api/matches`
  - Get all matches
  - Returns: Array of matches

- **GET** `/api/matches/:id`
  - Get match by ID
  - Returns: Match object

- **GET** `/api/matches/round/:roundType`
  - Get matches by round type
  - Returns: Array of matches

- **POST** `/api/matches`
  - Create match
  - Body: `{ team1_id, team2_id, scheduled_date, venue?, round_type?, pool? }`
  - Returns: Created match

- **POST** `/api/matches/multiple`
  - Create multiple matches
  - Body: `{ matches: [...] }`
  - Returns: Created matches

- **PUT** `/api/matches/:id/result`
  - Update match result
  - Body: `{ score_team1?, score_team2?, winner_team_id?, status?, is_abandoned?, abandoned_reason? }`
  - Returns: Success message

- **GET** `/api/matches/standings`
  - Get team standings
  - Query params: `pool?`, `roundType?`
  - Returns: Standings with points

- **POST** `/api/matches/schedule/generate`
  - Generate match schedule
  - Body: `{ startDate, endDate?, venue?, daysBetweenRounds? }`
  - Returns: Generated schedule

- **POST** `/api/matches/quarter-finals/generate`
  - Generate quarter finals
  - Body: `{ startDate, venue? }`
  - Returns: Generated matches

- **POST** `/api/matches/semi-finals/generate`
  - Generate semi finals
  - Body: `{ startDate, venue? }`
  - Returns: Generated matches

- **POST** `/api/matches/final/generate`
  - Generate final match
  - Body: `{ startDate, venue? }`
  - Returns: Generated match

### Statistics

- **GET** `/api/statistics`
  - Get all statistics
  - Returns: Array of statistics

- **GET** `/api/statistics/player/:playerId`
  - Get player statistics
  - Returns: Player statistics

- **GET** `/api/statistics/team/:teamId`
  - Get team statistics
  - Returns: Team statistics

- **GET** `/api/statistics/dashboard`
  - Get dashboard statistics
  - Returns: Overview statistics

### Database Seeding

- **POST** `/api/seed/setup`
  - Set up database (create tables if missing)
  - Returns: Setup status

- **POST** `/api/seed/players`
  - Seed players from seed.sql
  - Returns: Seeded players

- **POST** `/api/seed/teams`
  - Generate and seed teams
  - Returns: Generated teams

- **POST** `/api/seed/matches`
  - Generate and seed matches
  - Body: `{ startDate, endDate?, venue? }`
  - Returns: Generated matches

- **POST** `/api/seed/all`
  - Seed everything (setup + players + teams + matches)
  - Body: `{ startDate, endDate?, venue? }`
  - Returns: Seeding status

## 🔐 Authentication

### JWT Authentication

The API uses JSON Web Tokens (JWT) for authentication.

### Protected Routes

Some routes require authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

### Creating Admin User

Use the script to create an admin user:

```bash
node scripts/createAdmin.js
```

Or use the API:

```bash
POST /api/auth/register
{
  "username": "admin",
  "email": "admin@example.com",
  "password": "secure_password"
}
```

## 🗄️ Database

### Connection

The API uses a connection pool for database operations (`utils/database.js`).

### Database Schema

See [Database README](../database/README.md) for schema details.

### Tables

- `players` - Player information
- `teams` - Team information
- `matches` - Match schedules and results
- `statistics` - Player and team statistics
- `users` - User accounts

## 💻 Development

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with auto-reload |
| `npm start` | Start production server |

### Development Server

The development server runs on port `3000` by default (configurable via `.env`).

Features:
- Auto-reload on file changes
- Error handling
- CORS enabled for development

### Code Structure

The application follows **MVC pattern**:

- **Models**: Database schema (in database/)
- **Views**: API responses (JSON)
- **Controllers**: Business logic (`controllers/`)
- **Routes**: Endpoint definitions (`routes/`)
- **Middlewares**: Request processing (`middlewares/`)

## 🚀 Production Deployment

### Quick Deployment

1. **Set environment variables** in `.env`
2. **Run pre-deployment checks:**
   ```bash
   npm run predeploy  # If script exists
   ```
3. **Start server:**
   ```bash
   npm start
   ```

### Using PM2 (Recommended)

1. **Install PM2 globally:**
   ```bash
   npm install -g pm2
   ```

2. **Start with PM2:**
   ```bash
   pm2 start server.js --name table-tennis-backend
   ```

3. **PM2 Commands:**
   ```bash
   pm2 list              # List processes
   pm2 logs              # View logs
   pm2 restart all       # Restart
   pm2 stop all          # Stop
   pm2 delete all        # Delete
   ```

### Using systemd (Linux)

Create `/etc/systemd/system/table-tennis-backend.service`:

```ini
[Unit]
Description=Table Tennis Tournament Backend
After=network.target mysql.service

[Service]
Type=simple
User=your_user
WorkingDirectory=/path/to/backend
Environment="NODE_ENV=production"
EnvironmentFile=/path/to/backend/.env
ExecStart=/usr/bin/node server.js
Restart=always

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl daemon-reload
sudo systemctl enable table-tennis-backend
sudo systemctl start table-tennis-backend
```

## 🐛 Troubleshooting

### Database Connection Errors

1. **Check MySQL is running:**
   ```bash
   mysql -u root -p
   ```

2. **Verify credentials in `.env`:**
   ```env
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your_password
   ```

3. **Test connection:**
   ```bash
   mysql -u root -p -e "SELECT 1"
   ```

### Port Already in Use

```bash
# Find process using port 3000
lsof -i :3000

# Kill process (Linux/Mac)
kill -9 <PID>

# Or change PORT in .env
```

### Module Not Found

```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### CORS Errors

1. **Check CORS_ORIGIN in `.env`:**
   ```env
   CORS_ORIGIN=http://localhost:5173
   ```

2. **Verify frontend URL matches**

### JWT Errors

1. **Check JWT_SECRET is set in `.env`**
2. **Verify token is included in Authorization header**
3. **Check token expiration**

## 📚 Additional Resources

- [Express.js Documentation](https://expressjs.com/)
- [MySQL2 Documentation](https://github.com/sidorares/node-mysql2)
- [JWT Documentation](https://jwt.io/)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)

## 🔒 Security Best Practices

1. **Never commit `.env` file**
2. **Use strong JWT_SECRET** (generate with `openssl rand -base64 32`)
3. **Use HTTPS in production**
4. **Validate all inputs**
5. **Use parameterized queries** (already implemented)
6. **Limit CORS origins**
7. **Keep dependencies updated**: `npm audit fix`

## 📝 License

Part of the Table Tennis Tournament Management System.

