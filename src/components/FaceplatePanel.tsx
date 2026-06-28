import { useRef, useState } from 'react';
import type { EnclosureSpec, PlacedComponent, ComponentType } from '../lib/enclosure/schema';
import { COMPONENT_CATALOG, resolveSize, componentFootprint, validateFaceplate } from '../lib/enclosure/faceplate';
import { deriveDims, resolvePort } from '../lib/enclosure/derive';
import { NumberField } from './Field';

interface Props { spec: EnclosureSpec; onChange: (s: EnclosureSpec) => void; }

const S = 6;        // px per mm
const RULER = 22;   // gutter for the mm rulers
const PAD = 12;

// SVG presentation attributes can't read CSS var()s, so the canvas palette is literal.
// Monochrome + one accent: accent (steel) marks the selected element only.
const CO = {
  acc: '#6f93b8', ink: '#e9ebee', gray: '#868b92', faint: '#50555c',
  line: '#2a2e33', lineSoft: '#1e2125', warn: '#e0625c',
};
const MONO = "'IBM Plex Mono', monospace";
const tag = (i: number) => String.fromCharCode(65 + i); // 0 → A

function sizeLabel(c: PlacedComponent): string {
  const sz = resolveSize(c);
  if ('dia' in sz) return `⌀${sz.dia.toFixed(1)}`;
  if ('w' in sz) return `${sz.w.toFixed(1)}×${sz.h.toFixed(1)}`;
  return `slot ${sz.travel.toFixed(0)}×${sz.slotW.toFixed(1)}`;
}

function Glyph({ shape }: { shape: 'round' | 'rect' | 'slot' }) {
  return (
    <svg className="glyph" width="13" height="13" viewBox="0 0 13 13" fill="none" stroke={CO.gray} strokeWidth="1.3">
      {shape === 'round' && <circle cx="6.5" cy="6.5" r="4" />}
      {shape === 'rect' && <rect x="2" y="3.5" width="9" height="6" />}
      {shape === 'slot' && <rect x="1.5" y="4.5" width="10" height="4" rx="2" />}
    </svg>
  );
}

