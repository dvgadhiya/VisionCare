import jwt from 'jsonwebtoken';
import { User } from '../models/database.models.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Generate JWT token
export const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

// Verify JWT token
export const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};

// Authentication middleware
export const authenticate = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'No token provided' 
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = verifyToken(token);
    
    if (!decoded) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Invalid or expired token' 
      });
    }

    // Get user from database
    const user = await User.findByPk(decoded.id);
    
    if (!user || !user.is_active) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'User not found or inactive' 
      });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    console.error('[Auth Middleware] Error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Authentication failed' 
    });
  }
};

// Optional authentication (doesn't fail if no token)
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = verifyToken(token);
      
      if (decoded) {
        const user = await User.findByPk(decoded.id);
        if (user && user.is_active) {
          req.user = user;
        }
      }
    }
    
    next();
  } catch (error) {
    // Continue without auth
    next();
  }
};

// Role-based authorization middleware
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Authentication required' 
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'Insufficient permissions' 
      });
    }

    next();
  };
};

// Rate limiting middleware (simple in-memory implementation)
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutes

export const rateLimitLogin = (req, res, next) => {
  const identifier = req.body.email || req.ip;
  const now = Date.now();
  
  if (!loginAttempts.has(identifier)) {
    loginAttempts.set(identifier, { count: 0, lastAttempt: now });
  }
  
  const attempts = loginAttempts.get(identifier);
  
  // Reset if lockout time has passed
  if (now - attempts.lastAttempt > LOCKOUT_TIME) {
    attempts.count = 0;
    attempts.lastAttempt = now;
  }
  
  // Check if locked out
  if (attempts.count >= MAX_ATTEMPTS) {
    const timeLeft = Math.ceil((LOCKOUT_TIME - (now - attempts.lastAttempt)) / 1000 / 60);
    return res.status(429).json({ 
      error: 'Too Many Requests',
      message: `Too many login attempts. Please try again in ${timeLeft} minutes.`
    });
  }
  
  // Increment attempt counter
  attempts.count++;
  attempts.lastAttempt = now;
  
  // Cleanup old entries every 100 requests
  if (loginAttempts.size > 1000) {
    const cutoff = now - LOCKOUT_TIME;
    for (const [key, value] of loginAttempts.entries()) {
      if (value.lastAttempt < cutoff) {
        loginAttempts.delete(key);
      }
    }
  }
  
  next();
};

// Reset login attempts (call on successful login)
export const resetLoginAttempts = (identifier) => {
  if (loginAttempts.has(identifier)) {
    loginAttempts.delete(identifier);
  }
};

export default {
  generateToken,
  verifyToken,
  authenticate,
  optionalAuth,
  authorize,
  rateLimitLogin,
  resetLoginAttempts
};
