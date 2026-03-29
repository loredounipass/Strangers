// Media Module - Production Ready

export async function getNativeVideoConstraints() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === 'videoinput');
    
    if (videoDevices.length === 0) {
      return {
        width: { ideal: 1280, min: 640 },
        height: { ideal: 720, min: 480 },
        frameRate: { ideal: 30, min: 24 },
        facingMode: "user"
      };
    }
    
    const deviceId = videoDevices[0].deviceId;
    const capabilities = navigator.mediaDevices.getSupportedConstraints();
    
    // Start with more conservative constraints
    const constraints = {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      width: { ideal: 1280, max: 1280, min: 640 },
      height: { ideal: 720, max: 720, min: 480 },
      frameRate: { ideal: 30, min: 24 },
      facingMode: "user"
    };
    
    if (!capabilities.deviceId) {
      delete constraints.deviceId;
    }
    
    return constraints;
  } catch (err) {
    console.warn('[MEDIA] Error getting native constraints:', err);
    return getFallbackVideoConstraints();
  }
}

export function getFallbackVideoConstraints() {
  return {
    width: { ideal: 1280, min: 640 },
    height: { ideal: 720, min: 480 },
    frameRate: { ideal: 30, min: 24 },
    facingMode: "user"
  };
}

export function getMinimalVideoConstraints() {
  return {
    width: { ideal: 640, min: 320 },
    height: { ideal: 480, min: 240 },
    frameRate: { ideal: 24, min: 15 },
    facingMode: "user"
  };
}

export async function getMediaStream(videoConstraints, audioConstraints = {}) {
  const defaultAudio = {
    echoCancellation: { ideal: true },
    noiseSuppression: { ideal: true },
    autoGainControl: { ideal: true }
  };
  
  return navigator.mediaDevices.getUserMedia({
    audio: { ...defaultAudio, ...audioConstraints },
    video: videoConstraints
  });
}

export async function getMediaStreamWithFallback(onFallback) {
  // Try with high quality first
  const highConstraints = await getNativeVideoConstraints();
  
  try {
    return await getMediaStream(highConstraints);
  } catch (err) {
    console.warn('[MEDIA] High quality failed, trying fallback:', err.name);
    
    // Try with fallback constraints
    const fallbackConstraints = getFallbackVideoConstraints();
    
    try {
      return await getMediaStream(fallbackConstraints);
    } catch (fallbackErr) {
      console.warn('[MEDIA] Fallback failed, trying minimal:', fallbackErr.name);
      
      // Try with minimal constraints
      const minimalConstraints = getMinimalVideoConstraints();
      
      try {
        return await getMediaStream(minimalConstraints);
      } catch (minimalErr) {
        console.error('[MEDIA] All video constraints failed:', minimalErr.name);
        
        // Try audio only
        if (onFallback) onFallback(minimalErr);
        
        try {
          return await getAudioOnlyStream();
        } catch (audioErr) {
          console.error('[MEDIA] Even audio failed:', audioErr.name);
          throw audioErr;
        }
      }
    }
  }
}

export async function getAudioOnlyStream() {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: { ideal: true },
      noiseSuppression: { ideal: true },
      autoGainControl: { ideal: true }
    },
    video: false
  });
}

export function stopMediaStream(stream) {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
}

export async function applyVideoSettings(videoTrack, settings = {}) {
  if (!videoTrack) return;
  
  const defaultSettings = {
    advanced: [
      { brightness: 0.5, contrast: 1.0, saturation: 1.2 }
    ]
  };
  
  try {
    await videoTrack.applyConstraints({
      ...defaultSettings,
      ...settings
    });
  } catch (err) {
    console.warn('[MEDIA] Error applying video settings:', err);
  }
}

export function enableVideoTracks(stream) {
  if (stream) {
    stream.getVideoTracks().forEach(track => {
      track.enabled = true;
    });
  }
}

export function disableVideoTracks(stream) {
  if (stream) {
    stream.getVideoTracks().forEach(track => {
      track.enabled = false;
    });
  }
}

export function enableAudioTracks(stream) {
  if (stream) {
    stream.getAudioTracks().forEach(track => {
      track.enabled = true;
    });
  }
}

export function disableAudioTracks(stream) {
  if (stream) {
    stream.getAudioTracks().forEach(track => {
      track.enabled = false;
    });
  }
}

export function getStreamTracks(stream) {
  if (!stream) return { video: [], audio: [] };
  
  return {
    video: stream.getVideoTracks(),
    audio: stream.getAudioTracks()
  };
}
