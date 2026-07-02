import { useState } from 'react';
import { useAuth } from '../auth.jsx';
import { businessName } from '../permissions.js';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const idle = sessionStorage.getItem('seren_idle_logout');
  if (idle) sessionStorage.removeItem('seren_idle_logout');

  async function submit(e) {
    e?.preventDefault();
    if (!email || !password) return setErr('Ingresa tu correo y contraseña');
    setBusy(true); setErr('');
    try { await login(email.trim(), password); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <div className="lock">
      <form className="lockbox lockbox-in" onSubmit={submit} style={{ width: 420, maxWidth: '92vw', padding: '40px 36px' }}>
        <div className="brand" style={{ padding: 0, fontSize: '2.2rem' }}>{businessName()}</div>
        <p className="muted" style={{ marginBottom: 22, fontSize: '1.05rem' }}>Inicia sesión en el sistema</p>
        {idle && (
          <p className="login-note" style={{ color: 'var(--warn)', fontSize: '.85rem', marginBottom: 12 }}>
            Tu sesión se cerró por inactividad. Vuelve a iniciar sesión.
          </p>
        )}

        <div className="field" style={{ textAlign: 'left', width: '100%' }}>
          <label>Correo</label>
          <input type="email" autoFocus value={email} onChange={e => setEmail(e.target.value)} placeholder="tucorreo@negocio.com" autoComplete="username" style={{ fontSize: '1.05rem', padding: '12px 14px' }} />
        </div>
        <div className="field" style={{ textAlign: 'left', width: '100%' }}>
          <label>Contraseña</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" style={{ fontSize: '1.05rem', padding: '12px 14px' }} />
        </div>

        {err && <p className="login-note" style={{ color: '#C16B6B', fontSize: '.9rem', marginBottom: 8 }}>{err}</p>}

        <button className="btn" type="submit" disabled={busy} style={{ width: '100%', justifyContent: 'center', fontSize: '1.05rem', padding: '13px' }}>
          {busy ? <><span className="spinner" /> Entrando…</> : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
