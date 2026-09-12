'use client';

type Props = {
  value: string;
  onChange: (valor: string) => void;
  placeholder?: string;
};

export default function InputMoneda({ value, onChange, placeholder }: Props) {
  function formatear(v: string) {
    const soloNumeros = v.replace(/\D/g, '');
    if (!soloNumeros) return '';
    return Number(soloNumeros).toLocaleString('es-AR');
  }

  function manejarCambio(e: React.ChangeEvent<HTMLInputElement>) {
    const soloNumeros = e.target.value.replace(/\D/g, '');
    onChange(soloNumeros);
  }

  return (
    <div style={{ position: 'relative', flex: '1 1 160px' }}>
      <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#B5AAA0', fontSize: 14, pointerEvents: 'none' }}>$</span>
      <input
        className="troya-input"
        style={{ width: '100%', paddingLeft: 26 }}
        type="text"
        inputMode="numeric"
        placeholder={placeholder}
        value={formatear(value)}
        onChange={manejarCambio}
      />
    </div>
  );
}