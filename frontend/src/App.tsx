import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { Login } from './components/Auth/Login';
import { Register } from './components/Auth/Register';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { EditorPage } from './pages/EditorPage';

export const App: React.FC = () => (
  <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route element={<ProtectedRoute />}>
      <Route path="/" element={<EditorPage />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

