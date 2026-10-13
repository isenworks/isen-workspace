import { useState, useEffect } from 'react';

/* 响应式媒体查询 hook（SSR 安全：无 window 时返回 false） */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/* 窄屏（移动端）：与 index.css 的抽屉断点保持一致（max-width: 1023px ≡ Tailwind lg） */
export const useIsNarrow = () => useMediaQuery('(max-width: 1023px)');