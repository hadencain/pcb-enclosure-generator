import { useState } from 'react';

interface NumProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  unit?: string;
}

/** Numeric field with a monospace right-aligned input and a unit suffix.
 *  Keeps a local draft so clearing the box to retype doesn't snap the value to 0. */
export function NumberField({ label, value, onChange, step = 0.1, unit = 'mm' }: NumProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(value);
  return (
    <label className="field">
      <span>{label}</span>
      <span className="input">
        <input
          type="number"
          step={step}
          value={shown}
          onChange={e => {
            setDraft(e.target.value);
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v)) onChange(v);
          }}
          onBlur={() => setDraft(null)}
        />
        {unit && <span className="unit">{unit}</span>}
      </span>
    </label>
  );
}

interface SegProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}

/** Segmented control — one option lit in phosphor mint. */
export function Seg<T extends string>({ value, options, onChange }: SegProps<T>) {
  return (
    <div className="seg">
      {options.map(o => (
        <button key={o.value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
