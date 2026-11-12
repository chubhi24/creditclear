export function Field({ label, hint, error, children, prefix }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink">{label}</span>
      <div className="relative mt-2">
        {prefix ? (
          <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sm text-ink-faint">{prefix}</span>
        ) : null}
        {children}
      </div>
      {error ? (
        <span className="mt-2 flex items-center gap-1.5 text-xs font-medium text-ink" role="alert">
          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-ink text-[9px] leading-none">!</span>
          {error}
        </span>
      ) : hint ? (
        <span className="mt-2 block text-xs leading-relaxed text-ink-muted">{hint}</span>
      ) : null}
    </label>
  );
}

const inputClass =
  "w-full rounded-2xl border border-line bg-surface px-4 py-3 text-[15px] text-ink placeholder:text-ink-faint outline-none transition-colors duration-200 hover:border-ink-faint/60 focus:border-sage focus:ring-4 focus:ring-sage/15 aria-[invalid=true]:border-ink";

export function TextInput({ className = "", prefix, ...props }) {
  return <input className={`${inputClass} ${prefix ? "pl-9" : ""} ${className}`} {...props} />;
}

export function Select({ className = "", children, ...props }) {
  return (
    <select
      className={`${inputClass} appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%235C5C5C'%3E%3Cpath d='M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4z'/%3E%3C/svg%3E")] bg-[length:18px] bg-[right_1rem_center] bg-no-repeat pr-10 ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

/** Segmented choice for short option lists. */
export function Choice({ options, value, onChange, name }) {
  return (
    <div role="radiogroup" aria-label={name} className="grid gap-2 sm:grid-cols-2">
      {options.map(([id, label]) => {
        const selected = value === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(id)}
            className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition-colors duration-200 ${
              selected ? "border-sage bg-sage-tint text-ink" : "border-line bg-surface text-ink-muted hover:border-ink-faint/60 hover:text-ink"
            }`}
          >
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${selected ? "border-sage" : "border-ink-faint"}`}
            >
              {selected ? <span className="h-2 w-2 rounded-full bg-sage" /> : null}
            </span>
            {label}
          </button>
        );
      })}
    </div>
  );
}
