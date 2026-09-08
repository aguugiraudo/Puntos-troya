export default function CumplimientoGauge({ porcentaje }: { porcentaje: number }) {
    const p = Math.max(0, Math.min(100, porcentaje));
    const color = p >= 100 ? '#DA231F' : p >= 50 ? '#EB6726' : '#FABF1F';
  
    return (
      <div className="troya-gauge">
        <span className="troya-gauge-label" style={{ color }}>{p}%</span>
        <div className="troya-gauge-track">
          <div className="troya-gauge-fill" style={{ width: `${p}%`, background: color }} />
        </div>
      </div>
    );
  }