import { forwardRef, useEffect, useRef } from 'react';
import WaitingModal from './WaitingModal.jsx';
import Controls from './Controls.jsx';

/**
 * VideoHolder — Contenedor principal de los dos streams de video.
 * Expone refs de los elementos <video> al padre via forwardRef.
 */
const VideoHolder = forwardRef(function VideoHolder(
  {
    spinnerVisible,
    onNext,
    onMute,
    onExit,
    onCamera,
    muteBtnText,
    cameraBtnText,
  },
  ref
) {
  // ref es { myVideoRef, strangerVideoRef } pasado desde VideoPage
  const { myVideoRef, strangerVideoRef } = ref || {};

  return (
    <div className="video-holder">
      {/* Video del extraño (pantalla completa) */}
      <video
        autoPlay
        playsInline
        muted
        id="video"
        ref={strangerVideoRef}
      />

      {/* Video propio (PiP circular) */}
      <video
        autoPlay
        muted
        id="my-video"
        ref={myVideoRef}
      />

      <Controls
        onNext={onNext}
        onMute={onMute}
        onExit={onExit}
        onCamera={onCamera}
        muteBtnText={muteBtnText}
        cameraBtnText={cameraBtnText}
      />

      <WaitingModal visible={spinnerVisible} />
    </div>
  );
});

export default VideoHolder;
