// Velocímetro tipo "reloj/tacómetro" en SVG puro (sin librería extra): arco de fondo + arco de
// progreso coloreado + aguja + marca de meta opcional. Mismo componente que ya usa sistema-contratos
// para sus KPI de avance — el usuario pidió reutilizar el estilo acá en el Dashboard de bodega.
interface Props {
  value: number
  target?: number | null
  max?: number
  size?: number
  color: string
  trackColor?: string
  valueLabel?: string
  caption?: string
  targetCaption?: string
}

// Color según el % de avance/cobertura en sí (no una diferencia vs. una meta esperada por tiempo,
// como en sistema-contratos — acá no hay "ritmo ideal", solo qué tan completo está algo):
// verde = bien cubierto, amarillo/naranja = atención, rojo = muy bajo.
export function colorPorPorcentaje(pct: number): string {
  if (pct >= 80) return '#059669'  // verde
  if (pct >= 50) return '#ca8a04'  // amarillo
  if (pct >= 25) return '#ea580c'  // naranja
  return '#dc2626'                 // rojo
}

function polar(cx: number, cy: number, r: number, thetaDeg: number) {
  const t = (thetaDeg * Math.PI) / 180
  return { x: cx - r * Math.cos(t), y: cy - r * Math.sin(t) }
}

function arcPath(cx: number, cy: number, r: number, thetaStart: number, thetaEnd: number) {
  const s = polar(cx, cy, r, thetaStart)
  const e = polar(cx, cy, r, thetaEnd)
  const largeArc = Math.abs(thetaEnd - thetaStart) > 180 ? 1 : 0
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} 1 ${e.x} ${e.y}`
}

export default function GaugeVelocimetro({
  value, target = null, max, size = 160, color, trackColor = '#e5e7eb',
  valueLabel, caption, targetCaption,
}: Props) {
  const safeValue = Number.isFinite(value) ? value : 0
  const autoMax = Math.max(100, Math.ceil((Math.max(safeValue, target || 0) * 1.15) / 10) * 10)
  const scaleMax = max ?? autoMax
  const clampedValue = Math.min(Math.max(safeValue, 0), scaleMax)
  const thetaValue = (clampedValue / scaleMax) * 180
  const thetaTarget = target != null ? (Math.min(Math.max(target, 0), scaleMax) / scaleMax) * 180 : null

  const w = size
  const h = size * 0.62
  const cx = w / 2
  const cy = h - 4
  const r = w / 2 - 12
  const strokeW = Math.max(8, size * 0.075)
  const needleLen = r - strokeW * 0.9
  const needleTip = polar(cx, cy, needleLen, thetaValue)
  const overflow = safeValue > scaleMax

  return (
    <div className="flex flex-col items-center select-none" style={{ width: w }}>
      <svg width={w} height={h + 4} viewBox={`0 0 ${w} ${h + 4}`}>
        <path d={arcPath(cx, cy, r, 0, 180)} stroke={trackColor} strokeWidth={strokeW} fill="none" strokeLinecap="round" />
        {thetaValue > 0.5 && (
          <path d={arcPath(cx, cy, r, 0, thetaValue)} stroke={color} strokeWidth={strokeW} fill="none" strokeLinecap="round" />
        )}
        {thetaTarget != null && (
          <line
            x1={polar(cx, cy, r - strokeW / 2 - 1, thetaTarget).x} y1={polar(cx, cy, r - strokeW / 2 - 1, thetaTarget).y}
            x2={polar(cx, cy, r + strokeW / 2 + 1, thetaTarget).x} y2={polar(cx, cy, r + strokeW / 2 + 1, thetaTarget).y}
            stroke="#1f2937" strokeWidth={2.5} strokeLinecap="round"
          />
        )}
        <line x1={cx} y1={cy} x2={needleTip.x} y2={needleTip.y} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={5.5} fill={color} stroke="white" strokeWidth={1.5} />
      </svg>
      <div className="text-center -mt-1">
        <p className="text-2xl font-bold tabular-nums leading-none" style={{ color }}>
          {overflow && <span className="text-sm align-top mr-0.5">▲</span>}
          {valueLabel ?? `${safeValue.toFixed(1)}%`}
        </p>
        {caption && <p className="text-[10px] text-gray-400 font-medium mt-1 uppercase tracking-wide">{caption}</p>}
        {targetCaption && (
          <p className="text-[10px] text-gray-500 mt-0.5 flex items-center justify-center gap-1">
            <span className="inline-block w-2 h-0.5 bg-gray-700 rounded-full" /> {targetCaption}
          </p>
        )}
      </div>
    </div>
  )
}
