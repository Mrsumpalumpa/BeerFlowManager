import { type ReactNode } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AdminProvider } from './contexts/AdminContext';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';

import PublicTapUI from './pages/PublicTapUI';


function ProtectedAdminRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, role } = useAuth();
  if (!isAuthenticated || role !== 'ADMIN') {
    return <Navigate to="/admin/login" replace />;
  }
  return <AdminProvider>{children}</AdminProvider>;
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<PublicTapUI />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route 
            path="/admin/*" 
            element={
              <ProtectedAdminRoute>
                <Routes>
                  <Route path="/" element={<AdminDashboard />} />
                </Routes>
              </ProtectedAdminRoute>
            } 
          />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
