import { useEffect, useRef, useState } from 'react';
import { Modal, toast } from '../ui.jsx';

/* Escáner de código de barras por cámara.
   Usa la API nativa BarcodeDetector (Chrome/Edge/Android). Si no está disponible,
   avisa y sugiere el lector USB. onDetected(code) se llama al leer un código. */
export default function BarcodeScanner({ onDetected, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const [err, setErr] = useState('');
  const lastCode = useRef({ code: '', t: 0 });

  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!('BarcodeDetector' in window)) {
        setErr('Tu navegador no soporta escaneo por cámara. Usa un lector USB, o abre el sistema en Chrome/Edge en Android.');
        return;
      }
      try {
        const formats = await window.BarcodeDetector.getSupportedFormats?.() || [];
        const detector = new window.BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'].filter(f => !formats.length || formats.includes(f)),
        });
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) { v.srcObject = stream; await v.play(); }

        const scan = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes && codes.length) {
              const value = codes[0].rawValue;
              const now = Date.now();
              // Evita disparos repetidos del mismo código en menos de 1.5s
              if (value && (value !== lastCode.current.code || now - lastCode.current.t > 1500)) {
                lastCode.current = { code: value, t: now };
                onDetected(value);
              }
            }
          } catch { /* frame sin código, continúa */ }
          rafRef.current = requestAnimationFrame(scan);
        };
        rafRef.current = requestAnimationFrame(scan);
      } catch (e) {
        setErr(e.name === 'NotAllowedError' ? 'Permiso de cámara denegado. Habilítalo para escanear.' : 'No se pudo abrir la cámara.');
      }
    }
    start();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, [onDetected]);

  return (
    <Modal title="Escanear código de barras" onClose={onClose} width={440}>
      {err
        ? <div className="empty" style={{ padding: '20px 10px' }}>{err}</div>
        : (
          <>
            <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', background: '#000', aspectRatio: '4/3' }}>
              <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              {/* Guía visual de encuadre */}
              <div style={{ position: 'absolute', inset: '24% 12%', border: '2px solid rgba(255,255,255,.85)', borderRadius: 10, boxShadow: '0 0 0 9999px rgba(0,0,0,.25)' }} />
            </div>
            <p className="muted" style={{ fontSize: '.82rem', marginTop: 10, textAlign: 'center' }}>Apunta la cámara al código de barras del producto.</p>
          </>
        )}
      <div className="modal-actions"><button className="btn ghost" onClick={onClose}>Cerrar</button></div>
    </Modal>
  );
}
