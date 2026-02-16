import { LogOut, Users, Home } from 'lucide-react';
import { Button } from './ui/button';
import { Link, useLocation } from 'react-router-dom';
import NotificationBell from './NotificationBell';

interface HeaderProps {
  user: string;
  onLogout: () => void;
}

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: Home, roles: ['admin', 'video_editor', 'project_manager', 'social_media_manager', 'client', 'member'] },
  { path: '/users', label: 'Team', icon: Users, roles: ['admin'] },
];

export default function Header({ user, onLogout }: HeaderProps) {
  const userName = localStorage.getItem('userName') || user;
  const userRole = localStorage.getItem('userRole') || 'member';
  const userAvatar = localStorage.getItem('userAvatar');
  const location = useLocation();

  const ROLE_LABELS: Record<string, string> = {
    admin: 'Admin',
    video_editor: 'Video Editor',
    client: 'Client',
    member: 'Member',
    project_manager: 'Project Manager',
    social_media_manager: 'Social Media',
  };

  const ROLE_COLORS: Record<string, string> = {
    admin: 'bg-purple-100 text-purple-700',
    video_editor: 'bg-blue-100 text-blue-700',
    client: 'bg-emerald-100 text-emerald-700',
    member: 'bg-gray-100 text-gray-600',
    project_manager: 'bg-amber-100 text-amber-700',
    social_media_manager: 'bg-teal-100 text-teal-700',
  };

  const visibleNavItems = NAV_ITEMS.filter(item => item.roles.includes(userRole));

  return (
    <header className="bg-white border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-14">
          {/* Left: Logo + Nav */}
          <div className="flex items-center gap-1">
            <Link to="/" className="text-base font-bold text-gray-900 hover:text-gray-700 tracking-tight mr-4">
              ReviewFlow
            </Link>

            {/* Navigation links */}
            <nav className="hidden sm:flex items-center gap-0.5">
              {visibleNavItems.map((item) => {
                const isActive = location.pathname === item.path;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      isActive
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {/* Notification Bell */}
            <NotificationBell />

            <div className="h-4 w-px bg-gray-200" />

            {/* User info */}
            <div className="flex items-center gap-2">
              {userAvatar ? (
                <img
                  src={userAvatar}
                  alt={userName}
                  className="w-7 h-7 rounded-full object-cover border border-gray-200"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold">
                  {userName?.charAt(0).toUpperCase() || '?'}
                </div>
              )}
              <div className="hidden sm:flex flex-col">
                <span className="text-xs text-gray-700 font-medium leading-tight">{userName}</span>
                <span className={`text-[10px] px-1.5 py-0 rounded font-medium w-fit ${ROLE_COLORS[userRole] || 'bg-gray-100 text-gray-600'}`}>
                  {ROLE_LABELS[userRole] || userRole}
                </span>
              </div>
            </div>

            <Button variant="ghost" size="sm" onClick={onLogout} className="text-gray-400 hover:text-gray-600 h-8 px-2">
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
