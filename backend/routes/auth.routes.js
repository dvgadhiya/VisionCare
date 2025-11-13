import express from 'express';
import { User } from '../models/database.models.js';
import { 
  generateToken, 
  authenticate, 
  rateLimitLogin,
  resetLoginAttempts 
} from '../middleware/auth.middleware.js';
import crypto from 'crypto';

const router = express.Router();

// ==================== REGISTER ====================
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Validation Error',
        message: 'Email and password are required' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        error: 'Validation Error',
        message: 'Password must be at least 6 characters long' 
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email: email.toLowerCase() } });
    
    if (existingUser) {
      return res.status(409).json({ 
        error: 'Conflict',
        message: 'User with this email already exists' 
      });
    }

    // Create verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Create user
    const user = await User.create({
      email: email.toLowerCase(),
      password,
      name: name || null,
      verification_token: verificationToken,
      is_verified: false // Set to true if you don't want email verification
    });

    // Generate JWT token
    const token = generateToken(user);

    // Send response
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: user.toJSON(),
        token
      }
    });

    // TODO: Send verification email
    console.log(`[Auth] Verification link: /api/auth/verify/${verificationToken}`);

  } catch (error) {
    console.error('[Auth] Registration error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Registration failed' 
    });
  }
});

// ==================== LOGIN ====================
router.post('/login', rateLimitLogin, async (req, res) => {
  try {
    const { email, password, remember } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Validation Error',
        message: 'Email and password are required' 
      });
    }

    // Find user
    const user = await User.findOne({ 
      where: { email: email.toLowerCase() } 
    });

    if (!user) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Invalid email or password' 
      });
    }

    // Check if user is active
    if (!user.is_active) {
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'Account is disabled. Please contact support.' 
      });
    }

    // Verify password
    const isValidPassword = await user.comparePassword(password);
    
    if (!isValidPassword) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Invalid email or password' 
      });
    }

    // Reset rate limiting on successful login
    resetLoginAttempts(email);

    // Update last login
    await user.update({ last_login: new Date() });

    // Generate JWT token (longer expiry if remember me)
    const token = generateToken(user);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: user.toJSON(),
        token
      }
    });

  } catch (error) {
    console.error('[Auth] Login error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Login failed' 
    });
  }
});

// ==================== GET CURRENT USER ====================
router.get('/me', authenticate, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        user: req.user.toJSON()
      }
    });
  } catch (error) {
    console.error('[Auth] Get user error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Failed to get user data' 
    });
  }
});

// ==================== UPDATE PROFILE ====================
router.put('/profile', authenticate, async (req, res) => {
  try {
    const { name, email } = req.body;
    const updates = {};

    if (name !== undefined) {
      updates.name = name;
    }

    if (email !== undefined) {
      // Check if email is already taken
      const existingUser = await User.findOne({ 
        where: { 
          email: email.toLowerCase(),
          id: { [User.sequelize.Op.ne]: req.user.id }
        } 
      });

      if (existingUser) {
        return res.status(409).json({ 
          error: 'Conflict',
          message: 'Email is already in use' 
        });
      }

      updates.email = email.toLowerCase();
      updates.is_verified = false; // Require re-verification
    }

    await req.user.update(updates);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: req.user.toJSON()
      }
    });

  } catch (error) {
    console.error('[Auth] Update profile error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Failed to update profile' 
    });
  }
});

// ==================== CHANGE PASSWORD ====================
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Validation
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        error: 'Validation Error',
        message: 'Current password and new password are required' 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        error: 'Validation Error',
        message: 'New password must be at least 6 characters long' 
      });
    }

    // Verify current password
    const isValidPassword = await req.user.comparePassword(currentPassword);
    
    if (!isValidPassword) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Current password is incorrect' 
      });
    }

    // Update password
    await req.user.update({ password: newPassword });

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('[Auth] Change password error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Failed to change password' 
    });
  }
});

// ==================== FORGOT PASSWORD ====================
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        error: 'Validation Error',
        message: 'Email is required' 
      });
    }

    const user = await User.findOne({ 
      where: { email: email.toLowerCase() } 
    });

    // Don't reveal if user exists
    if (!user) {
      return res.json({
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent.'
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpires = new Date(Date.now() + 3600000); // 1 hour

    await user.update({
      reset_token: resetToken,
      reset_token_expires: resetTokenExpires
    });

    // TODO: Send password reset email
    console.log(`[Auth] Password reset link: /api/auth/reset-password/${resetToken}`);

    res.json({
      success: true,
      message: 'If an account exists with this email, a password reset link has been sent.'
    });

  } catch (error) {
    console.error('[Auth] Forgot password error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Failed to process request' 
    });
  }
});

// ==================== RESET PASSWORD ====================
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ 
        error: 'Validation Error',
        message: 'Password is required' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        error: 'Validation Error',
        message: 'Password must be at least 6 characters long' 
      });
    }

    // Find user with valid reset token
    const user = await User.findOne({
      where: {
        reset_token: token,
        reset_token_expires: { [User.sequelize.Op.gt]: new Date() }
      }
    });

    if (!user) {
      return res.status(400).json({ 
        error: 'Bad Request',
        message: 'Invalid or expired reset token' 
      });
    }

    // Update password and clear reset token
    await user.update({
      password,
      reset_token: null,
      reset_token_expires: null
    });

    res.json({
      success: true,
      message: 'Password reset successfully'
    });

  } catch (error) {
    console.error('[Auth] Reset password error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Failed to reset password' 
    });
  }
});

// ==================== VERIFY EMAIL ====================
router.get('/verify/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const user = await User.findOne({
      where: { verification_token: token }
    });

    if (!user) {
      return res.status(400).json({ 
        error: 'Bad Request',
        message: 'Invalid verification token' 
      });
    }

    await user.update({
      is_verified: true,
      verification_token: null
    });

    res.json({
      success: true,
      message: 'Email verified successfully'
    });

  } catch (error) {
    console.error('[Auth] Verify email error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Failed to verify email' 
    });
  }
});

// ==================== LOGOUT ====================
router.post('/logout', authenticate, async (req, res) => {
  try {
    // With JWT, logout is handled client-side by removing the token
    // You could implement token blacklisting here if needed
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('[Auth] Logout error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Logout failed' 
    });
  }
});

// ==================== REFRESH TOKEN ====================
router.post('/refresh', authenticate, async (req, res) => {
  try {
    // Generate new token
    const token = generateToken(req.user);

    res.json({
      success: true,
      data: {
        token
      }
    });
  } catch (error) {
    console.error('[Auth] Refresh token error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Failed to refresh token' 
    });
  }
});

export default router;
