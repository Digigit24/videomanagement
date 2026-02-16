import { useState, useEffect } from 'react';
import { User, UserRole } from '@/types';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const email = localStorage.getItem('user');
    const name = localStorage.getItem('userName');
    const id = localStorage.getItem('userId');
    const role = localStorage.getItem('userRole') as UserRole | null;
    const avatar_url = localStorage.getItem('userAvatar');

    if (token && email) {
      setUser({ id: id || undefined, email, name: name || undefined, role: role || undefined, avatar_url, token });
    }

    setLoading(false);
  }, []);

  const login = (email: string, token: string, name?: string, id?: string, role?: string, avatar_url?: string) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', email);
    if (name) localStorage.setItem('userName', name);
    if (id) localStorage.setItem('userId', id);
    if (role) localStorage.setItem('userRole', role);
    if (avatar_url) localStorage.setItem('userAvatar', avatar_url);
    setUser({ id, email, name, role: role as UserRole, avatar_url, token });
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('userName');
    localStorage.removeItem('userId');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userAvatar');
    setUser(null);
  };

  return { user, loading, login, logout };
}
