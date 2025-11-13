import React from 'react';
import { LoginForm } from '../components/LoginForm';

export function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-4">
      <LoginForm />
    </div>
  );
}