export function FaceplatePanel({ spec, onChange }: Props) {
  const d = deriveDims(spec);
  const { snap, components } = spec.faceplate;
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const halfL = d.outerL / 2, halfW = d.outerW / 2;
  const W = d.outerL * S, H = d.outerW * S;
  const SVGW = RULER + W + PAD, SVGH = RULER + H + PAD;
  const toPx = (x: number, y: number) => ({ px: RULER + W / 2 + x * S, py: RULER + H / 2 - y * S });
  const toMm = (px: number, py: number) => ({ x: (px - RULER - W / 2) / S, y: (H / 2 - (py - RULER)) / S });
  const snapMm = (v: number) => (snap > 0 ? Math.round(v / snap) * snap : v);

  const diags = validateFaceplate(spec);
  const badIds = new Set(diags.map(x => x.componentId));
  const uniqDiags = diags.filter((x, i, a) => a.findIndex(y => y.componentId === x.componentId && y.kind === x.kind) === i);
  const sel = components.find(c => c.id === selected) ?? null;
  const selIdx = components.findIndex(c => c.id === selected);

  const setComponents = (next: PlacedComponent[]) =>
    onChange({ ...spec, faceplate: { ...spec.faceplate, components: next } });
  const patch = (id: string, p: Partial<PlacedComponent>) =>
    setComponents(components.map(c => (c.id === id ? { ...c, ...p } : c)));
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
    const r = svgRef.current!.getBoundingClientRect();
    const { x, y } = toMm(e.clientX - r.left, e.clientY - r.top);
    drag.current = { id: c.id, dx: c.x - x, dy: c.y - y };
    (e.target as Element).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const r = svgRef.current!.getBoundingClientRect();
    const { x, y } = toMm(e.clientX - r.left, e.clientY - r.top);
    patch(drag.current.id, { x: snapMm(x + drag.current.dx), y: snapMm(y + drag.current.dy) });
  }
  const onPointerUp = () => { drag.current = null; };

  // ── rulers + grid ──────────────────────────────────────────────
  const majorsX: number[] = [];
  for (let v = -Math.floor(halfL / 10) * 10; v <= halfL; v += 10) majorsX.push(v);
  const majorsY: number[] = [];
  for (let v = -Math.floor(halfW / 10) * 10; v <= halfW; v += 10) majorsY.push(v);
  const grid: React.ReactElement[] = [];
  if (snap > 0 && snap * S >= 4) {
    for (let v = snap; v <= halfL; v += snap) for (const sx of [v, -v]) { const { px } = toPx(sx, 0); grid.push(<line key={`gx${sx}`} x1={px} y1={RULER} x2={px} y2={RULER + H} stroke={CO.lineSoft} />); }
    for (let v = snap; v <= halfW; v += snap) for (const sy of [v, -v]) { const { py } = toPx(0, sy); grid.push(<line key={`gy${sy}`} x1={RULER} y1={py} x2={RULER + W} y2={py} stroke={CO.lineSoft} />); }
  }

  // ── selected dimension callouts (draw-in on select) ────────────
  function dims(c: PlacedComponent): React.ReactElement {
    const { px, py } = toPx(c.x, c.y);
    const da = toPx(0, 0);
    const tick = (x: number, y: number) => <line x1={x - 3} y1={y - 3} x2={x + 3} y2={y + 3} stroke={CO.gray} strokeWidth="1" />;
    return (
      <g className="dim-grp" key={c.id} pointerEvents="none" fontFamily={MONO} fontSize="9.5" fill={CO.gray}>
        {Math.abs(c.x) > 0.01 && <>
          <line x1={da.px} y1={py} x2={px} y2={py} stroke={CO.gray} strokeWidth="0.8" strokeDasharray="1 2" />
          {tick(da.px, py)}{tick(px, py)}
          <text x={(da.px + px) / 2} y={py - 5} textAnchor="middle">X {c.x.toFixed(1)}</text>
        </>}
        {Math.abs(c.y) > 0.01 && <>
          <line x1={px} y1={da.py} x2={px} y2={py} stroke={CO.gray} strokeWidth="0.8" strokeDasharray="1 2" />
          {tick(px, da.py)}{tick(px, py)}
          <text x={px + 6} y={(da.py + py) / 2} dominantBaseline="middle">Y {c.y.toFixed(1)}</text>
        </>}
        <text x={px} y={py - 11} textAnchor="middle" fill={CO.ink}>{sizeLabel(c)}</text>
      </g>
    );
  }

  // ── port reference markers ─────────────────────────────────────
  const portMarks: React.ReactElement[] = [];
  spec.ports.forEach((p, i) => {
    let rp; try { rp = resolvePort(spec, p, d); } catch { return; }
    const half = rp.openW / 2;
    if (p.face === 'N' || p.face === 'S') {
      const y = p.face === 'N' ? RULER : RULER + H;
      const x1 = toPx(rp.alongCenter - half, 0).px, x2 = toPx(rp.alongCenter + half, 0).px;
      portMarks.push(<g key={`pm${i}`} pointerEvents="none">
        <line x1={x1} y1={y} x2={x2} y2={y} stroke={CO.gray} strokeWidth="2.5" />
        <text x={(x1 + x2) / 2} y={p.face === 'N' ? y - 4 : y + 11} fill={CO.gray} fontFamily={MONO} fontSize="8.5" textAnchor="middle">{p.type}</text>
      </g>);
    } else {
      const x = p.face === 'E' ? RULER + W : RULER;
      const y1 = toPx(0, rp.alongCenter - half).py, y2 = toPx(0, rp.alongCenter + half).py;
      portMarks.push(<g key={`pm${i}`} pointerEvents="none"><line x1={x} y1={y1} x2={x} y2={y2} stroke={CO.gray} strokeWidth="2.5" /></g>);
    }
  });

  const da = toPx(0, 0);
  const sb0 = toPx(-halfL, 0).px + 6;
  const sbY = RULER + H - 12;
  const screwClr = (spec.screw.dia + 0.6).toFixed(1);
  const cutCount = components.length + (spec.closure.type === 'screw' ? 4 : 0);

  return (
    <div>
      <div className="workspace-head">
        <h2>Faceplate</h2>
        <span className="sub">lid · top view · {d.outerL.toFixed(0)}×{d.outerW.toFixed(0)}mm</span>
        <span style={{ flex: 1 }} />
        <div style={{ width: 142 }}><NumberField label="snap" value={snap} step={0.5}
          onChange={v => onChange({ ...spec, faceplate: { ...spec.faceplate, snap: v } })} /></div>
      </div>

      <div className="palette">
        {(Object.keys(COMPONENT_CATALOG) as ComponentType[]).map(t => (
          <button key={t} className="chip" onClick={() => add(t)}>
            <Glyph shape={COMPONENT_CATALOG[t].shape} />
            {COMPONENT_CATALOG[t].label}
            <span className="plus">+</span>
          </button>
        ))}
      </div>

      <div className="draft">
        <span className="corner-tag">panel · mm · top</span>
        <svg ref={svgRef} width={SVGW} height={SVGH}
          onPointerMove={onPointerMove} onPointerUp={onPointerUp}
          onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}>
          <rect x={RULER} y={RULER} width={W} height={H} fill="none" stroke={CO.line}
            onClick={() => setSelected(null)} />
          {grid}

          <line x1={da.px} y1={RULER} x2={da.px} y2={RULER + H} stroke={CO.faint} />
          <line x1={RULER} y1={da.py} x2={RULER + W} y2={da.py} stroke={CO.faint} />

          {majorsX.map(v => { const { px } = toPx(v, 0); return (
            <g key={`rx${v}`} pointerEvents="none">
              <line x1={px} y1={RULER - 5} x2={px} y2={RULER} stroke={CO.gray} strokeWidth="0.8" opacity="0.6" />
              <text x={px} y={RULER - 8} fill={CO.gray} fontFamily={MONO} fontSize="8.5" textAnchor="middle" opacity="0.75">{v}</text>
            </g>); })}
          {majorsY.map(v => { const { py } = toPx(0, v); return (
            <g key={`ry${v}`} pointerEvents="none">
              <line x1={RULER - 5} y1={py} x2={RULER} y2={py} stroke={CO.gray} strokeWidth="0.8" opacity="0.6" />
              <text x={2} y={py} fill={CO.gray} fontFamily={MONO} fontSize="8.5" dominantBaseline="middle" opacity="0.75">{v}</text>
            </g>); })}

          {portMarks}

          {spec.closure.type === 'screw' && (() => {
            const bossR = spec.screw.bossDia / 2;
            const cx = halfL - bossR, cy0 = halfW - bossR;
            return ([[cx, cy0], [cx, -cy0], [-cx, cy0], [-cx, -cy0]] as const).map(([bx, by], i) => {
              const { px, py } = toPx(bx, by);
              return <circle key={i} cx={px} cy={py} r={bossR * S} fill="none" stroke={CO.faint} strokeWidth="0.8" strokeDasharray="2 2" pointerEvents="none" />;
            });
          })()}

          {/* datum crosshair */}
          <g pointerEvents="none">
            <circle cx={da.px} cy={da.py} r="3" fill="none" stroke={CO.gray} strokeWidth="0.8" />
            <line x1={da.px - 6} y1={da.py} x2={da.px + 6} y2={da.py} stroke={CO.gray} strokeWidth="0.6" />
            <line x1={da.px} y1={da.py - 6} x2={da.px} y2={da.py + 6} stroke={CO.gray} strokeWidth="0.6" />
          </g>

          {/* scale bar: 10 mm */}
          <g pointerEvents="none" fontFamily={MONO} fill={CO.gray}>
            <line x1={sb0} y1={sbY} x2={sb0 + 10 * S} y2={sbY} stroke={CO.gray} strokeWidth="1" />
            <line x1={sb0} y1={sbY - 3} x2={sb0} y2={sbY + 3} stroke={CO.gray} strokeWidth="1" />
            <line x1={sb0 + 10 * S} y1={sbY - 3} x2={sb0 + 10 * S} y2={sbY + 3} stroke={CO.gray} strokeWidth="1" />
            <text x={sb0} y={sbY - 5} fontSize="8.5">10 mm</text>
          </g>

          {/* components + tags + hover labels */}
          {components.map((c, i) => {
            const { px, py } = toPx(c.x, c.y);
            const shape = COMPONENT_CATALOG[c.type].shape;
            const on = c.id === selected, bad = badIds.has(c.id);
            const f = componentFootprint({ ...c, rotation: 0 });
            const stroke = bad ? CO.warn : on ? CO.acc : CO.ink;
            const fill = bad ? 'rgba(224,98,92,0.10)' : on ? 'rgba(111,147,184,0.16)' : 'rgba(233,235,238,0.05)';
            const common = {
              onPointerDown: (e: React.PointerEvent) => onPointerDown(e, c),
              onPointerEnter: () => setHover(c.id),
              onPointerLeave: () => setHover(h => (h === c.id ? null : h)),
              style: { cursor: 'grab' } as const, stroke, fill, strokeWidth: on ? 1.5 : 1,
            };
            const shapeEl = shape === 'round'
              ? <circle cx={px} cy={py} r={(resolveSize(c) as { dia: number }).dia / 2 * S} {...common} />
              : <rect x={px - f.hw * S} y={py - f.hh * S} width={f.hw * 2 * S} height={f.hh * 2 * S}
                  rx={shape === 'slot' ? f.hh * S : 0} transform={`rotate(${-c.rotation} ${px} ${py})`} {...common} />;
            return (
              <g key={c.id}>
                {shapeEl}
                <text x={px + f.hw * S + 4} y={py - f.hh * S - 2} fill={on ? CO.acc : CO.faint} fontFamily={MONO} fontSize="9" pointerEvents="none">{tag(i)}</text>
                {hover === c.id && !on && (
                  <text x={px} y={py + f.hh * S + 12} fill={CO.ink} fontFamily={MONO} fontSize="8.5" textAnchor="middle" pointerEvents="none">{COMPONENT_CATALOG[c.type].label}</text>
                )}
              </g>
            );
          })}

          {sel && dims(sel)}
        </svg>

        <div className="titleblock">
          <div className="tb mk"><span className="k">PROJECT</span><span className="v">ENCLOSURE</span></div>
          <div className="tb"><span className="k">PART</span><span className="v">FACEPLATE</span></div>
          <div className="tb"><span className="k">VIEW</span><span className="v">TOP</span></div>
          <div className="tb"><span className="k">UNITS</span><span className="v">MM</span></div>
          <div className="tb"><span className="k">PANEL</span><span className="v">{d.outerL.toFixed(0)}×{d.outerW.toFixed(0)}</span></div>
          <div className="tb"><span className="k">HOLES</span><span className="v">{cutCount}</span></div>
        </div>
      </div>

      <div className="inspect">
        {sel ? (
          <div className="callout">
            <div className="callout-h">
              <span className="name"><span style={{ color: CO.acc, fontFamily: MONO, marginRight: 8 }}>{tag(selIdx)}</span>{COMPONENT_CATALOG[sel.type].label}</span>
              <span className="tag">{sizeLabel(sel)}</span>
            </div>
            <div className="callout-body">
              <NumberField label="X" value={sel.x} step={0.5} onChange={v => patch(sel.id, { x: v })} />
              <NumberField label="Y" value={sel.y} step={0.5} onChange={v => patch(sel.id, { y: v })} />
              <div className="span2">
                <NumberField label="rotation" value={sel.rotation} step={5} unit="°" onChange={v => patch(sel.id, { rotation: v })} />
              </div>
            </div>
            <button className="del" onClick={() => remove(sel.id)}>Delete component</button>
          </div>
        ) : (
          <div className="empty-hint">select a component to dimension it — or add one from the palette</div>
        )}

        <div className="eng">
          <div className="eng-h">Hole Schedule <span className="count">{cutCount} cuts</span></div>
          <table className="sched">
            <thead><tr><th>Tag</th><th>Item</th><th>Size</th><th className="num">X</th><th className="num">Y</th><th className="num">Rot</th></tr></thead>
            <tbody>
              {spec.closure.type === 'screw' && (
                <tr><td className="tg">—</td><td>Screw ×4</td><td className="dim">⌀{screwClr} c'sink ⌀{spec.screw.headDia.toFixed(1)}</td><td className="num">·</td><td className="num">·</td><td className="num">·</td></tr>
              )}
              {components.length === 0 && spec.closure.type !== 'screw' && (
                <tr><td colSpan={6} style={{ color: CO.faint }}>no cuts yet</td></tr>
              )}
              {components.map((c, i) => (
                <tr key={c.id} className={`click${c.id === selected ? ' on' : ''}${badIds.has(c.id) ? ' bad' : ''}`} onClick={() => setSelected(c.id)}>
                  <td className="tg">{tag(i)}</td>
                  <td>{COMPONENT_CATALOG[c.type].label}</td>
                  <td className="dim">{sizeLabel(c)}</td>
                  <td className="num">{c.x.toFixed(1)}</td>
                  <td className="num">{c.y.toFixed(1)}</td>
                  <td className="num">{c.rotation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {uniqDiags.length > 0 && (
          <div className="diags">
            {uniqDiags.map((x, i) => (
              <div key={i} className="diag"><span className="mk">!</span>{x.message}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
