import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { Login } from './components/Auth/Login';
import { Register } from './components/Auth/Register';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { EditorPage } from './pages/EditorPage';
import { Profile } from './pages/Profile';
import { Projects } from './pages/Projects';

export const App: React.FC = () => (
  <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route element={<ProtectedRoute />}>
      <Route path="/" element={<EditorPage />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/projects" element={<Projects />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

