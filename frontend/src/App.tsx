import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import Header from '@/components/Header';
import Login from '@/pages/Login';
// Registration removed - only admin can create members
import Dashboard from '@/pages/Dashboard';
import WorkspaceVideos from '@/pages/WorkspaceVideos';
import VideoDetail from '@/pages/VideoDetail';
import Users from '@/pages/Users';
import JoinInvite from '@/pages/JoinInvite';
import RecycleBin from '@/pages/RecycleBin';
import SchemaGenerator from '@/pages/SchemaGenerator';

import VideoReview from '@/pages/VideoReview';

function AppContent() {
  const { user, loading, login, logout } = useAuth();
  const location = useLocation();

  // Public routes - accessible without authentication
  const isPublicRoute = location.pathname.startsWith('/v/') || location.pathname === '/schema-generator';

  if (isPublicRoute) {
    return (
      <Routes>
        <Route path="/v/:videoId/review" element={<VideoReview />} />
        <Route path="/v/:videoId" element={<VideoReview />} />
        <Route path="/schema-generator" element={<SchemaGenerator />} />
      </Routes>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login onLogin={login} />} />
        <Route path="/invite/:code" element={<JoinInvite onLogin={login} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user.email} onLogout={logout} />
      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        <Routes key={location.pathname}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/workspace/:bucket" element={<WorkspaceVideos />} />
          <Route path="/workspace/:bucket/video/:id" element={<VideoDetail />} />
          <Route path="/video/:id" element={<VideoDetail />} />
          <Route path="/users" element={<Users />} />
          <Route path="/recycle-bin" element={<RecycleBin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
