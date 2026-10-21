/** Game mark: a fedora under a crescent moon. */
export function MafiaIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <rect width="48" height="48" rx="10" fill="#1C1A17" />
      <circle cx="34" cy="13" r="5.5" fill="#F5F1E8" />
      <circle cx="31.6" cy="11.4" r="4.8" fill="#1C1A17" />
      <path d="M15.5 33c0-7 2.2-12 8.5-12s8.5 5 8.5 12Z" fill="#F5F1E8" />
      <path d="M20 22.6q4 2.6 8 0" stroke="#1C1A17" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <rect x="15.5" y="28.6" width="17" height="3.2" fill="#FF5A1F" />
      <ellipse cx="24" cy="34" rx="15" ry="3.3" fill="#F5F1E8" />
    </svg>
  );
}
