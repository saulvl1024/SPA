import { useEffect, useRef, useState } from 'react';

/* Pestañas con indicador deslizante (el fondo activo se desliza, no salta).
   Uso:
     <Tabs tabs={[['buscar','Clientes'], ['embudo','Flujo']]} value={tab} onChange={setTab} />
   `tabs` es un arreglo de [clave, etiqueta]. */
export default function Tabs({ tabs, value, onChange }) {
  const wrapRef = useRef(null);
  const btnRefs = useRef({});
  const [pill, setPill] = useState({ left: 0, top: 0, width: 0, height: 0, ready: false });

  // Mide la posición de la pestaña activa y mueve el indicador debajo.
  // Usa offsetLeft/offsetTop (relativos al contenedor) para que el pill no se
  // desalinee cuando la barra de pestañas tiene scroll horizontal en móvil.
  const measure = () => {
    const el = btnRefs.current[value];
    if (!el) return;
    setPill({ left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight, ready: true });
  };

  useEffect(() => {
    measure();
    // Asegura que la pestaña activa quede visible en la barra con scroll (móvil)
    const el = btnRefs.current[value];
    el?.scrollIntoView?.({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    /* eslint-disable-next-line */
  }, [value, tabs.length]);
  useEffect(() => {
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    // Reactivo a fuentes que cargan tarde
    const t = setTimeout(measure, 60);
    return () => {
      window.removeEventListener('resize', onResize);
      clearTimeout(t);
    };
  }, []); // eslint-disable-line

  return (
    <div className="tabs tabs-slider" ref={wrapRef}>
      {pill.ready && (
        <span className="tab-pill" aria-hidden="true"
          style={{ transform: `translate(${pill.left}px, ${pill.top}px)`, width: pill.width, height: pill.height }} />
      )}
      {tabs.map(([k, l]) => (
        <button key={k} type="button" ref={el => { btnRefs.current[k] = el; }}
          className={'tab' + (value === k ? ' active' : '')}
          onClick={() => onChange(k)}>{l}</button>
      ))}
    </div>
  );
}
