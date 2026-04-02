import { useState, useEffect, useCallback, useRef } from 'react';
import { User, UserRole } from '@/types';

/** Decode a JWT payload without a library (base64url → JSON) */
function decodeJwtPayload(token: string): { exp?: number } | null {
  try {
    const base64 = token.split('.')[1];
    if (!base64) return null;
    const json = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Returns true if the token is expired or will expire within 60 seconds */
function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return false; // No exp claim — can't check
  return payload.exp * 1000 <= Date.now() + 60_000;
}

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('userName');
    localStorage.removeItem('userId');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userAvatar');
    setUser(null);
  }, []);

  // --- Token expiry check on load ---
  useEffect(() => {
    const token = localStorage.getItem('token');
    const email = localStorage.getItem('user');
    const name = localStorage.getItem('userName');
    const id = localStorage.getItem('userId');
    const role = localStorage.getItem('userRole') as UserRole | null;
    const avatar_url = localStorage.getItem('userAvatar');

    if (token && email) {
      // Check if token is already expired
      if (isTokenExpired(token)) {
        logout();
      } else {
        setUser({ id: id || undefined, email, name: name || undefined, role: role || undefined, avatar_url, token });
      }
    }

    setLoading(false);
  }, [logout]);

  // --- Periodic token expiry check (every 60s) ---
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      const token = localStorage.getItem('token');
      if (!token || isTokenExpired(token)) {
        logout();
        window.location.href = '/login';
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, [user, logout]);

  // --- Inactivity auto-logout ---
  useEffect(() => {
    if (!user) return;

    const resetTimer = () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      inactivityTimer.current = setTimeout(() => {
        logout();
        window.location.href = '/login';
      }, INACTIVITY_TIMEOUT_MS);
    };

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, resetTimer));
    resetTimer(); // Start the timer

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, [user, logout]);

  const login = (email: string, token: string, name?: string, id?: string, role?: string, avatar_url?: string) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', email);
    if (name) localStorage.setItem('userName', name);
    if (id) localStorage.setItem('userId', id);
    if (role) localStorage.setItem('userRole', role);
    if (avatar_url) localStorage.setItem('userAvatar', avatar_url);
    setUser({ id, email, name, role: role as UserRole, avatar_url, token });
  };

  return { user, loading, login, logout };
}
