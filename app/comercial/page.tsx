'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';

const MODULOS = [
  { href: '/comercial/costos-precios', nombre: 'Costos y Precios', descripcion: 'Rentabilidad por lista e historial de actualizaciones', icon: IconCostos },
  { href: '/comercial/promos', nombre: 'Promos', descripcion: 'Armá combos y ofertas, con rentabilidad al instante', icon: IconPromos },
  { href: '/comercial/stock', nombre: 'Stock', descripcion: 'Cuánto hay y cuánto vale, por depósito', icon: IconStock },
];

export default function ComercialPage() {
  const { usuario } = useAuth();

  if (!usuario?.es_dueno) {
    return (
      <div className="troya-vacio">
        <h3>No tenés acceso a esta sección</h3>
        <p>Comercial es exclusivo del dueño.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="troya-header">
        <div>
          <h1>Comercial</h1>
          <p className="troya-subtitulo">Costos, precios y rentabilidad</p>
        </div>
      </div>

      <div className="troya-hub-grid">
        {MODULOS.map((m) => {
          const Icon = m.icon;
          return (
            <Link key={m.href} href={m.href} className="troya-hub-card">
              <div className="troya-hub-card-icono"><Icon /></div>
              <div className="troya-hub-card-texto">
                <h3>{m.nombre}</h3>
                <p>{m.descripcion}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function IconCostos() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1v22" />
      <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    </svg>
  );
}

function IconPromos() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41L11 3.83A2 2 0 009.59 3.24L3 3v6.59a2 2 0 00.59 1.41l9.59 9.59a2 2 0 002.82 0l4.59-4.59a2 2 0 000-2.82z" />
      <circle cx="7.5" cy="7.5" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconStock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8L12 3 3 8l9 5 9-5z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </svg>
  );
}