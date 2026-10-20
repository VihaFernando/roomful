/** Game mark: a row of identical faces with one that's different. */
export function ImposterIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <rect width="48" height="48" rx="10" fill="#1C1A17" />
      <circle cx="13" cy="24" r="6" fill="#F5F1E8" />
      <circle cx="24" cy="24" r="6" fill="#F5F1E8" />
      <circle cx="35" cy="24" r="6" fill="#FF5A1F" />
      <path d="M11 23.5h4M22 23.5h4" stroke="#1C1A17" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M33 22.5l4 2" stroke="#1C1A17" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
