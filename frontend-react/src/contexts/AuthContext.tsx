import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../api/auth.api';

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface RegisterResponse {
  success: boolean;
  error?: string;
  data?: {
    user: User;
    message: string;
  };
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<{ success: boolean; error?: string }>;
  register: (name: string, email: string, password: string) => Promise<RegisterResponse>;
  logout: () => Promise<void>;
  loading: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Check if user is logged in on mount
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('token');
      
      if (token) {
        try {
          // Verify token by fetching user profile
          const response = await authAPI.getProfile();
          if (response.success) {
            setUser(response.data);
          } else {
            // Token invalid, clear storage
            localStorage.removeItem('token');
            localStorage.removeItem('user');
          }
        } catch (error) {
          console.error('Failed to fetch user profile:', error);
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        }
      }
      
      setLoading(false);
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string, rememberMe: boolean = false) => {
    try {
      const response = await authAPI.login({ email, password, rememberMe });
      
      if (response.success) {
        const { user: userData, token } = response.data;
        
        setUser(userData);
        localStorage.setItem('user', JSON.stringify(userData));
        localStorage.setItem('token', token);
        
        return { success: true };
      } else {
        return { success: false, error: response.error || 'Login failed' };
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } }; message?: string };
      const errorMessage = err.response?.data?.error || err.message || 'Login failed';
      return { success: false, error: errorMessage };
    }
  };

  const register = async (name: string, email: string, password: string): Promise<RegisterResponse> => {
    try {
      const response = await authAPI.register({ name, email, password });
      
      if (response.success) {
        return { success: true, data: response.data };
      } else {
        return { success: false, error: response.error || 'Registration failed' };
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } }; message?: string };
      const errorMessage = err.response?.data?.error || err.message || 'Registration failed';
      return { success: false, error: errorMessage };
    }
  };

  const logout = async () => {
    try {
      await authAPI.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      localStorage.removeItem('user');
      localStorage.removeItem('token');
    }
  };

  const refreshUser = async () => {
    try {
      const response = await authAPI.getProfile();
      if (response.success) {
        setUser(response.data);
        localStorage.setItem('user', JSON.stringify(response.data));
      }
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loading, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
