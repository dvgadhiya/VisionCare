# Quick Start Guide - Authentication Setup

## 🚀 Get Started in 3 Steps

### Step 1: Backend Configuration

1. **Update environment variables** in `backend/.env`:
   ```bash
   JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
   JWT_EXPIRES_IN=7d
   ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:8000
   ```

2. **Restart the backend server**:
   ```bash
   cd backend
   npm install  # if needed
   npm start
   ```

### Step 2: Frontend Configuration

1. **Install dependencies** (if not already done):
   ```bash
   cd frontend-react
   npm install axios
   ```

2. **Verify `.env.development` exists** with:
   ```bash
   VITE_API_URL=http://localhost:8000
   ```

3. **Start the frontend**:
   ```bash
   npm run dev
   ```

### Step 3: Test Authentication

1. **Register a new user**:
   - Navigate to http://localhost:5173/register
   - Fill in the registration form
   - Submit

2. **Login**:
   - Navigate to http://localhost:5173/login
   - Use your credentials
   - You should be redirected to the dashboard

## 📋 What Was Implemented

### Backend (`/backend`)
- ✅ JWT authentication middleware (`middleware/auth.js`)
- ✅ Complete auth routes (`routes/auth.routes.js`)
- ✅ User model with password hashing (`models/database.models.js`)
- ✅ CORS configuration for React frontend (`app.js`)

### Frontend (`/frontend-react`)
- ✅ Axios configuration with interceptors (`src/api/axios.ts`)
- ✅ Auth API client (`src/api/auth.api.ts`)
- ✅ Updated AuthContext with proper types (`src/contexts/AuthContext.tsx`)
- ✅ Environment variables (`.env.development`)

## 🔐 Available Auth Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | Register new user |
| `/api/auth/login` | POST | Login user |
| `/api/auth/logout` | POST | Logout user |
| `/api/auth/me` | GET | Get current user |
| `/api/auth/profile` | PUT | Update profile |
| `/api/auth/change-password` | POST | Change password |

## 🧪 Quick Test

### Using the Frontend
1. Open http://localhost:5173/register
2. Register: name="Test User", email="test@example.com", password="password123"
3. Login with the same credentials
4. You should see your user info in the dashboard

### Using cURL
```bash
# Register
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"password123"}'

# Login
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

## 🐛 Common Issues

### Issue: "No token provided" error
**Solution**: Make sure you're logged in and the token is in localStorage. Check browser DevTools → Application → Local Storage.

### Issue: CORS error
**Solution**: Verify `ALLOWED_ORIGINS` in `backend/.env` includes `http://localhost:5173`

### Issue: 401 Unauthorized
**Solution**: Token might be expired. Try logging out and logging in again.

## 📚 More Information

For detailed documentation, see [AUTH_SETUP.md](./AUTH_SETUP.md)

## ✅ Next Steps

1. **Test the complete flow**: Register → Login → View Profile → Logout
2. **Customize**: Update the login/register forms to match your design
3. **Secure**: Change JWT_SECRET to a strong random value
4. **Deploy**: Update ALLOWED_ORIGINS for your production domain
