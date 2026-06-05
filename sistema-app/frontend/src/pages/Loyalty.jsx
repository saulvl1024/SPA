import { useEffect, useState } from 'react';
import { api } from '../api.js';

const tierOf = p => p >= 3000 ? 'Platino' : p >= 1000 ? 'Oro' : 'Plata';
const tiers = [['🥈', 'Plata', '0 – 999 pts', '5% en productos'], ['🥇', 'Oro', '1,000 – 2,999 pts', '10% + regalo de cumpleaños'], ['💎', 'Platino', '3,000+ pts', '15% + prioridad en agenda']];

export default function Loyalty() {
  const [clients, setClients] = useState([]);
  useEffect(() => { api.get('/clients').then(setClients); }, []);
  const ranked = [...clients].sort((a, b) => b.points - a.points);

  return (
    <>
      <div className="top"><h1>Lealtad y membresías</h1></div>
      <div className="grid g3 mb">
        {tiers.map((t, i) => (
          <div key={i} className="card" style={{ textAlign: 'center', ...(i === 1 ? { border: '2px solid var(--gold)' } : {}) }}>
            <div style={{ fontSize: '2rem' }}>{t[0]}</div><h3 className="serif" style={{ fontSize: '1.4rem' }}>{t[1]}</h3>
            <p className="muted">{t[2]}</p><p style={{ marginTop: 8 }}>{t[3]}</p>
          </div>
        ))}
      </div>
      <div className="sec-title">Clientes por puntos</div>
      <div className="card scroll-x" style={{ padding: 0 }}>
        <table><thead><tr><th>Cliente</th><th>Nivel</th><th>Puntos</th></tr></thead><tbody>
          {ranked.map(c => <tr key={c.id}><td>{c.name}</td><td><span className="badge bg-gold">{tierOf(c.points)}</span></td><td>{c.points}</td></tr>)}
        </tbody></table>
      </div>
    </>
  );
}
