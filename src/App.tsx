import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import ManageJobs from './pages/ManageJobs';
import JobDetails from './pages/JobDetails';
import Cart from './pages/Cart';
import Profile from './pages/Profile';
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

// Temporary placeholder — replaced by the real pages in upcoming batches.
function ComingSoon({ title }: { title: string }) {
  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto">
      <h1 className="font-heading text-3xl font-bold text-zinc-900 mb-2">{title}</h1>
      <div className="bg-white rounded-2xl shadow-soft p-12 text-center">
        <p className="text-zinc-500">This section is coming soon — we're building it next.</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<PublicHome />} />

          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/job/:id" element={<JobDetails />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/manage-jobs" element={<ProtectedRoute allowedRoles={['superadmin', 'manager']}><ManageJobs /></ProtectedRoute>} />
            <Route path="/analytics" element={<ProtectedRoute allowedRoles={['superadmin', 'manager']}><ComingSoon title="Analytics" /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute allowedRoles={['superadmin']}><ComingSoon title="Admin Panel" /></ProtectedRoute>} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}