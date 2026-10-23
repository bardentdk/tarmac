/**
 * LogViewer.tsx — la visionneuse de log, partagée par le client et le mappeur.
 *
 * Même lecture que l'écran mobile (Tarmac/src/app/log/[id].tsx) : on trace la
 * grandeur choisie, on promène un curseur, et sous le curseur on lit TOUTES
 * les grandeurs de cet instant. Le navigateur ajoute ce qu'un écran de
 * téléphone ne permet pas confortablement :
 *   · glisser sur la courbe pour zoomer sur une plage ;
 *   · superposer une deuxième grandeur, sur son propre axe (en bleu
 *     télémétrie, à droite) ;
 *   · comparer avec un autre log, en pointillés — avant / après une
 *     cartographie, typiquement.
 *
 * Un log peut contenir 70 000 lignes : on sous-échantillonne à la largeur du
 * graphique en gardant les extrema de chaque tranche, pour ne perdre aucun pic.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { LogData, ParsedLog } from '@/log/logFormat';
import { metricInfo, type MetricKey } from '@/obd/pids';
import { Card, Chip, GhostButton } from './components';
import { frNum } from './format';

const COLORS = { ok: '#C6F432', info: '#5AA9FF', text: '#F2F2F0', text2: '#A3A7AE', border: '#262930', warn: '#FF8A3D' };

interface Pt { t: number; v: number }

/** Sous-échantillonnage min/max : deux points par tranche, dans l'ordre. */
function downsample(data: LogData, key: MetricKey, t0: number, t1: number, buckets: number): Pt[] {
  const col = data.columns[key];
  if (!col) return [];
  const ms = data.ms;
  const span = Math.max(1e-6, t1 - t0);
  const out: Pt[] = [];
  let b = -1;
  let lo: Pt | null = null;
  let hi: Pt | null = null;
  const flush = () => {
    if (!lo || !hi) return;
    if (lo === hi) out.push(lo);
    else if (lo.t < hi.t) out.push(lo, hi);
    else out.push(hi, lo);
  };
  for (let i = 0; i < ms.length; i++) {
    const t = ms[i] / 1000;
    if (t < t0 || t > t1) continue;
    const v = col[i];
    if (v === undefined || Number.isNaN(v)) continue;
    const nb = Math.min(buckets - 1, Math.floor(((t - t0) / span) * buckets));
    if (nb !== b) {
      flush();
      b = nb;
      lo = hi = { t, v };
    } else {
      if (v < lo!.v) lo = { t, v };
      if (v > hi!.v) hi = { t, v };
    }
  }
  flush();
  return out;
}

function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (max - min < 1e-9) return [min];
  const raw = (max - min) / (count - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

function extent(pts: Pt[]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const p of pts) {
    if (p.v < min) min = p.v;
    if (p.v > max) max = p.v;
  }
  if (!Number.isFinite(min)) return { min: 0, max: 1 };
  const pad = (max - min) * 0.06 || Math.abs(max) * 0.1 || 1;
  return { min: Math.min(0, min) === 0 && min >= 0 ? 0 : min - pad, max: max + pad };
}

