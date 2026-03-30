/**
 * Controls — Barra de botones cyber de la página de video.
 * Migración exacta del HTML de video.html.
 */
export default function Controls({
  onNext,
  onMute,
  onExit,
  onCamera,
  muteBtnText,
  cameraBtnText,
}) {
  return (
    <div className="controls">
      <button id="nextBtn" className="cyber-button" onClick={onNext}>
        <span className="glitch-text">NEXT</span>
      </button>

      <button id="muteBtn" className="cyber-button" onClick={onMute}>
        <span className="glitch-text">{muteBtnText}</span>
      </button>

      <button id="exitBtn" className="cyber-button exit" onClick={onExit}>
        <span className="glitch-text">EXIT</span>
      </button>

      <button id="cameraBtn" className="cyber-button" onClick={onCamera}>
        <span className="glitch-text">{cameraBtnText}</span>
      </button>
    </div>
  );
}
