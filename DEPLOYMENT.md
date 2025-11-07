# Vercel Deployment Guide

This guide will walk you through deploying your Table Tennis Tournament Backend API to Vercel.

## Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com) (free tier is sufficient)
2. **Vercel CLI** (optional, but recommended): Install globally
   ```bash
   npm install -g vercel
   ```
3. **Git Repository**: Your code should be in a Git repository (GitHub, GitLab, or Bitbucket)
4. **MySQL Database**: Your MySQL server should be accessible from the internet (not localhost)

## Step 1: Prepare Your Code

The following files have been created/modified for Vercel deployment:

- ✅ `vercel.json` - Vercel configuration file
- ✅ `server.js` - Modified to export Express app for serverless functions

## Step 2: Configure Environment Variables

### Option A: Using Vercel Dashboard (Recommended for first deployment)

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Create a new project or select your existing project
3. Navigate to **Settings** → **Environment Variables**
4. Add the following environment variables:

```env
# Database Configuration
DB_HOST=your_mysql_host_address
DB_PORT=3306
DB_USER=your_mysql_username
DB_PASS=your_mysql_password
DB_NAME=your_database_name

# Server Configuration
PORT=3000
NODE_ENV=production

# CORS Configuration (Update with your frontend URL)
CORS_ORIGIN=https://your-frontend-domain.vercel.app

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
JWT_EXPIRES_IN=7d

# Admin User (for initial setup)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change_this_password
```

**Important Notes:**
- Replace `your_mysql_host_address` with your actual MySQL server hostname/IP
- Replace `CORS_ORIGIN` with your frontend URL (or use `*` for testing, but restrict in production)
- Generate a strong `JWT_SECRET` using: `openssl rand -base64 32`
- Set environment variables for all environments (Production, Preview, Development)

### Option B: Using Vercel CLI

Create a `.env.local` file (for local testing) and set environment variables via CLI:

```bash
vercel env add DB_HOST
vercel env add DB_USER
vercel env add DB_PASS
vercel env add DB_NAME
vercel env add CORS_ORIGIN
vercel env add JWT_SECRET
# ... add all other variables
```

## Step 3: Deploy to Vercel

### Method 1: Deploy via Vercel Dashboard (Easiest)

1. **Connect Your Repository:**
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Click **Add New Project**
   - Import your Git repository (GitHub/GitLab/Bitbucket)
   - Select the repository containing your backend code

2. **Configure Project:**
   - **Framework Preset**: Other (or Node.js)
   - **Root Directory**: `backend` (if your backend is in a subdirectory)
   - **Build Command**: Leave empty (or `npm install`)
   - **Output Directory**: Leave empty
   - **Install Command**: `npm install`

3. **Deploy:**
   - Click **Deploy**
   - Wait for deployment to complete
   - Your API will be available at `https://your-project-name.vercel.app`

### Method 2: Deploy via Vercel CLI

1. **Navigate to backend directory:**
   ```bash
   cd backend
   ```

2. **Login to Vercel:**
   ```bash
   vercel login
   ```

3. **Deploy:**
   ```bash
   vercel
   ```
   
   Follow the prompts:
   - Link to existing project? **No** (for first deployment)
   - Project name: Enter your project name
   - Directory: `./` (current directory)
   - Override settings? **No**

4. **Deploy to Production:**
   ```bash
   vercel --prod
   ```

## Step 4: Verify Deployment

1. **Check Health Endpoint:**
   ```bash
   curl https://your-project-name.vercel.app/api/health
   ```
   
   Expected response:
   ```json
   {
     "status": "OK",
     "message": "Table Tennis Tournament API is running"
   }
   ```

2. **Test Database Connection:**
   - The database connection will be tested automatically when the server starts
   - Check Vercel logs: **Deployments** → **Your Deployment** → **Functions** → **View Function Logs**

## Step 5: Configure MySQL Server for Remote Access

Since your MySQL is on a separate server, ensure:

