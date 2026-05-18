import { useState, useEffect } from 'react';

export function useHashRouter() {
  const [route, setRoute] = useState(window.location.hash || '#/');

  useEffect(() => {
    const handler = () => setRoute(window.location.hash || '#/');
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const roomMatch = route.match(/^#\/room\/(.+)$/);
  const roomId = roomMatch ? roomMatch[1] : null;

  return { route, roomId };
}
