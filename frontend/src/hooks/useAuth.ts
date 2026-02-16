import { useState, useEffect } from 'react';
import { User } from '@/types';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const email = localStorage.getItem('user');
    const name = localStorage.getItem('userName');
    const id = localStorage.getItem('userId');

    if (token && email) {
      setUser({ id: id || undefined, email, name: name || undefined, token });
    }

    setLoading(false);
  }, []);

  const login = (email: string, token: string, name?: string, id?: string) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', email);
    if (name) localStorage.setItem('userName', name);
    if (id) localStorage.setItem('userId', id);
    setUser({ id, email, name, token });
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('userName');
    localStorage.removeItem('userId');
    setUser(null);
  };

  return { user, loading, login, logout };
}