/** Index de la ligne la plus proche d'un instant, par dichotomie. */
function indexAt(ms: number[], t: number): number {
  let lo = 0;
  let hi = ms.length - 1;
  const target = t * 1000;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ms[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(ms[lo - 1] - target) < Math.abs(ms[lo] - target)) return lo - 1;
  return lo;
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const fmtV = (v: number | undefined, key: MetricKey): string =>
  v === undefined || Number.isNaN(v) ? '—' : frNum(v, metricInfo(key).decimals);

export function LogViewer({
  log,
  compare,
  compareLabel,
  onExport,
}: {
  log: ParsedLog;
  /** Log de comparaison, tracé en pointillés sur la même grandeur. */
  compare?: ParsedLog | null;
  compareLabel?: string;
  onExport?: () => void;
}) {
  const { meta, data } = log;
  const durationS = (data.ms[data.ms.length - 1] ?? 0) / 1000;
  const available = useMemo(
    () => meta.keys.filter((k) => data.columns[k]?.some((v) => !Number.isNaN(v))),
    [meta.keys, data.columns],
  );

  const [metric, setMetric] = useState<MetricKey | null>(null);
  const [overlay, setOverlay] = useState<MetricKey | null>(null);
  const [zoom, setZoom] = useState<{ t0: number; t1: number } | null>(null);
  const [cursor, setCursor] = useState(0);
  const [brush, setBrush] = useState<{ from: number; to: number } | null>(null);
  const [boxRef, width] = useWidth<HTMLDivElement>();
  const down = useRef<number | null>(null);

  const plotted = metric && available.includes(metric) ? metric : available.includes('rpm') ? 'rpm' : available[0] ?? null;
  const view = zoom ?? { t0: 0, t1: Math.max(durationS, 0.001) };
  const height = width < 520 ? 240 : 320;
  const box = { x: 44, y: 16, w: Math.max(10, width - 44 - (overlay ? 48 : 12)), h: height - 44 };
  const buckets = Math.max(40, Math.floor(box.w / 2));

  const main = useMemo(() => (plotted ? downsample(data, plotted, view.t0, view.t1, buckets) : []), [data, plotted, view.t0, view.t1, buckets]);
  const ref = useMemo(
    () => (plotted && compare?.data.columns[plotted] ? downsample(compare.data, plotted, view.t0, view.t1, buckets) : []),
    [compare, plotted, view.t0, view.t1, buckets],
  );
  const sec = useMemo(
    () => (overlay && overlay !== plotted ? downsample(data, overlay, view.t0, view.t1, buckets) : []),
    [data, overlay, plotted, view.t0, view.t1, buckets],
  );

  if (!plotted) {
    return <Card><span className="dim">Ce log ne contient aucune grandeur traçable.</span></Card>;
  }

  const yMain = extent([...main, ...ref]);
  const ySec = extent(sec);
  const toX = (t: number) => box.x + ((t - view.t0) / (view.t1 - view.t0 || 1)) * box.w;
  const toY = (v: number, d = yMain) => box.y + box.h - ((v - d.min) / (d.max - d.min || 1)) * box.h;
  const fromX = (x: number) => Math.max(view.t0, Math.min(view.t1, view.t0 + ((x - box.x) / box.w) * (view.t1 - view.t0)));
  const path = (pts: Pt[], d = yMain) => pts.map((p, i) => `${i ? 'L' : 'M'}${toX(p.t).toFixed(1)} ${toY(p.v, d).toFixed(1)}`).join(' ');

  const at = Math.max(view.t0, Math.min(view.t1, cursor));
  const ci = data.ms.length ? indexAt(data.ms, at) : 0;
  const cci = compare && compare.data.ms.length ? indexAt(compare.data.ms, at) : -1;
  const info = metricInfo(plotted);

  const local = (e: ReactPointerEvent<SVGSVGElement>) => e.clientX - e.currentTarget.getBoundingClientRect().left;
  const onDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    down.current = local(e);
    setCursor(fromX(down.current));
  };
  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const x = local(e);
    if (down.current === null) {
      if (e.pointerType === 'mouse') setCursor(fromX(x));
      return;
    }
    if (Math.abs(x - down.current) > 6) setBrush({ from: fromX(Math.min(x, down.current)), to: fromX(Math.max(x, down.current)) });
    else setCursor(fromX(x));
  };
  const onUp = () => {
    if (brush && brush.to - brush.from > 0.05) {
      setZoom({ t0: brush.from, t1: brush.to });
      setCursor(brush.from);
    }
    setBrush(null);
    down.current = null;
  };

  const yTicks = niceTicks(yMain.min, yMain.max);
  const xTicks = niceTicks(view.t0, view.t1, Math.max(3, Math.min(8, Math.floor(box.w / 110))));
  const secTicks = sec.length ? niceTicks(ySec.min, ySec.max) : [];
  const markers = meta.markers.filter((m) => m.ms / 1000 >= view.t0 && m.ms / 1000 <= view.t1);
  const step = (view.t1 - view.t0) / 200;

  return (
    <div className="stack">
      <div className="stack-sm">
        <div className="chips" role="toolbar" aria-label="Grandeur tracée">
          {available.map((k) => (
            <Chip key={k} label={metricInfo(k).label} active={plotted === k} onClick={() => setMetric(k)} />
          ))}
        </div>
        <div className="chips" role="toolbar" aria-label="Grandeur superposée">
          <span className="dim small" style={{ alignSelf: 'center', whiteSpace: 'nowrap' }}>Superposer</span>
          <Chip small label="Aucune" active={!overlay} onClick={() => setOverlay(null)} />
          {available.filter((k) => k !== plotted).map((k) => (
            <Chip small key={k} label={metricInfo(k).label} active={overlay === k} onClick={() => setOverlay(k)} />
          ))}
        </div>
      </div>

      <Card>
        <div ref={boxRef} style={{ width: '100%' }}>
          {width > 0 ? (
            <svg
              className="chart"
              width={width}
              height={height}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onDoubleClick={() => setZoom(null)}
              role="img"
              aria-label={`Courbe ${info.label}`}
            >
              <g stroke={COLORS.border} strokeWidth={1}>
                {yTicks.map((v) => <line key={v} x1={box.x} y1={toY(v)} x2={box.x + box.w} y2={toY(v)} />)}
              </g>
              <g fill={COLORS.text2} fontSize={11} fontFamily="Barlow">
                {yTicks.map((v) => <text key={v} x={box.x - 6} y={toY(v) + 4} textAnchor="end">{frNum(v, Math.abs(v) < 10 && v % 1 ? 2 : 0)}</text>)}
                {xTicks.map((t, i) => (
                  <text key={t} x={toX(t)} y={height - 6} textAnchor={i === 0 ? 'start' : 'middle'}>{i === 0 ? `${frNum(t, t % 1 ? 1 : 0)} s` : frNum(t, t % 1 ? 1 : 0)}</text>
                ))}
              </g>
              {secTicks.length ? (
                <g fill={COLORS.info} fontSize={11} fontFamily="Barlow">
                  {secTicks.map((v) => <text key={v} x={box.x + box.w + 6} y={toY(v, ySec) + 4}>{frNum(v, Math.abs(v) < 10 && v % 1 ? 2 : 0)}</text>)}
                </g>
              ) : null}

              {brush ? <rect x={toX(brush.from)} y={box.y} width={toX(brush.to) - toX(brush.from)} height={box.h} fill={COLORS.ok} opacity={0.1} /> : null}

              <g stroke={COLORS.text2} strokeWidth={1} strokeDasharray="3 3">
                {markers.map((m, i) => <line key={i} x1={toX(m.ms / 1000)} y1={box.y} x2={toX(m.ms / 1000)} y2={box.y + box.h} />)}
              </g>
              <g fill={COLORS.text2} fontSize={10} fontFamily="Barlow">
                {markers.map((m, i) => <text key={i} x={toX(m.ms / 1000) + 3} y={box.y + box.h - 4}>{m.label}</text>)}
              </g>

              {ref.length ? <path d={path(ref)} fill="none" stroke={COLORS.text2} strokeWidth={2} strokeDasharray="5 5" strokeLinejoin="round" /> : null}
              {sec.length ? <path d={path(sec, ySec)} fill="none" stroke={COLORS.info} strokeWidth={2} strokeLinejoin="round" /> : null}
              <path d={path(main)} fill="none" stroke={COLORS.ok} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

              <line x1={toX(at)} y1={box.y} x2={toX(at)} y2={box.y + box.h} stroke={COLORS.text} strokeWidth={1} opacity={0.5} />
              {data.columns[plotted]?.[ci] !== undefined && !Number.isNaN(data.columns[plotted]![ci]) ? (
                <circle cx={toX(at)} cy={toY(data.columns[plotted]![ci])} r={4} fill={COLORS.ok} />
              ) : null}
            </svg>
          ) : <div style={{ height }} />}
        </div>
        <div className="between" style={{ marginTop: 8 }}>
          <div className="legend">
            <span><i style={{ background: COLORS.ok }} />{info.label}{info.unit ? ` (${info.unit})` : ''}</span>
            {sec.length && overlay ? <span><i style={{ background: COLORS.info }} />{metricInfo(overlay).label} (axe droit)</span> : null}
            {ref.length ? <span><i style={{ background: `repeating-linear-gradient(90deg, ${COLORS.text2} 0 5px, transparent 5px 10px)` }} />{compareLabel ?? 'Comparaison'}</span> : null}
          </div>
          {zoom ? <GhostButton small title="Vue complète" onClick={() => setZoom(null)} /> : <span className="dim tiny">Glisse sur la courbe pour zoomer</span>}
        </div>
      </Card>

      {/* Lecture instantanée sous le curseur. */}
      <Card>
        <div className="stack-md">
          <div className="between">
            <span className="dim">À <span className="bold" style={{ color: 'var(--text)' }}>{frNum(at, 2)} s</span></span>
            <span className="dim small">ligne {ci + 1} sur {meta.rows}</span>
          </div>
          <div className="readouts">
            {available.map((k) => {
              const i = metricInfo(k);
              const cv = cci >= 0 ? compare?.data.columns[k]?.[cci] : undefined;
              return (
                <div key={k} className={`readout${k === plotted ? ' hl' : ''}`}>
                  <div className="dim tiny ellipsis">{i.label}</div>
                  <div className="v">{fmtV(data.columns[k]?.[ci], k)}</div>
                  <div className="dim tiny">
                    {i.unit}
                    {cv !== undefined && !Number.isNaN(cv) ? <span> · réf. {fmtV(cv, k)}</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
          <div
            className="rail-hit"
            role="slider"
            tabIndex={0}
            aria-label="Position dans le log"
            aria-valuemin={0}
            aria-valuemax={Math.round(durationS * 100) / 100}
            aria-valuenow={Math.round(at * 100) / 100}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              const r = e.currentTarget.getBoundingClientRect();
              setCursor(view.t0 + ((e.clientX - r.left) / r.width) * (view.t1 - view.t0));
            }}
            onPointerMove={(e) => {
              if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
              const r = e.currentTarget.getBoundingClientRect();
              setCursor(view.t0 + ((e.clientX - r.left) / r.width) * (view.t1 - view.t0));
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') setCursor(Math.min(view.t1, at + step * (e.shiftKey ? 10 : 1)));
              else if (e.key === 'ArrowLeft') setCursor(Math.max(view.t0, at - step * (e.shiftKey ? 10 : 1)));
              else return;
              e.preventDefault();
            }}
          >
            <div className="rail"><div className="fill" style={{ width: `${((at - view.t0) / (view.t1 - view.t0 || 1)) * 100}%` }} /></div>
          </div>
          {meta.markers.length ? (
            <div className="chips">
              {meta.markers.map((m, i) => (
                <Chip small key={i} label={`${frNum(m.ms / 1000, 1)} s · ${m.label}`} onClick={() => { setZoom(null); setCursor(m.ms / 1000); }} />
              ))}
            </div>
          ) : null}
        </div>
      </Card>

      <LogStats log={log} compare={compare} />

      {onExport ? (
        <div className="row12">
          <GhostButton title="Exporter CSV" onClick={onExport} />
        </div>
      ) : null}
    </div>
  );
}

function columnStats(data: LogData, key: MetricKey): { min: number; max: number; avg: number } | null {
  const col = data.columns[key];
  if (!col) return null;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let n = 0;
  for (const v of col) {
    if (Number.isNaN(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    n++;
  }
  return n ? { min, max, avg: sum / n } : null;
}

/** Les extrema du log : le résumé que le préparateur lit en premier. */
function LogStats({ log, compare }: { log: ParsedLog; compare?: ParsedLog | null }) {
  const rows = log.meta.keys
    .map((k) => ({ k, s: columnStats(log.data, k), c: compare ? columnStats(compare.data, k) : null }))
    .filter((r) => r.s);
  return (
    <Card>
      <div className="stack-sm">
        <p className="section">Sur tout le log</p>
        <div>
          {rows.map(({ k, s, c }) => {
            const i = metricInfo(k);
            const delta = c ? s!.max - c.max : null;
            return (
              <div key={k} className="stat-row">
                <span className="ellipsis">{i.label}</span>
                <span className="dim" style={{ textAlign: 'right' }}>min {frNum(s!.min, i.decimals)}</span>
                <span className="dim" style={{ textAlign: 'right' }}>moy {frNum(s!.avg, i.decimals)}</span>
                <span className="num" style={{ textAlign: 'right', fontSize: 15 }}>
                  {frNum(s!.max, i.decimals)}
                  {delta !== null && Math.abs(delta) > 0 ? (
                    <span className={delta > 0 ? 'ok' : 'warn'} style={{ fontSize: 12, marginLeft: 4 }}>
                      {delta > 0 ? '+' : ''}{frNum(delta, i.decimals)}
                    </span>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
        <span className="dim tiny">Colonne de droite : maximum atteint{compare ? ', et écart avec le log de comparaison' : ''}.</span>
      </div>
    </Card>
  );
}
