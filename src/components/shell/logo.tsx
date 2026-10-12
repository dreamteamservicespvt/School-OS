/** School mark: a rising sun over three lines (rows of a register). */
export function Logo({ size = 36 }: { size?: number }) {
  return (
    <span className="grid place-items-center rounded-xl bg-brand text-brandink shrink-0" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none">
        <path d="M5 14a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M12 3.5v2M4.6 6.6l1.4 1.4M19.4 6.6 18 8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M3 17.5h18M6 21h12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    </span>
  );
}
