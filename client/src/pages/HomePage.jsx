import { useNavigate } from 'react-router-dom';

/**
 * HomePage — Migración exacta de index.html
 * La clase .page-index-root reemplaza a `html.page-index body` del CSS original.
 */
export default function HomePage() {
  const navigate = useNavigate();

  function handleStart() {
    navigate('/video');
  }

  return (
    <div className="page-index-root">
      <div className="index-wrapper">
        <img
          src="/black yellow minimalist Idea Logo.gif"
          alt="Strangers logo"
        />
        <button className="btn-start" onClick={handleStart}>
          Start
        </button>
      </div>
    </div>
  );
}
