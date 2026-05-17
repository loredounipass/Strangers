import { FILTERS } from '../../hooks/useInstacam.js';

export default function FilterBar({ activeFilter, onSelectFilter, visible }) {
  if (!visible) return null;

  const entries = Object.entries(FILTERS);

  return (
    <div className="filter-bar-wrap">
      <button
        className="filter-arrow"
        onClick={(e) => {
          const el = e.currentTarget.parentElement.querySelector('.filter-bar');
          el?.scrollBy({ left: -120, behavior: 'smooth' });
        }}
        aria-label="Scroll left"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <div className="filter-bar">
        {entries.map(([key, filter]) => (
          <button
            key={key}
            className={`ig-filter-item ${activeFilter === key ? 'active' : ''}`}
            onClick={() => onSelectFilter(key)}
          >
            <div 
              className={`ig-filter-circle ${filter.type === 'pixel' ? 'pixel-style' : ''} ${filter.type === 'ar' ? 'ar-style' : ''}`} 
              style={{ filter: filter.type === 'css' ? filter.css : 'none' }}
            >
              {/* Para filtros 'none', se verá limpio. Para AR se puede añadir un icono con CSS en ar-style si se desea */}
            </div>
            <span className="ig-filter-label">{filter.label}</span>
          </button>
        ))}
      </div>

      <button
        className="filter-arrow"
        onClick={(e) => {
          const el = e.currentTarget.parentElement.querySelector('.filter-bar');
          el?.scrollBy({ left: 120, behavior: 'smooth' });
        }}
        aria-label="Scroll right"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
  );
}
