/**
 * WaitingModal — Modal de "Waiting for someone" con spinner animado.
 * Migración exacta del HTML original en video.html.
 */
export default function WaitingModal({ visible }) {
  if (!visible) return null;

  return (
    <div className="modal" id="modal">
      <div id="spinner">
        <span className="loading-text">Waiting for someone</span>
        <div className="loading-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </div>
  );
}
