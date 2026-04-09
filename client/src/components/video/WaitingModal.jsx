import { AppState } from '../../hooks/useAppState.js';

// M-01: Map FSM states to human-readable labels shown in the waiting overlay
const STATE_LABELS = {
  [AppState.IDLE]:         'Listo para conectar',
  [AppState.CONNECTING]:   'Conectando al servidor\u2026',
  [AppState.MATCHED]:      'Pareja encontrada\u2026',
  [AppState.NEGOTIATING]:  'Estableciendo conexi\u00f3n\u2026',
  [AppState.CONNECTED]:    'Conectado',
  [AppState.RECONNECTING]: 'Reconectando\u2026',
  [AppState.DISCONNECTED]: 'Buscando nueva pareja\u2026',
};

/**
 * WaitingModal — Modal de "Waiting" con spinner animado.
 * Ahora muestra texto din\u00e1mico seg\u00fan el estado FSM (M-01).
 */
export default function WaitingModal({ visible, appState }) {
  if (!visible) return null;

  const label = STATE_LABELS[appState] ?? 'Buscando pareja\u2026';

  return (
    <div className="modal" id="modal">
      <div id="spinner">
        <span className="loading-text">{label}</span>
        <div className="loading-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </div>
  );
}
