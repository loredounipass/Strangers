import { useRef, useState, useEffect } from 'react';
import { FILTERS } from '../../hooks/useInstacam.js';

export default function FilterBar({ activeFilter, onSelectFilter, visible }) {
  const scrollRef = useRef(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const update = () => {
      setShowLeft(el.scrollLeft > 4);
      setShowRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
    };

    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);

    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, []);

  if (!visible) return null;

  const entries = Object.entries(FILTERS);

  return (
    <div className="filter-bar-wrap">
      <button
        className={`filter-arrow ${showLeft ? '' : 'hidden'}`}
        onClick={() => scrollRef.current?.scrollBy({ left: -120, behavior: 'smooth' })}
        aria-label="Scroll left"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <div className="filter-bar" ref={scrollRef}>
        {entries.map(([key, filter]) => (
          <button
            key={key}
            className={`filter-btn ${activeFilter === key ? 'active' : ''}`}
            onClick={() => onSelectFilter(key)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <button
        className={`filter-arrow ${showRight ? '' : 'hidden'}`}
        onClick={() => scrollRef.current?.scrollBy({ left: 120, behavior: 'smooth' })}
        aria-label="Scroll right"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
  );
}
