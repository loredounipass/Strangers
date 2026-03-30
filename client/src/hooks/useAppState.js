import { useRef, useCallback } from 'react';

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
 * useAppState — Estado centralizado de la FSM usando una ref mutable.
 * Se usa ref en lugar de useState para evitar re-renders innecesarios,
 * ya que la mayoría de transiciones de estado disparan efectos secundarios
 * (WebRTC, socket) no cambios de UI directos.
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
  });

  const STATE = stateRef.current;

  const setAppState = useCallback((newState) => {
    const old = STATE.appState;
    STATE.appState = newState;
    console.log(`[FSM] ${old} → ${newState}`);
  }, [STATE]);

  const canPerformAction = useCallback((action) => {
    const current = STATE.appState;
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

  return { STATE, setAppState, canPerformAction };
}
