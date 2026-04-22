import React, { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { Login } from './components/Auth/Login';
import { Register } from './components/Auth/Register';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { Dashboard } from './pages/Dashboard';
import { EditorPage } from './pages/EditorPage';

export const App: React.FC = () => {
  useEffect(() => {
    // Глобальная тема отключена: dark/light применяется только к CodeEditor.
    document.body.removeAttribute('data-theme');
  }, []);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<EditorPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

