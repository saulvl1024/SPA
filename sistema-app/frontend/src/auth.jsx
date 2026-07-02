import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { api, setToken, clearToken, getToken } from './api.js';

const AuthCtx = createContext(null);

// Minutos de inactividad antes de cerrar sesión automáticamente.
const IDLE_MINUTES = 300; // 5 horas

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const t = getToken();
    if (!t) return null;
    try { return JSON.parse(atob(t.split('.')[1])); } catch { return null; }
  });
  const timer = useRef(null);

  async function login(email, password) {
    const { token, user } = await api.post('/auth/login', { email, password });
    setToken(token);
    setUser(user);
  }
  function logout(reason) {
    clearToken();
    setUser(null);
    if (reason === 'idle') sessionStorage.setItem('seren_idle_logout', '1');
  }

  // Cierre de sesión por inactividad: cualquier actividad reinicia el contador.
  useEffect(() => {
    if (!user) return;
    const reset = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => logout('idle'), IDLE_MINUTES * 60 * 1000);
    };
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(e => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => { clearTimeout(timer.current); events.forEach(e => window.removeEventListener(e, reset)); };
  }, [user]); // eslint-disable-line

  return <AuthCtx.Provider value={{ user, login, logout }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
