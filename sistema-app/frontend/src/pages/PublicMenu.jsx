import { useEffect, useState } from 'react';
import { api } from '../api.js';

const money = n => '$' + Math.round(n || 0).toLocaleString('es-MX');

/* Menú público para clientes (sin login). Se abre vía sticker NFC / QR en la mesa.
   Acepta ?mesa=N en la URL solo para mostrar "Mesa N" como referencia. */
export default function PublicMenu() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [active, setActive] = useState('');   // categoría activa (chips)
  const mesa = new URLSearchParams(window.location.search).get('mesa');

  useEffect(() => {
    api.get('/public/menu')
      .then(d => { setData(d); setActive(d.categories[0]?.name || ''); })
      .catch(() => setErr('No se pudo cargar el menú.'));
  }, []);

  if (err) return <div className="menu-wrap"><div className="menu-empty">{err}</div></div>;
  if (!data) return <div className="menu-wrap"><div className="menu-empty">Cargando menú…</div></div>;

  const cat = data.categories.find(c => c.name === active) || data.categories[0];

  return (
    <div className="menu-wrap">
      {/* Encabezado */}
      <header className="menu-head">
        <div className="menu-brand">{data.businessName}</div>
        <div className="menu-sub">{mesa ? `Mesa ${mesa} · ` : ''}Menú</div>
      </header>

      {/* Chips de categorías (scroll horizontal) */}
      {data.categories.length > 1 && (
        <div className="menu-chips">
          {data.categories.map(c => (
            <button key={c.name} className={'menu-chip' + (c.name === active ? ' on' : '')} onClick={() => setActive(c.name)}>{c.name}</button>
          ))}
        </div>
      )}

      {/* Productos de la categoría activa */}
      <div className="menu-list">
        {cat?.items.map((p, i) => (
          <div key={p.id} className="menu-item" style={{ '--i': i }}>
            {p.image
              ? <img className="menu-item-img" src={p.image} alt="" loading="lazy" />
              : <span className="menu-item-img menu-item-noimg">{(p.name || '?').charAt(0).toUpperCase()}</span>}
            <div className="menu-item-body">
              <div className="menu-item-name">{p.name}</div>
            </div>
            <div className="menu-item-price">{money(p.price)}</div>
          </div>
        ))}
        {!cat?.items.length && <div className="menu-empty">Sin productos en esta sección.</div>}
      </div>

      <footer className="menu-foot">Para ordenar, llama a tu mesero.</footer>
    </div>
  );
}
