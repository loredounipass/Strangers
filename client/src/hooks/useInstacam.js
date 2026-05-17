import { useRef, useCallback, useEffect } from 'react';

const FILTERS = {
  none:      { label: 'Normal',   css: 'none' },
  grayscale: { label: 'B&N',      css: 'grayscale(1)' },
  sepia:     { label: 'Sepia',    css: 'sepia(1)' },
  invert:    { label: 'Invertir', css: 'invert(1)' },
  vintage:   { label: 'Vintage',  css: 'sepia(0.6) contrast(1.2) brightness(0.9)' },
  cool:      { label: 'Frío',     css: 'hue-rotate(200deg) saturate(0.5) brightness(1.1)' },
  warm:      { label: 'Cálido',   css: 'hue-rotate(30deg) saturate(1.3) brightness(1.1)' },
  neon:      { label: 'Neón',     css: 'saturate(2) contrast(1.5) brightness(1.2)' },
  dreamy:    { label: 'Sueño',    css: 'blur(2px) brightness(1.2) contrast(0.9)' },
  noir:      { label: 'Noir',     css: 'grayscale(1) contrast(1.4) brightness(0.85)' },
  fade:      { label: 'Fade',     css: 'contrast(0.85) saturate(0.6) brightness(1.15)' },
  retro:     { label: 'Retro',    css: 'sepia(0.4) saturate(0.7) hue-rotate(350deg) contrast(1.1)' },
  drama:     { label: 'Drama',    css: 'contrast(1.5) brightness(0.75) saturate(0.8)' },
  vivid:     { label: 'Vívido',   css: 'saturate(1.6) contrast(1.2) brightness(1.05)' },
  soft:      { label: 'Suave',    css: 'brightness(1.2) contrast(0.85) saturate(0.8) blur(0.5px)' },
  matrix:    { label: 'Matrix',   css: 'hue-rotate(90deg) contrast(1.3) brightness(1.1)' },
  lavender:  { label: 'Lavanda',  css: 'hue-rotate(270deg) saturate(0.6) brightness(1.15) sepia(0.15)' },
};

export { FILTERS };

export function useInstacam(containerRef, videoRef) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const streamRef = useRef(null);
  const currentFilter = useRef('none');

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef?.current;
    if (!canvas || !video || !video.videoWidth) {
      rafRef.current = requestAnimationFrame(drawFrame);
      return;
    }

    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -w, 0, w, h);
    ctx.restore();

    rafRef.current = requestAnimationFrame(drawFrame);
  }, [videoRef]);

  const init = useCallback(() => {
    console.log('[FILTER] init canvas', {
      container: !!containerRef?.current,
      video: !!videoRef?.current,
      alreadyRunning: !!rafRef.current,
    });
    if (!containerRef?.current || !videoRef?.current || rafRef.current) return null;

    const container = containerRef.current;
    const video = videoRef.current;

    if (!canvasRef.current) {
      const pipClasses = (video.className || 'video-element video-pip').replace('video-element', 'video-element video-canvas');
      canvasRef.current = document.createElement('canvas');
      canvasRef.current.id = 'filter-canvas';
      canvasRef.current.className = pipClasses;
      canvasRef.current.style.display = 'block';
      container.appendChild(canvasRef.current);
    }

    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;

    const ctx = canvas.getContext('2d');
    ctx.filter = 'none';

    streamRef.current = canvas.captureStream(30);
    console.log('[FILTER] Canvas stream created', {
      size: `${canvas.width}x${canvas.height}`,
      videoTracks: streamRef.current.getVideoTracks().length,
      classes: canvas.className,
    });

    rafRef.current = requestAnimationFrame(drawFrame);
    return streamRef.current;
  }, [containerRef, videoRef, drawFrame]);

  const applyFilter = useCallback((filterKey) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const filter = FILTERS[filterKey];
    if (!filter) return;

    ctx.filter = filter.css;
    currentFilter.current = filterKey;
    console.log('[FILTER] applied', { filterKey, css: filter.css });
  }, []);

  const destroy = useCallback(() => {
    console.log('[FILTER] destroy');
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (canvasRef.current) {
      try { canvasRef.current.remove(); } catch (e) {}
      canvasRef.current = null;
    }
    currentFilter.current = 'none';
  }, []);

  useEffect(() => {
    return () => destroy();
  }, [destroy]);

  return { init, applyFilter, destroy, currentFilter: currentFilter.current };
}
