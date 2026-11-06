export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight text-slate-900 ${className}`}>
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#ea580c" />
        <path d="M6 17 16 8l10 9" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 15.5V24h12v-8.5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinejoin="round" />
      </svg>
      <span className="text-lg">Ridge & Beam</span>
    </span>
  );
}
