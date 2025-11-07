import jwt from 'jsonwebtoken';
import pool from '../utils/database.js';

const JWT_SECRET = process.env.JWT_SECRET;

// Middleware to verify JWT token
export const authenticate = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided. Access denied.'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    // Get user from database to ensure they still exist and are active
    const [users] = await pool.execute(
      'SELECT id, username, email, role, is_active FROM users WHERE id = ?',
      [decoded.id]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = users[0];

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // Attach user info to request object
    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role
    };

    next();
  } catch (error) {
    next(error);
  }
};

// Middleware to check if user is admin
export const isAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required. You do not have permission to perform this action.'
    });
  }

  next();
};

// Optional: Middleware to allow both authenticated users and public access
// Public routes don't need authentication, but if token is provided, user info is attached
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const [users] = await pool.execute(
          'SELECT id, username, email, role, is_active FROM users WHERE id = ? AND is_active = TRUE',
          [decoded.id]
        );

        if (users.length > 0) {
          req.user = {
            id: users[0].id,
            username: users[0].username,
            email: users[0].email,
            role: users[0].role
          };
        }
      } catch (error) {
        // Token invalid, but continue as public user
        // Don't attach req.user
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};

