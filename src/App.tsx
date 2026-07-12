import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import MaintenanceGate from './components/MaintenanceGate';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import ManageJobs from './pages/ManageJobs';
import JobDetails from './pages/JobDetails';
import Cart from './pages/Cart';
import Profile from './pages/Profile';
import Admin from './pages/Admin';
import Subscription from './pages/Subscription';
import Analytics from './pages/Analytics';
import { Loader2 } from 'lucide-react';

function PublicHome() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7]">
        <Loader2 className="w-8 h-8 text-[#8b2df2] animate-spin" />
      </div>
    );
  }

  if (user) {
    const dest = user.role === 'user' ? '/dashboard' : '/manage-jobs';
    return <Navigate to={dest} replace />;
  }

  return <LandingPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public landing — always accessible, even during maintenance */}
          <Route path="/" element={<PublicHome />} />

          {/* Everything authenticated is behind the maintenance gate */}
          <Route path="/subscribe" element={<ProtectedRoute><MaintenanceGate><Subscription /></MaintenanceGate></ProtectedRoute>} />

          <Route element={<ProtectedRoute><MaintenanceGate><Layout /></MaintenanceGate></ProtectedRoute>}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/job/:id" element={<JobDetails />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/manage-jobs" element={<ProtectedRoute allowedRoles={['superadmin', 'manager']}><ManageJobs /></ProtectedRoute>} />
            <Route path="/analytics" element={<ProtectedRoute allowedRoles={['superadmin', 'manager']}><Analytics /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute allowedRoles={['superadmin']}><Admin /></ProtectedRoute>} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}