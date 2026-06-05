import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth.jsx';

export default function Login() {
  const { login } = useAuth();
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');

  const submit = useCallback(async (value) => {
    try { setErr(''); await login(value); }
    catch (e) { setErr(e.message); setPin(''); }
  }, [login]);

  // Teclado físico: dígitos, Backspace y Enter
  useEffect(() => {
    const onKey = (e) => {
      if (e.key >= '0' && e.key <= '9') setPin(p => (p + e.key).slice(0, 6));
      else if (e.key === 'Backspace') setPin(p => p.slice(0, -1));
      else if (e.key === 'Enter') setPin(p => { if (p) submit(p); return p; });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [submit]);

  const press = (n) => setPin(p => (p + n).slice(0, 6));

  return (
    <div className="lock">
      <div className="lockbox">
        <div className="brand" style={{ padding: 0 }}>SÉRÈN</div>
        <p className="muted">Ingresa tu clave de acceso</p>
        <div className="dots">
          {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
            <span key={i} className={i < pin.length ? 'on' : ''} />
          ))}
        </div>
        {err && <p style={{ color: '#C16B6B', fontSize: '.85rem' }}>{err}</p>}
        <div className="keypad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => <button key={n} onClick={() => press(n)}>{n}</button>)}
          <button onClick={() => setPin(p => p.slice(0, -1))}>⌫</button>
          <button onClick={() => press(0)}>0</button>
          <button className="ok" onClick={() => submit(pin)}>✓</button>
        </div>
        <p className="hint">Puedes usar el teclado numérico (Enter para entrar).<br />Demo · Admin: 1111 · Empleadas: 2222 / 3333 / 4444</p>
      </div>
    </div>
  );
}
