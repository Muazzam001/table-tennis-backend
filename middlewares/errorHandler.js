import { isDuplicateKeyError } from '../utils/dbErrors.js';

// Helper function to sanitize error messages - remove database/table names
const sanitizeErrorMessage = (message) => {
  if (!message) return 'An error occurred';
  
  // Remove database names (e.g., "table_tennis_tournament")
  message = message.replace(/table_tennis_tournament/gi, 'database');
  
  // Remove table names (players, teams, matches, statistics, match_details)
  message = message.replace(/\b(players|teams|matches|statistics|match_details)\b/gi, 'table');
  
  // Remove common MySQL error patterns with table names
  message = message.replace(/Table\s+['"]?[\w_]+['"]?\s+doesn't exist/gi, 'Required table does not exist');
  message = message.replace(/Unknown column\s+['"]?[\w_]+['"]?\s+in/gi, 'Unknown column in');
  message = message.replace(/Table\s+['"]?[\w_]+['"]?\s+already exists/gi, 'Table already exists');
  
  // Remove specific error codes that might expose structure
  message = message.replace(/ER_\w+/g, '');
  message = message.replace(/\s+/g, ' ').trim();
  
  return message;
};

export const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Handle PostgreSQL enum / invalid value errors
  if (
    err.code === '22P02' ||
    err.code === '23514' ||
    err.code === 'WARN_DATA_TRUNCATED' ||
    err.code === 'ER_WARN_DATA_TRUNCATED' ||
    err.code === 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD'
  ) {
    return res.status(400).json({
      success: false,
      error: {
        message: sanitizeErrorMessage('Invalid division or enum value. Use Men or Women.'),
      },
    });
  }

  // Handle unique constraint violations
  if (isDuplicateKeyError(err)) {
    return res.status(400).json({
      success: false,
      error: {
        message: sanitizeErrorMessage('Duplicate entry. A record with this value already exists.'),
      },
    });
  }

  const statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  
  // Sanitize error message before sending to frontend
  message = sanitizeErrorMessage(message);

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
};




