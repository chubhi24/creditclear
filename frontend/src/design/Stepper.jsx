export function Stepper({ steps, current }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-ink-muted">
        <span>
          Step {current + 1} of {steps.length}
        </span>
        <span className="font-medium text-ink">{steps[current]}</span>
      </div>
      <div className="mt-3 flex gap-1.5" aria-hidden="true">
        {steps.map((step, index) => (
          <span
            key={step}
            className={`h-1 flex-1 rounded-full transition-colors duration-500 ${index <= current ? "bg-ink" : "bg-line"}`}
          />
        ))}
      </div>
    </div>
  );
}
