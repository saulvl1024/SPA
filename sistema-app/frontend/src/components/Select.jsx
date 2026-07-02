import { useEffect, useRef, useState } from 'react';

/* Lista desplegable moderna (reemplazo del <select> nativo).
   Uso:
     <Select value={v} onChange={setV} options={[{value:'a',label:'A'}, ...]} placeholder="Elige..." />
   También acepta options como ['a','b'] (value === label).
   searchable: muestra un campo para escribir y filtrar las opciones (útil con listas largas). */
export default function Select({ value, onChange, options, children, placeholder = 'Selecciona...', disabled, style, searchable = false }) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);          // abrir hacia arriba si no hay espacio abajo
  const [query, setQuery] = useState('');
  const box = useRef(null);
  const searchRef = useRef(null);

  // Acepta dos formas: prop `options` (array) o hijos <option> (como un select nativo)
  let norm = [];
  if (Array.isArray(options)) {
    norm = options.map(o => (typeof o === 'object' ? o : { value: o, label: String(o) }));
  } else if (children) {
    const arr = Array.isArray(children) ? children.flat(Infinity) : [children];
    norm = arr.filter(c => c && c.props).map(c => ({
      value: c.props.value !== undefined ? c.props.value : '',
      label: typeof c.props.children === 'string' ? c.props.children : String(c.props.children ?? ''),
      disabled: c.props.disabled,
    }));
  }
  const current = norm.find(o => String(o.value) === String(value));
  // Filtra por texto cuando es searchable
  const shown = searchable && query.trim()
    ? norm.filter(o => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : norm;

  useEffect(() => {
    const onDoc = e => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, []);

  // Al abrir en modo búsqueda, enfoca el campo y limpia el filtro previo
  useEffect(() => { if (open && searchable) { setQuery(''); setTimeout(() => searchRef.current?.focus(), 20); } }, [open, searchable]);

  function toggle() {
    if (disabled) return;
    if (!open && box.current) {
      const r = box.current.getBoundingClientRect();
      setUp(window.innerHeight - r.bottom < 280 && r.top > 280); // poco espacio abajo → abre arriba
    }
    setOpen(o => !o);
  }
  function pick(o) { onChange(o.value); setOpen(false); }

  return (
    <div className={'sel' + (disabled ? ' sel-dis' : '')} ref={box} style={style}>
      <button type="button" className={'sel-trigger' + (open ? ' open' : '')} onClick={toggle} disabled={disabled}>
        <span className={current ? '' : 'sel-ph'}>{current ? current.label : placeholder}</span>
        <svg className="sel-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && (
        <div className={'sel-menu' + (up ? ' up' : '')} role="listbox">
          {searchable && (
            <input ref={searchRef} className="sel-search" placeholder="Escribe para buscar..." value={query}
              onChange={e => setQuery(e.target.value)} onClick={e => e.stopPropagation()} />
          )}
          {shown.map((o, i) => (
            <div key={String(o.value) + i} role="option" aria-selected={String(o.value) === String(value)}
              className={'sel-opt' + (String(o.value) === String(value) ? ' on' : '') + (o.disabled ? ' sel-opt-dis' : '')}
              onClick={() => !o.disabled && pick(o)}>
              <span>{o.label || <span className="sel-ph">—</span>}</span>
              {String(o.value) === String(value) && (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              )}
            </div>
          ))}
          {!shown.length && <div className="sel-empty">{query ? 'Sin coincidencias' : 'Sin opciones'}</div>}
        </div>
      )}
    </div>
  );
}
