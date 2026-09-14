'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Cliente = { id: string; nombre: string };
type Bullet = { id: string; negrita: string; texto: string };

function crearBullet(negrita = '', texto = ''): Bullet {
  return { id: Math.random().toString(36).slice(2), negrita, texto };
}

export default function PlacasPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState('');
  const [nombreCliente, setNombreCliente] = useState('');
  const [tagline, setTagline] = useState('¡HACÉ QUE TU NEGOCIO VENDA MÁS!');
  const [titulo, setTitulo] = useState('CONVERTITE EN PUNTO TROYA');
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));

  const [beneficios, setBeneficios] = useState<Bullet[]>([
    crearBullet('Máximo descuento:', '33% fijo'),
    crearBullet('Visibilidad:', 'destacado en web y redes'),
    crearBullet('Exclusividad zonal:', 'único en la zona'),
    crearBullet('Material POP:', 'merchandising y accesorios de MKT'),
    crearBullet('Programa de recompensas:', 'premios por su compra, canjeables'),
  ]);

  const [requisitos, setRequisitos] = useState<Bullet[]>([
    crearBullet('Inversión inicial:', ''),
    crearBullet('Volumen trimestral:', 'compra mínima sostenida'),
    crearBullet('Exhibición en local:', 'productos y marca visibles'),
  ]);

  const [generando, setGenerando] = useState(false);
  const placaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function cargar() {
      const { data } = await supabase.from('clientes').select('id, nombre').order('nombre');
      setClientes(data ?? []);
    }
    cargar();
  }, []);

  function seleccionarCliente(id: string) {
    setClienteId(id);
    const c = clientes.find((cl) => cl.id === id);
    if (c) setNombreCliente(c.nombre);
  }

  function actualizarBullet(lista: 'beneficios' | 'requisitos', id: string, campo: 'negrita' | 'texto', valor: string) {
    const setter = lista === 'beneficios' ? setBeneficios : setRequisitos;
    setter((prev) => prev.map((b) => (b.id === id ? { ...b, [campo]: valor } : b)));
  }

  function agregarBullet(lista: 'beneficios' | 'requisitos') {
    const setter = lista === 'beneficios' ? setBeneficios : setRequisitos;
    setter((prev) => [...prev, crearBullet()]);
  }

  function quitarBullet(lista: 'beneficios' | 'requisitos', id: string) {
    const setter = lista === 'beneficios' ? setBeneficios : setRequisitos;
    setter((prev) => prev.filter((b) => b.id !== id));
  }

  async function descargarPlaca() {
    if (!placaRef.current) return;
    setGenerando(true);
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(placaRef.current, { pixelRatio: 2, cacheBust: true });
      const link = document.createElement('a');
      link.download = `propuesta-${nombreCliente || 'punto-troya'}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      alert('Error al generar la imagen. Probá de nuevo.');
    } finally {
      setGenerando(false);
    }
  }

  const fechaFormateada = fecha ? new Date(fecha + 'T00:00:00').toLocaleDateString('es-AR') : '';

  return (
    <div>
      <div className="troya-header">
        <div>
          <h1>Generador de Placas</h1>
          <p className="troya-subtitulo">Todo es editable: textos, beneficios, requisitos y fecha</p>
        </div>
      </div>

      {/* FORMULARIO */}
      <div className="troya-panel" style={{ marginBottom: 20 }}>
        <div className="troya-panel-body" style={{ borderTop: 'none', paddingTop: 16 }}>
          <div className="troya-form">
            <select className="troya-input" value={clienteId} onChange={(e) => seleccionarCliente(e.target.value)}>
              <option value="">Elegir cliente existente (opcional)...</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
            <input className="troya-input" placeholder="Nombre a mostrar" value={nombreCliente} onChange={(e) => setNombreCliente(e.target.value)} />
            <input className="troya-input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>

          <div className="troya-form" style={{ marginTop: 4 }}>
            <input className="troya-input" style={{ flex: '1 1 100%' }} placeholder="Franja roja (tagline)" value={tagline} onChange={(e) => setTagline(e.target.value)} />
            <input className="troya-input" style={{ flex: '1 1 100%' }} placeholder="Título principal" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </div>

          <ListaEditable titulo="Beneficios" items={beneficios} lista="beneficios" onCambiar={actualizarBullet} onAgregar={agregarBullet} onQuitar={quitarBullet} />
          <ListaEditable titulo="Requisitos" items={requisitos} lista="requisitos" onCambiar={actualizarBullet} onAgregar={agregarBullet} onQuitar={quitarBullet} />
        </div>
      </div>

      <button className="troya-btn" onClick={descargarPlaca} disabled={generando || !nombreCliente} style={{ marginBottom: 24 }}>
        {generando ? 'Generando...' : 'Descargar placa (PNG)'}
      </button>

      {/* PREVIEW / PLACA A EXPORTAR */}
      <div style={{ overflowX: 'auto' }}>
        <div ref={placaRef} style={{ width: 900, height: 1125, position: 'relative', fontFamily: 'var(--font-body)', overflow: 'hidden', background: '#1C1512' }}>
          {/* Foto de fondo como <img> real (necesario para que html-to-image la incluya en la descarga) */}
          <img
            src="/placas/fondo-placa.jpg"
            alt=""
            crossOrigin="anonymous"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 30%' }}
          />

          {/* velo oscuro pareja sobre toda la foto */}
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,7,6,0.45)' }} />

          {/* llama decorativa esquina inferior derecha */}
          <img
            src="/logo/isotipo_llama_naranja.png"
            alt=""
            crossOrigin="anonymous"
            style={{ position: 'absolute', bottom: -20, right: -30, width: 190, opacity: 0.9 }}
          />

          {/* PANEL DE CONTENIDO (ordena y da legibilidad) */}
          <div
            style={{
              position: 'absolute',
              top: 60,
              left: 40,
              right: 40,
              background: 'rgba(12,9,7,0.72)',
              borderRadius: 22,
              padding: '34px 36px',
            }}
          >
            {/* Nombre + tagline */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
              <div style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', padding: '9px 20px', borderRadius: 8 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: '#fff' }}>
                  {nombreCliente || 'NOMBRE DEL CLIENTE'}
                </span>
              </div>
              <div style={{ background: '#DA231F', padding: '9px 20px', borderRadius: 8 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: '#fff' }}>
                  {tagline}
                </span>
              </div>
            </div>

            {/* Título */}
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 34, fontWeight: 700, color: '#fff', margin: '0 0 30px', lineHeight: 1.15 }}>
              {titulo}
            </h1>

            {/* Dos columnas */}
            <div style={{ display: 'flex', gap: 28 }}>
              <ColumnaPlaca icono={<IconBeneficios />} titulo="BENEFICIOS" items={beneficios} />
              <div style={{ width: 1, background: 'rgba(255,255,255,0.2)' }} />
              <ColumnaPlaca icono={<IconRequisitos />} titulo="REQUISITOS" items={requisitos} />
            </div>
          </div>

          {/* Fecha */}
          <div style={{ position: 'absolute', left: 40, bottom: 78, background: '#DA231F', padding: '7px 16px', borderRadius: 5 }}>
            <span style={{ color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-display)' }}>{fechaFormateada}</span>
          </div>

          {/* Logo TROYA */}
          <div style={{ position: 'absolute', bottom: 28, left: 0, right: 0, textAlign: 'center' }}>
            <img src="/logo/logo_troya_blanco_transparente.png" alt="Troya" crossOrigin="anonymous" style={{ height: 30 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ColumnaPlaca({ icono, titulo, items }: { icono: React.ReactNode; titulo: string; items: Bullet[] }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 16 }}>
        <div style={{ color: '#EB6726', width: 26, height: 26, flexShrink: 0 }}>{icono}</div>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: '#fff' }}>{titulo}</span>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 11 }}>
        {items.filter((b) => b.negrita || b.texto).map((b) => (
          <li key={b.id} style={{ display: 'flex', gap: 7, fontSize: 13.5, color: '#F0EAE4', lineHeight: 1.4 }}>
            <span style={{ marginTop: 1 }}>•</span>
            <span>
              {b.negrita && <strong style={{ color: '#fff' }}>{b.negrita} </strong>}
              {b.texto}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ListaEditable({
  titulo, items, lista, onCambiar, onAgregar, onQuitar,
}: {
  titulo: string;
  items: Bullet[];
  lista: 'beneficios' | 'requisitos';
  onCambiar: (lista: 'beneficios' | 'requisitos', id: string, campo: 'negrita' | 'texto', valor: string) => void;
  onAgregar: (lista: 'beneficios' | 'requisitos') => void;
  onQuitar: (lista: 'beneficios' | 'requisitos', id: string) => void;
}) {
  return (
    <div style={{ marginTop: 18 }}>
      <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8, fontWeight: 600 }}>{titulo}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((b) => (
          <div key={b.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input className="troya-input" style={{ flex: '0 0 170px' }} placeholder="Negrita (ej: Descuento:)" value={b.negrita} onChange={(e) => onCambiar(lista, b.id, 'negrita', e.target.value)} />
            <input className="troya-input" style={{ flex: 1 }} placeholder="Resto del texto" value={b.texto} onChange={(e) => onCambiar(lista, b.id, 'texto', e.target.value)} />
            <button className="troya-icon-btn troya-icon-btn--eliminar" onClick={() => onQuitar(lista, b.id)} title="Quitar">
              <IconTacho />
            </button>
          </div>
        ))}
        <button className="troya-btn troya-btn-secundario" style={{ alignSelf: 'flex-start' }} onClick={() => onAgregar(lista)}>
          + Agregar ítem
        </button>
      </div>
    </div>
  );
}

function IconBeneficios() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="100%" height="100%">
      <circle cx="12" cy="8" r="6" />
      <path d="M9 13l-2 8 5-3 5 3-2-8" />
      <path d="M9.5 8l1.5 1.5L14.5 6" />
    </svg>
  );
}

function IconRequisitos() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="100%" height="100%">
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 2h6v3H9z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function IconTacho() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2" />
      <path d="M19 6l-1 14a1 1 0 01-1 1H7a1 1 0 01-1-1L5 6" />
    </svg>
  );
}