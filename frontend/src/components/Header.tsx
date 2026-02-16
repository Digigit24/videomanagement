import { LogOut, Users } from 'lucide-react';
import { Button } from './ui/button';
import BucketSwitcher from './BucketSwitcher';
import { Link } from 'react-router-dom';

interface HeaderProps {
  user: string;
  onLogout: () => void;
}

export default function Header({ user, onLogout }: HeaderProps) {
  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-8">
            <Link to="/" className="text-xl font-bold text-gray-900 hover:text-gray-700">
              Video Manager
            </Link>
            <BucketSwitcher />
          </div>
          <div className="flex items-center gap-4">
            <Link to="/users">
              <Button variant="ghost" size="sm">
                <Users className="h-4 w-4 mr-2" />
                Users
              </Button>
            </Link>
            <span className="text-sm text-gray-600">{user}</span>
            <Button variant="ghost" size="sm" onClick={onLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
