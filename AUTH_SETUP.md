# Authentication Implementation Guide

## Overview

This project includes a complete JWT-based authentication system with:
- User registration and login
- Password hashing with bcrypt
- JWT token generation and verification
- Email verification
- Password reset functionality
- Profile management
- CORS-enabled API endpoints

## Backend Setup

### 1. Environment Variables

Add to your `backend/.env` file:

```bash
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:8000
```

**Important:** Change the `JWT_SECRET` to a strong, random string in production!

### 2. Database Model

The User model is already configured in `backend/models/database.models.js`:
- Passwords are automatically hashed using bcrypt before saving
- Includes fields: id, name, email, password_hash, role, is_active, last_login
- Password comparison method: `user.comparePassword(password)`

### 3. Authentication Routes

Located in `backend/routes/auth.routes.js`:

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/auth/register` | Register new user | No |
| POST | `/api/auth/login` | Login user | No |
| POST | `/api/auth/logout` | Logout user | Yes |
| GET | `/api/auth/me` | Get current user | Yes |
| PUT | `/api/auth/profile` | Update profile | Yes |
| POST | `/api/auth/change-password` | Change password | Yes |
| POST | `/api/auth/forgot-password` | Request password reset | No |
| POST | `/api/auth/reset-password` | Reset password with token | No |
| GET | `/api/auth/verify/:token` | Verify email | No |
| POST | `/api/auth/refresh-token` | Refresh JWT token | Yes |

### 4. Authentication Middleware

Located in `backend/middleware/auth.js`:

```javascript
import { authenticate, optionalAuth, requireAdmin } from './middleware/auth.js';

// Require authentication
app.get('/api/protected', authenticate, (req, res) => {
  // Access user via req.user
  res.json({ user: req.user });
});

// Optional authentication (user available if logged in, but not required)
app.get('/api/public', optionalAuth, (req, res) => {
  if (req.user) {
    res.json({ message: 'Hello ' + req.user.name });
  } else {
    res.json({ message: 'Hello guest' });
  }
});

// Require admin role
app.delete('/api/admin/user/:id', authenticate, requireAdmin, (req, res) => {
  // Only admins can access
});
```

## Frontend Setup

### 1. Environment Variables

Created in `frontend-react/.env.development`:

```bash
VITE_API_URL=http://localhost:8000
```

### 2. Axios Configuration

Located in `frontend-react/src/api/axios.ts`:
- Automatically adds JWT token to requests
- Handles 401 errors (expired tokens)
- Includes request/response interceptors

### 3. Auth API Client

Located in `frontend-react/src/api/auth.api.ts`:
- Type-safe API methods for all auth endpoints
- Uses axios instance with proper configuration

### 4. Auth Context

Located in `frontend-react/src/contexts/AuthContext.tsx`:

```typescript
import { useAuth } from './contexts/AuthContext';

function MyComponent() {
  const { user, login, logout, loading } = useAuth();
  
  if (loading) return <div>Loading...</div>;
  
  if (!user) {
    return <LoginForm />;
  }
  
  return (
    <div>
      <p>Welcome, {user.name}!</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

## Usage Examples

### Registration

```typescript
import { authAPI } from '../api/auth.api';

const handleRegister = async (data) => {
  try {
    const response = await authAPI.register({
      name: data.name,
      email: data.email,
      password: data.password
    });
    
    if (response.success) {
      console.log('Registration successful!');
      // Redirect to login or auto-login
    }
  } catch (error) {
    console.error('Registration failed:', error);
  }
};
```

### Login

```typescript
import { useAuth } from '../contexts/AuthContext';

function LoginForm() {
  const { login } = useAuth();
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await login(email, password, rememberMe);
    
    if (result.success) {
      // Redirect to dashboard
      navigate('/dashboard');
    } else {
      // Show error message
      setError(result.error);
    }
  };
  
  return <form onSubmit={handleSubmit}>...</form>;
}
```

### Protected Routes

```typescript
import { Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div>Loading...</div>;
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
}

// Usage in App.tsx
<Route path="/dashboard" element={
  <ProtectedRoute>
    <Dashboard />
  </ProtectedRoute>
} />
```

### Making Authenticated API Calls

```typescript
import axios from './api/axios';

// Axios automatically includes the JWT token
const fetchUserData = async () => {
  const response = await axios.get('/api/user/data');
  return response.data;
};
```

## Security Best Practices

1. **Environment Variables**
   - Never commit `.env` files to git
   - Use strong, random JWT_SECRET in production
   - Rotate secrets regularly

2. **CORS Configuration**
   - Only allow trusted origins
   - Update ALLOWED_ORIGINS for production domains

3. **Token Storage**
   - Tokens stored in localStorage (consider httpOnly cookies for enhanced security)
   - Tokens automatically cleared on logout or 401 errors

4. **Password Requirements**
   - Minimum 6 characters enforced in backend
   - Consider adding complexity requirements

5. **Rate Limiting**
   - Auth routes include rate limiting middleware
   - Prevents brute force attacks

## Testing

### Test Registration

```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"password123"}'
```

### Test Login

```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

### Test Protected Endpoint

```bash
TOKEN="your-jwt-token-here"

curl -X GET http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

## Troubleshooting

### CORS Errors
- Ensure `ALLOWED_ORIGINS` includes your frontend URL
- Check browser console for specific CORS error messages
- Verify credentials are enabled in CORS config

### 401 Unauthorized
- Check if token is being sent in Authorization header
- Verify token hasn't expired (default: 7 days)
- Ensure JWT_SECRET matches between token creation and verification

### Token Not Persisting
- Check localStorage in browser DevTools
- Ensure `withCredentials: true` in axios config
- Verify token is being saved after successful login

## Next Steps

1. **Email Service Integration**
   - Configure email verification
   - Set up password reset emails
   - Add email templates

2. **OAuth Integration**
   - Add Google OAuth (button already in LoginForm)
   - Add GitHub/Facebook OAuth

3. **Enhanced Security**
   - Implement refresh token rotation
   - Add device tracking
   - Implement 2FA (two-factor authentication)

4. **User Management**
   - Admin panel for user management
   - Role-based permissions
   - User activity logging
