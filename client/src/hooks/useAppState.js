import { useRef, useState, useCallback } from 'react';

// ============================================
// FSM - Finite State Machine
// ============================================
export const AppState = {
  IDLE: 'IDLE',
  CONNECTING: 'CONNECTING',
  MATCHED: 'MATCHED',
  NEGOTIATING: 'NEGOTIATING',
  CONNECTED: 'CONNECTED',
  RECONNECTING: 'RECONNECTING',
  DISCONNECTED: 'DISCONNECTED',
};

/**
 * useAppState — State centralizado de la FSM.
 *
 * Dual-state pattern:
 *  - stateRef.current.appState  → lectura síncrona en callbacks/hooks (sin stale closure)
 *  - appState (useState)        → valor reactivo expuesto a la UI para re-renders
 *
 * Antes (M-01): solo ref → la UI nunca se actualizaba al cambiar el estado FSM.
 * Ahora: setAppState actualiza ambos — la ref Y el estado React.
 */
export function useAppState() {
  const stateRef = useRef({
    appState: AppState.IDLE,
    peer: null,
    localStream: null,
    remoteSocket: null,
    type: null,
    roomid: null,
    socket: null,
    isCameraOff: true,
    isMuted: false,
    isExiting: false,
    isNegotiating: false,
    isReconnecting: false,
    pendingSdp: null,
    pendingIceCandidates: [],
    retryCount: 0,
    videoPlayRetries: 0,
    iceServers: null,
    currentQualityLevel: 'high',
    _iceRestartAttempted: false,
    _iceRestartTime: 0,
  });

  const STATE = stateRef.current;

  // M-01: useState so the UI re-renders on FSM transitions
  const [appState, _setAppStateReact] = useState(AppState.IDLE);

  const setAppState = useCallback((newState) => {
    const old = STATE.appState;
    STATE.appState = newState;       // keep ref in-sync for synchronous reads
    _setAppStateReact(newState);     // trigger re-render for reactive consumers
    console.log(`[FSM] ${old} → ${newState}`);
  }, [STATE]);

  const canPerformAction = useCallback((action) => {
    const current = STATE.appState;  // read from ref (always up-to-date)
    if (action === 'cleanup' || action === 'exit') return true;
    if (
      current === AppState.NEGOTIATING &&
      (action === 'match' || action === 'offer')
    ) return false;
    if (
      current === AppState.RECONNECTING &&
      (action === 'match' || action === 'offer')
    ) return false;
    return true;
  }, [STATE]);

  return { STATE, appState, setAppState, canPerformAction };
}
