import { useEffect, useState } from 'react';

export function useHashRoute() {
  const read = () => (typeof window === 'undefined' ? '/' : window.location.hash.replace(/^#/, '') || '/');
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
