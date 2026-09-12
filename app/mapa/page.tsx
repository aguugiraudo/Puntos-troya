export default function MapaPage() {
    return (
      <div>
        <div className="troya-header">
          <div>
            <h1>Mapa de Puntos Troya</h1>
            <p className="troya-subtitulo">Vista general por provincia y localidad</p>
          </div>
        </div>
  
        <div className="troya-mapa-wrapper">
          <iframe
            src="https://www.google.com/maps/d/embed?mid=1UYR4RpUgZ0H3_21fZdy28VtHPl9wYNo&ehbc=2E312F"
            title="Mapa de Puntos Troya"
            loading="lazy"
            allowFullScreen
          />
        </div>
  
        <p className="troya-subtitulo" style={{ marginTop: 14 }}>
          Este mapa se actualiza manualmente en Google My Maps — todavía no está conectado con los datos de Activos.
        </p>
      </div>
    );
  }