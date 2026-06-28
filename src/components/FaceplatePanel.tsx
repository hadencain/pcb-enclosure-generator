import { useRef, useState } from 'react';
import type { EnclosureSpec, PlacedComponent, ComponentType } from '../lib/enclosure/schema';
import { COMPONENT_CATALOG, resolveSize, componentFootprint, validateFaceplate } from '../lib/enclosure/faceplate';
import { deriveDims } from '../lib/enclosure/derive';

interface Props { spec: EnclosureSpec; onChange: (s: EnclosureSpec) => void; }

const PX_PER_MM = 4;

export function FaceplatePanel({ spec, onChange }: Props) {
  const d = deriveDims(spec);
  const { snap, components } = spec.faceplate;
  const [selected, setSelected] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const W = d.outerL * PX_PER_MM, H = d.outerW * PX_PER_MM;
  // panel mm (x right, y up) → svg px (origin top-left, y down)
  const toPx = (x: number, y: number) => ({ px: W / 2 + x * PX_PER_MM, py: H / 2 - y * PX_PER_MM });
  const toMm = (px: number, py: number) => ({ x: (px - W / 2) / PX_PER_MM, y: (H / 2 - py) / PX_PER_MM });
  const snapMm = (v: number) => (snap > 0 ? Math.round(v / snap) * snap : v);

  const diags = validateFaceplate(spec);
  const badIds = new Set(diags.map(x => x.componentId));

  function setComponents(next: PlacedComponent[]) {
    onChange({ ...spec, faceplate: { ...spec.faceplate, components: next } });
  }
  function patch(id: string, p: Partial<PlacedComponent>) {
    setComponents(components.map(c => (c.id === id ? { ...c, ...p } : c)));
  }
  function add(type: ComponentType) {
    const c: PlacedComponent = { id: crypto.randomUUID(), type, x: 0, y: 0, rotation: 0 };
    setComponents([...components, c]);
    setSelected(c.id);
  }
  function remove(id: string) {
    setComponents(components.filter(c => c.id !== id));
    if (selected === id) setSelected(null);
  }

  function onPointerDown(e: React.PointerEvent, c: PlacedComponent) {
    e.stopPropagation();
    setSelected(c.id);
    const rect = svgRef.current!.getBoundingClientRect();
    const { x, y } = toMm(e.clientX - rect.left, e.clientY - rect.top);
    drag.current = { id: c.id, dx: c.x - x, dy: c.y - y };
    (e.target as Element).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const rect = svgRef.current!.getBoundingClientRect();
    const { x, y } = toMm(e.clientX - rect.left, e.clientY - rect.top);
    patch(drag.current.id, { x: snapMm(x + drag.current.dx), y: snapMm(y + drag.current.dy) });
  }
  function onPointerUp() { drag.current = null; }

  const sel = components.find(c => c.id === selected) ?? null;
  const gridLines = [];
  if (snap > 0) {
    for (let mx = 0; mx <= d.outerL / 2; mx += snap) {
      for (const sx of [mx, -mx]) { const { px } = toPx(sx, 0); gridLines.push(<line key={`vx${sx}`} x1={px} y1={0} x2={px} y2={H} stroke="#eee" />); }
    }
    for (let my = 0; my <= d.outerW / 2; my += snap) {
      for (const sy of [my, -my]) { const { py } = toPx(0, sy); gridLines.push(<line key={`hy${sy}`} x1={0} y1={py} x2={W} y2={py} stroke="#eee" />); }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h3>Faceplate (top view)</h3>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {(Object.keys(COMPONENT_CATALOG) as ComponentType[]).map(t => (
          <button key={t} onClick={() => add(t)}>+ {COMPONENT_CATALOG[t].label}</button>
        ))}
      </div>
      <svg ref={svgRef} width={W} height={H} style={{ border: '1px solid #999', background: '#fafafa', touchAction: 'none' }}
        onPointerMove={onPointerMove} onPointerUp={onPointerUp} onClick={() => setSelected(null)}>
        {gridLines}
        <rect x={0} y={0} width={W} height={H} fill="none" stroke="#333" />
        {spec.closure.type === 'screw' && (() => {
          const bossR = spec.screw.bossDia / 2;
          const cx = d.outerL / 2 - bossR, cy0 = d.outerW / 2 - bossR;
          return ([[cx, cy0], [cx, -cy0], [-cx, cy0], [-cx, -cy0]] as const).map(([bx, by], i) => {
            const { px, py } = toPx(bx, by);
            return <circle key={i} cx={px} cy={py} r={bossR * PX_PER_MM} fill="#fde" stroke="#c9a" />;
          });
        })()}
        {components.map(c => {
          const { px, py } = toPx(c.x, c.y);
          const shape = COMPONENT_CATALOG[c.type].shape;
          const stroke = badIds.has(c.id) ? 'crimson' : c.id === selected ? '#06c' : '#333';
          const fill = badIds.has(c.id) ? '#fdd' : '#cde';
          const common = { onPointerDown: (e: React.PointerEvent) => onPointerDown(e, c), style: { cursor: 'grab' } as const, stroke, fill };
          if (shape === 'round') {
            const sz = resolveSize(c);
            return <circle key={c.id} cx={px} cy={py} r={(sz as { dia: number }).dia / 2 * PX_PER_MM} {...common} />;
          }
          const f = componentFootprint({ ...c, rotation: 0 });
          return <rect key={c.id} x={px - f.hw * PX_PER_MM} y={py - f.hh * PX_PER_MM}
            width={f.hw * 2 * PX_PER_MM} height={f.hh * 2 * PX_PER_MM}
            transform={`rotate(${-c.rotation} ${px} ${py})`} {...common} />;
        })}
      </svg>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        snap (mm)
        <input type="number" step="0.5" value={snap} style={{ width: 70 }}
          onChange={e => onChange({ ...spec, faceplate: { ...spec.faceplate, snap: parseFloat(e.target.value) || 0 } })} />
      </label>
      {sel && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid #ddd', paddingTop: 6 }}>
          <strong>{COMPONENT_CATALOG[sel.type].label}</strong>
          <label>X <input type="number" step="0.5" value={sel.x} onChange={e => patch(sel.id, { x: parseFloat(e.target.value) || 0 })} /></label>
          <label>Y <input type="number" step="0.5" value={sel.y} onChange={e => patch(sel.id, { y: parseFloat(e.target.value) || 0 })} /></label>
          <label>rotation° <input type="number" step="5" value={sel.rotation} onChange={e => patch(sel.id, { rotation: parseFloat(e.target.value) || 0 })} /></label>
          <button onClick={() => remove(sel.id)}>Delete</button>
        </div>
      )}
      {diags.length > 0 && (
        <ul style={{ color: 'crimson', margin: 0, paddingLeft: 18 }}>
          {diags.filter((x, i, a) => a.findIndex(y => y.componentId === x.componentId && y.kind === x.kind) === i)
            .map((x, i) => <li key={i}>{x.message}</li>)}
        </ul>
      )}
    </div>
  );
}
