'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';

const MODULOS = [
  { href: '/mapa', nombre: 'Mapa de Puntos Troya', descripcion: 'Vista geográfica de los confirmados', icon: IconMapa, modulo: 'mapa' },
  { href: '/mas/puntos-canje', nombre: 'Puntos y Canje', descripcion: 'Saldo, catálogo y canjes por cliente', icon: IconPuntos, modulo: 'puntos_canje' },
  { href: '/mas/accesos', nombre: 'Panel de Control de Accesos', descripcion: 'Usuarios y permisos por módulo', icon: IconAccesos, modulo: 'accesos' },
];

export default function MasPage() {
  const { puedeVer } = useAuth();
  const modulosVisibles = MODULOS.filter((m) => puedeVer(m.modulo));

  return (
    <div>
      <div className="troya-header">
        <div>
          <h1>Más</h1>
          <p className="troya-subtitulo">Otras herramientas del programa</p>
        </div>
      </div>

      {modulosVisibles.length === 0 ? (
        <div className="troya-vacio">
          <h3>No tenés acceso a más módulos</h3>
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

function IconMapa() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s-7-6.1-7-11a7 7 0 0114 0c0 4.9-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function IconPuntos() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2c1 3-1.5 3.5-1.5 6 0 1.4 1.1 2.5 2.5 2.5s2.5-1.1 2.5-2.5" />
      <path d="M12 2c3 3.5-2 5-2 9a5 5 0 1010 0c0-2.5-1.5-3.5-2.5-5" />
    </svg>
  );
}

function IconAccesos() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}