1. **MySQL Server Allows Remote Connections:**
   - Edit MySQL configuration file (`my.cnf` or `my.ini`)
   - Set `bind-address = 0.0.0.0` (or comment it out)
   - Restart MySQL service

2. **Create Remote User (if needed):**
   ```sql
   CREATE USER 'your_username'@'%' IDENTIFIED BY 'your_password';
   GRANT ALL PRIVILEGES ON your_database.* TO 'your_username'@'%';
   FLUSH PRIVILEGES;
   ```

3. **Firewall Configuration:**
   - Allow inbound connections on MySQL port (default: 3306)
   - Configure firewall rules on your MySQL server

4. **Security Best Practices:**
   - Use strong passwords
   - Limit user privileges (don't use root)
   - Consider using SSL/TLS for MySQL connections
   - Whitelist Vercel IPs if possible (though Vercel uses dynamic IPs)

## Step 6: Update Frontend Configuration

Update your frontend to use the Vercel backend URL:

```javascript
// Example: Update API base URL
const API_BASE_URL = 'https://your-project-name.vercel.app/api';
```

## Troubleshooting

### Database Connection Errors

1. **Check Environment Variables:**
   - Verify all database variables are set correctly in Vercel dashboard
   - Ensure `DB_HOST` is the public IP/hostname, not `localhost`

2. **Check MySQL Server:**
   - Verify MySQL is running and accessible
   - Test connection from your local machine:
     ```bash
     mysql -h your_mysql_host -u your_username -p
     ```

3. **Check Vercel Logs:**
   - Go to Vercel Dashboard → Your Project → Deployments → View Function Logs
   - Look for database connection error messages

### CORS Errors

1. **Update CORS_ORIGIN:**
   - Set `CORS_ORIGIN` to your frontend URL in Vercel environment variables
   - For multiple origins, you may need to update `server.js` CORS configuration

2. **Check Frontend URL:**
   - Ensure frontend is making requests to the correct Vercel URL

### Function Timeout

Vercel free tier has a 10-second timeout for serverless functions. If your database queries are slow:

1. Optimize database queries
2. Add database indexes
3. Consider upgrading to Vercel Pro (60-second timeout)

### Environment Variables Not Loading

1. **Redeploy after adding variables:**
   - Environment variables require a new deployment to take effect
   - Go to Deployments → Redeploy

2. **Check variable names:**
   - Ensure variable names match exactly (case-sensitive)

## Vercel Configuration Details

The `vercel.json` file configures:

- **Builds**: Uses `@vercel/node` to build your Express app
- **Routes**: Routes all requests to `server.js`
- **Environment**: Sets `NODE_ENV=production`

## Continuous Deployment

Once connected to Git:

- **Automatic Deployments**: Every push to main/master branch deploys to production
- **Preview Deployments**: Every pull request gets a preview deployment URL
- **Rollback**: Easy rollback to previous deployments from dashboard

## Monitoring

1. **Function Logs:**
   - View real-time logs in Vercel Dashboard
   - Monitor errors and performance

2. **Analytics:**
   - Enable Vercel Analytics for API usage metrics
   - Monitor function invocations and response times

## Security Checklist

- [ ] Strong `JWT_SECRET` generated
- [ ] Database credentials are secure
- [ ] `CORS_ORIGIN` is restricted (not `*`)
- [ ] MySQL user has minimal required privileges
- [ ] MySQL server allows connections only from trusted sources
- [ ] Environment variables are set in Vercel (not in code)
- [ ] `.env` file is in `.gitignore` (already done)

## Next Steps

1. Test all API endpoints
2. Set up monitoring and alerts
3. Configure custom domain (optional)
4. Set up CI/CD pipeline
5. Enable Vercel Analytics

## Support

- [Vercel Documentation](https://vercel.com/docs)
- [Vercel Community](https://github.com/vercel/vercel/discussions)
- Check deployment logs in Vercel Dashboard for specific errors

