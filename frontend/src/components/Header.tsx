import { LogOut, Users } from 'lucide-react';
import { Button } from './ui/button';
import { Link } from 'react-router-dom';

interface HeaderProps {
  user: string;
  onLogout: () => void;
}

export default function Header({ user, onLogout }: HeaderProps) {
  const userName = localStorage.getItem('userName') || user;
  const userRole = localStorage.getItem('userRole');
  const userAvatar = localStorage.getItem('userAvatar');
  const isAdmin = userRole === 'admin';

  return (
    <header className="bg-white border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-14">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-base font-bold text-gray-900 hover:text-gray-700 tracking-tight">
              ReviewFlow
            </Link>
            {userRole && (
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded capitalize">
                {userRole}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <Link to="/users">
                <Button variant="ghost" size="sm" className="text-gray-500 hover:text-gray-700 h-8 text-xs">
                  <Users className="h-3.5 w-3.5 mr-1.5" />
                  Team
                </Button>
              </Link>
            )}
            <div className="h-4 w-px bg-gray-200" />
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
              <span className="text-xs text-gray-500 hidden sm:block">{userName}</span>
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
