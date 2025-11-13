import axios from './axios';

// Auth API endpoints
export const authAPI = {
  // Register new user
  register: async (data: { name: string; email: string; password: string }) => {
    const response = await axios.post('/api/auth/register', data);
    return response.data;
  },

  // Login user
  login: async (data: { email: string; password: string; rememberMe?: boolean }) => {
    const response = await axios.post('/api/auth/login', data);
    return response.data;
  },

  // Logout user
  logout: async () => {
    const response = await axios.post('/api/auth/logout');
    return response.data;
  },

  // Get current user profile
  getProfile: async () => {
    const response = await axios.get('/api/auth/me');
    return response.data;
  },

  // Update user profile
  updateProfile: async (data: { name?: string; email?: string }) => {
    const response = await axios.put('/api/auth/profile', data);
    return response.data;
  },

  // Change password
  changePassword: async (data: { currentPassword: string; newPassword: string }) => {
    const response = await axios.post('/api/auth/change-password', data);
    return response.data;
  },

  // Forgot password
  forgotPassword: async (data: { email: string }) => {
    const response = await axios.post('/api/auth/forgot-password', data);
    return response.data;
  },

  // Reset password
  resetPassword: async (data: { token: string; password: string }) => {
    const response = await axios.post('/api/auth/reset-password', data);
    return response.data;
  },

  // Verify email
  verifyEmail: async (token: string) => {
    const response = await axios.get(`/api/auth/verify/${token}`);
    return response.data;
  },

  // Refresh token
  refreshToken: async () => {
    const response = await axios.post('/api/auth/refresh-token');
    return response.data;
  },
};

export default authAPI;
