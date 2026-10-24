// Small form controls that commit on blur or Enter, so typing does not create an undo step per key.
import { useEffect, useRef, useState } from 'react';

export function TextField({ label, value, onCommit, multiline, testid, mono, placeholder }: { label: string; value: string; onCommit: (v: string) => void; multiline?: boolean; testid?: string; mono?: boolean; placeholder?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => v !== value && onCommit(v);
  const common = { value: v, 'data-testid': testid, placeholder, className: mono ? 'mono' : undefined, onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => setV(e.target.value), onBlur: commit };
  return (
    <label className="prop">
      <span>{label}</span>
      {multiline ? <textarea rows={3} {...common} /> : <input type="text" {...common} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />}
    </label>
  );
}

export function NumField({ label, value, onCommit, min, max, step = 0.5, testid }: { label: string; value: number; onCommit: (v: number) => void; min?: number; max?: number; step?: number; testid?: string }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const commit = () => {
    const n = Number(v);
    if (Number.isFinite(n) && n !== value && (min === undefined || n >= min) && (max === undefined || n <= max)) onCommit(n);
    else setV(String(value));
  };
  return (
    <label className="prop">
      <span>{label}</span>
      <input type="number" data-testid={testid} value={v} min={min} max={max} step={step} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
    </label>
  );
}

export function Check({ label, checked, onChange, testid }: { label: string; checked: boolean; onChange: (v: boolean) => void; testid?: string }) {
  return (
    <label className="prop check">
      <input type="checkbox" data-testid={testid} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Select<T extends string>({ label, value, options, onChange, testid }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; testid?: string }) {
  return (
    <label className="prop">
      <span>{label}</span>
      <select data-testid={testid} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

/** Focuses an element once when `when` turns true. */
export function useFocusOnce(when: boolean, done: () => void) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (when && ref.current) {
      ref.current.focus();
      ref.current.select();
      done();
    }
  }, [when, done]);
  return ref;
}
