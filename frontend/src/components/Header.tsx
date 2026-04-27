import { useState } from 'react';
import { LogOut, Users, Home, Menu, X, Trash2, Moon, Sun } from 'lucide-react';
import { Button } from './ui/button';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import NotificationBell from './NotificationBell';
import { useTheme } from '@/contexts/ThemeContext';

interface HeaderProps {
  user: string;
  onLogout: () => void;
}

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: Home, roles: ['admin', 'video_editor', 'project_manager', 'social_media_manager', 'client', 'member', 'videographer', 'photo_editor'] },
  { path: '/users', label: 'Team', icon: Users, roles: ['admin'] },
  { path: '/recycle-bin', label: 'Recycle Bin', icon: Trash2, roles: ['admin'] },
];

export default function Header({ user, onLogout }: HeaderProps) {
  const userName = localStorage.getItem('userName') || user;
  const userRole = localStorage.getItem('userRole') || 'member';
  const userAvatar = localStorage.getItem('userAvatar');
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const ROLE_LABELS: Record<string, string> = {
    admin: 'Admin',
    video_editor: 'Video Editor',
    client: 'Client',
    member: 'Member',
    project_manager: 'Project Manager',
    social_media_manager: 'Social Media',
    videographer: 'Videographer',
    photo_editor: 'Photo Editor',
  };

  const ROLE_COLORS: Record<string, string> = {
    admin: 'bg-purple-100 text-purple-700',
    video_editor: 'bg-blue-100 text-blue-700',
    client: 'bg-emerald-100 text-emerald-700',
    member: 'bg-gray-100 text-gray-600',
    project_manager: 'bg-amber-100 text-amber-700',
    social_media_manager: 'bg-teal-100 text-teal-700',
    videographer: 'bg-indigo-100 text-indigo-700',
    photo_editor: 'bg-pink-100 text-pink-700',
  };

  const visibleNavItems = NAV_ITEMS.filter(item => item.roles.includes(userRole));

  return (
    <header className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 sticky top-0 z-[100]">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-14">
          {/* Left: Logo + Nav */}
          <div className="flex items-center gap-1">
            <button onClick={() => navigate('/')} className="text-base font-bold text-gray-900 dark:text-white hover:text-gray-700 dark:hover:text-gray-300 tracking-tight mr-2 sm:mr-4 transition-colors cursor-pointer">
              ReviewFlow
            </button>

            {/* Desktop Navigation */}
            <nav className="hidden sm:flex items-center gap-0.5">
              {visibleNavItems.map((item) => {
                const isActive = location.pathname === item.path;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 ${
                      isActive
                        ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800'
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
          <div className="flex items-center gap-1.5 sm:gap-2">
            <NotificationBell />

            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800 transition-colors"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <div className="hidden sm:block h-4 w-px bg-gray-200 dark:bg-gray-700" />

            {/* User info - desktop */}
            <div className="hidden sm:flex items-center gap-2">
              {userAvatar ? (
                <img
                  src={userAvatar}
                  alt={userName}
                  className="w-7 h-7 rounded-full object-cover border border-gray-200 dark:border-gray-700"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold">
                  {userName?.charAt(0).toUpperCase() || '?'}
                </div>
              )}
              <div className="flex flex-col">
                <span className="text-xs text-gray-700 dark:text-gray-300 font-medium leading-tight">{userName}</span>
                <span className={`text-[10px] px-1.5 py-0 rounded font-medium w-fit ${ROLE_COLORS[userRole] || 'bg-gray-100 text-gray-600'}`}>
                  {ROLE_LABELS[userRole] || userRole}
                </span>
              </div>
            </div>

            {/* User avatar - mobile only */}
            <div className="flex sm:hidden items-center">
              {userAvatar ? (
                <img
                  src={userAvatar}
                  alt={userName}
                  className="w-7 h-7 rounded-full object-cover border border-gray-200 dark:border-gray-700"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold">
                  {userName?.charAt(0).toUpperCase() || '?'}
                </div>
              )}
            </div>

            <Button variant="ghost" size="sm" onClick={() => setShowLogoutConfirm(true)} className="hidden sm:flex text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 h-8 px-2">
              <LogOut className="h-3.5 w-3.5" />
            </Button>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="sm:hidden p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="sm:hidden border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 animate-fade-in-down">
          <div className="px-3 py-3 space-y-1">
            {/* User Info */}
            <div className="flex items-center gap-3 px-3 py-2 mb-2">
              {userAvatar ? (
                <img src={userAvatar} alt={userName} className="w-9 h-9 rounded-full object-cover border border-gray-200 dark:border-gray-700" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold">
                  {userName?.charAt(0).toUpperCase() || '?'}
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{userName}</p>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${ROLE_COLORS[userRole] || 'bg-gray-100 text-gray-600'}`}>
                  {ROLE_LABELS[userRole] || userRole}
                </span>
              </div>
            </div>

            {/* Nav Items */}
            {visibleNavItems.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                    isActive
                      ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                      : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}

            {/* Logout */}
            <button
              onClick={() => { setMobileMenuOpen(false); setShowLogoutConfirm(true); }}
              className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 rounded-lg transition-all duration-200"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </div>
      )}
      {/* Logout Confirmation */}
      {showLogoutConfirm && (
        <>
          <div className="fixed inset-0 z-[200] bg-black/30 backdrop-blur-[2px]" onClick={() => setShowLogoutConfirm(false)} />
          <div className="fixed z-[201] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 w-[calc(100vw-2rem)] max-w-[340px] animate-scale-in">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">Sign out?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Are you sure you want to log out of your account?</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowLogoutConfirm(false)}>
                Cancel
              </Button>
              <Button variant="destructive" size="sm" className="flex-1" onClick={() => { setShowLogoutConfirm(false); onLogout(); }}>
                <LogOut className="h-3.5 w-3.5 mr-1.5" /> Sign Out
              </Button>
            </div>
          </div>
        </>
      )}
    </header>
  );
}
