export function Button({ children, variant = "primary", className = "", disabled, ...props }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-faint";
  const styles = {
    primary: "bg-ink text-white hover:bg-[#2a2a2a]",
    secondary: "bg-surface text-ink border border-line hover:border-ink-faint",
    ghost: "text-ink-muted hover:text-ink",
    danger: "bg-danger text-white hover:bg-danger-deep",
  };

  return (
    <button className={`${base} ${styles[variant]} ${className}`} disabled={disabled} {...props}>
      {children}
    </button>
  );
}
