import { useState, useEffect } from 'react';

/** Tracks whether the viewport is at or below `breakpoint` (default 768px, standard
 * tablet/phone cutoff), updating live on window resize/orientation change. */
export default function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= breakpoint : false
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= breakpoint);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);

  return isMobile;
}
