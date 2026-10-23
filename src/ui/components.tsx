/**
 * components.tsx — les briques de l'interface, reprises de l'app mobile
 * (Tarmac/src/ui/components.tsx). Mêmes noms, mêmes rôles : un seul bouton
 * vert par écran, des actions secondaires au contour, des cartes carbone.
 */
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { ChevronLeft } from './icons';

type Tone = 'ok' | 'warn' | 'info' | 'danger';

export function Card({
  children,
  tone,
  deep,
  className = '',
  to,
}: {
  children: ReactNode;
  tone?: Tone;
  deep?: boolean;
  className?: string;
  to?: string;
}) {
  const cls = ['card', deep && 'deep', tone && `tone-${tone}`, to && 'link', className].filter(Boolean).join(' ');
  return to ? <Link to={to} className={cls}>{children}</Link> : <div className={cls}>{children}</div>;
}

/** Barre de titre avec flèche retour. */
export function Header({ title, subtitle, back, right }: { title: string; subtitle?: ReactNode; back?: string | true; right?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="page-head">
      {back ? (
        <button
          type="button"
          className="btn-round"
          aria-label="Retour"
          onClick={() => (back === true ? navigate(-1) : navigate(back))}
        >
          <ChevronLeft />
        </button>
      ) : null}
      <div className="titles">
        <h1 className="h1" style={{ fontSize: 24 }}>{title}</h1>
        {subtitle ? <div className="dim small" style={{ marginTop: 2 }}>{subtitle}</div> : null}
      </div>
      {right}
    </div>
  );
}

export function PrimaryButton({
  title,
  onClick,
  icon,
  disabled,
  busy,
  type = 'button',
  className = '',
  href,
}: {
  title: string;
  onClick?: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  busy?: boolean;
  type?: 'button' | 'submit';
  className?: string;
  href?: string;
}) {
  const inner = (
    <>
      {busy ? <span className="dot pulse" style={{ background: 'var(--bg)', width: 10, height: 10, borderRadius: 5 }} /> : icon}
      {title}
    </>
  );
  if (href) return <a className={`btn btn-primary ${className}`} href={href}>{inner}</a>;
  return (
    <button type={type} className={`btn btn-primary ${className}`} onClick={onClick} disabled={disabled || busy}>
      {inner}
    </button>
  );
}

/** Action secondaire : contour seul, jamais de fond plein. */
export function GhostButton({
  title,
  onClick,
  tone,
  disabled,
  small,
  icon,
  to,
  className = '',
}: {
  title: string;
  onClick?: () => void;
  tone?: 'danger';
  disabled?: boolean;
  small?: boolean;
  icon?: ReactNode;
  to?: string;
  className?: string;
}) {
  const cls = ['btn btn-ghost', tone, small && 'sm', className].filter(Boolean).join(' ');
  if (to) return <Link className={cls} to={to}>{icon}{title}</Link>;
  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled}>
      {icon}
      {title}
    </button>
  );
}

export function Chip({ label, active, onClick, small }: { label: string; active?: boolean; onClick?: () => void; small?: boolean }) {
  return (
    <button type="button" className={`chip${active ? ' active' : ''}${small ? ' sm' : ''}`} aria-pressed={active} onClick={onClick}>
      {label}
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className={o.value === value ? 'active' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ value, onChange, label, hint }: { value: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className={`switch${value ? ' on' : ''}`}>
      <span>
        <span className="semi">{label}</span>
        {hint ? <span className="dim small" style={{ display: 'block' }}>{hint}</span> : null}
      </span>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} />
      <span className="track"><span className="knob" style={{ display: 'block' }} /></span>
    </label>
  );
}

export function Field({
  label,
  hint,
  multiline,
  ...input
}: {
  label: string;
  hint?: string;
  multiline?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement> & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = input.id ?? input.name ?? label;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {multiline ? <textarea id={id} className="textarea" {...input} /> : <input id={id} className="input" {...input} />}
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function StatusPill({ tone, label }: { tone: Tone | 'neutral'; label: string }) {
  return (
    <span className={`pill ${tone}`}>
      <span className="dot" style={{ background: 'currentColor' }} />
      {label}
    </span>
  );
}

export function Loading({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="empty row8" style={{ justifyContent: 'center' }}>
      <span className="dot pulse" style={{ background: 'var(--ok)' }} />
      {label}
    </div>
  );
}

export function ErrorBanner({ error }: { error: unknown }) {
  if (!error) return null;
  return <div className="banner danger">{error instanceof Error ? error.message : String(error)}</div>;
}

/** Tuile chiffrée : un libellé, une valeur en Barlow Condensed, une unité. */
export function Stat({ label, value, unit, tone }: { label: string; value: ReactNode; unit?: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className="tile">
      <div className="dim tiny ellipsis">{label}</div>
      <div className={`num ${tone ?? ''}`} style={{ fontSize: 28, lineHeight: 1.1 }}>
        {value}
        {unit ? <span className="dim" style={{ fontSize: 14, marginLeft: 3 }}>{unit}</span> : null}
      </div>
    </div>
  );
}
