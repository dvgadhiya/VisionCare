import React from 'react';
import { RegisterForm } from '../components/RegisterForm';

export function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-4">
      <RegisterForm />
    </div>
  );
}
