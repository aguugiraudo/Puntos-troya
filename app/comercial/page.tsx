'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';

const MODULOS = [
  { href: '/comercial/costos-precios', nombre: 'Costos y Precios', descripcion: 'Rentabilidad por lista e historial de actualizaciones', icon: IconCostos, modulo: 'costos_precios' },
  { href: '/comercial/cotizador', nombre: 'Cotizador', descripcion: 'Armá una cotización con descuentos y mandala al cliente', icon: IconCotizador, modulo: 'cotizador' },
  { href: '/comercial/promos', nombre: 'Promos', descripcion: 'Armá combos y ofertas, con rentabilidad al instante', icon: IconPromos, modulo: 'promos' },
  { href: '/comercial/stock', nombre: 'Stock', descripcion: 'Cuánto hay y cuánto vale, por depósito', icon: IconStock, modulo: 'stock' },
];

export default function ComercialPage() {
  const { puedeVer } = useAuth();
  const modulosVisibles = MODULOS.filter((m) => puedeVer(m.modulo));

  return (
    <div>
      <div className="troya-header">
        <div>
          <h1>Comercial</h1>
          <p className="troya-subtitulo">Costos, precios y rentabilidad</p>
        </div>
      </div>

      {modulosVisibles.length === 0 ? (
        <div className="troya-vacio">
          <h3>No tenés acceso a ningún módulo de Comercial</h3>
          <p>Pedile al administrador que te habilite alguno desde el Panel de Accesos.</p>
        </div>
      ) : (
        <div className="troya-hub-grid">
          {modulosVisibles.map((m) => {
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
      )}
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

function IconCotizador() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3v4a1 1 0 001 1h4" />
      <path d="M17 21H7a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2z" />
      <path d="M9 13h6M9 17h4" />
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