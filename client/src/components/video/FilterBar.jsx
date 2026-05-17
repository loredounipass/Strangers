import { FILTERS } from '../../hooks/useInstacam.js';

export default function FilterBar({ activeFilter, onSelectFilter, visible }) {
  if (!visible) return null;

  // Excluir 'none' — el usuario desactiva filtros con el botón toggle, no desde aquí
  const entries = Object.entries(FILTERS).filter(([key]) => key !== 'none');

  // Separar CSS y pixel filters para mejor organización visual
  const cssFilters = entries.filter(([, f]) => f.type === 'css');
  const pixelFilters = entries.filter(([, f]) => f.type === 'pixel');

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
        {cssFilters.map(([key, filter]) => (
          <button
            key={key}
            className={`ig-filter-item ${activeFilter === key ? 'active' : ''}`}
            onClick={() => onSelectFilter(key)}
          >
            <div 
              className="ig-filter-circle" 
              style={{ filter: filter.type === 'css' ? filter.css : 'none' }}
            >
              {/* The background image is set via CSS, but the filter applies to it! */}
            </div>
            <span className="ig-filter-label">{filter.label}</span>
          </button>
        ))}

        {pixelFilters.map(([key, filter]) => (
          <button
            key={key}
            className={`ig-filter-item ${activeFilter === key ? 'active' : ''}`}
            onClick={() => onSelectFilter(key)}
          >
            <div className="ig-filter-circle pixel-style"></div>
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
