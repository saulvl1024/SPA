import { createContext, useContext, useState } from 'react';
import { api, setToken, clearToken, getToken } from './api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const t = getToken();
    if (!t) return null;
    try { return JSON.parse(atob(t.split('.')[1])); } catch { return null; }
  });

  async function login(pin) {
    const { token, user } = await api.post('/auth/login', { pin });
    setToken(token);
    setUser(user);
  }
  function logout() { clearToken(); setUser(null); }

  return <AuthCtx.Provider value={{ user, login, logout }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
