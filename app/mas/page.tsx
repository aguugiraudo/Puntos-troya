import Link from 'next/link';

const MODULOS = [
  {
    href: '/mapa',
    nombre: 'Mapa de Puntos Troya',
    descripcion: 'Vista geográfica de los confirmados',
    icon: IconMapa,
  },
  {
    href: '/mas/puntos-canje',
    nombre: 'Puntos y Canje',
    descripcion: 'Saldo, catálogo y canjes por cliente',
    icon: IconPuntos,
  },
];

export default function MasPage() {
  return (
    <div>
      <div className="troya-header">
        <div>
          <h1>Más</h1>
          <p className="troya-subtitulo">Otras herramientas del programa</p>
        </div>
      </div>

      <div className="troya-hub-grid">
        {MODULOS.map((m) => {
          const Icon = m.icon;
          return (
            <Link key={m.href} href={m.href} className="troya-hub-card">
              <div className="troya-hub-card-icono">
                <Icon />
              </div>
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