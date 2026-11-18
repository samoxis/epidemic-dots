import { useEffect, useState } from 'react';

/** Counts from 0 up to `value` (ease-out, about 0.8 s). Shows the value at once with reduced motion. */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ? value : 0
  );
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || value <= 0) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 800);
      setShown(Math.round(value * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <span className={className} aria-label={String(value)}>
      {shown}
    </span>
  );
}
