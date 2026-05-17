import { useRef, useCallback, useEffect } from 'react';

/**
 * FILTERS — Catálogo completo de filtros alineados con la librería instacam.
 * Referencia: https://github.com/xavierfoucrier/instacam/blob/main/DOCUMENTATION.md
 *
 * Propiedades CSS de instacam (source: src/instacam.js _compute()):
 *   opacity, brightness, contrast, saturate, hue-rotate, invert, grayscale, sepia, blur
 *
 * Filtros custom de instacam (source: demo + DOCUMENTATION.md#filter):
 *   random noise, threshold, pixelate, soft-sobel, color inversion
 *
 * type: 'css' = filtro CSS puro via ctx.filter
 * type: 'pixel' = filtro custom por manipulación de píxeles (como instacam filter callback)
 */
const FILTERS = {
  // ── Filtros CSS puros (propiedades directas de instacam) ──
  none:       { label: 'Normal',    type: 'css', css: 'none' },
  grayscale:  { label: 'B&N',       type: 'css', css: 'grayscale(1)' },
  sepia:      { label: 'Sepia',     type: 'css', css: 'sepia(1)' },
  invert:     { label: 'Invertir',  type: 'css', css: 'invert(1)' },
  blur:       { label: 'Blur',      type: 'css', css: 'blur(3px)' },

  // ── Combinaciones de propiedades CSS instacam ──
  vintage:    { label: 'Vintage',   type: 'css', css: 'sepia(0.6) contrast(1.2) brightness(0.9)' },
  cool:       { label: 'Frío',      type: 'css', css: 'hue-rotate(200deg) saturate(0.5) brightness(1.1)' },
  warm:       { label: 'Cálido',    type: 'css', css: 'hue-rotate(30deg) saturate(1.3) brightness(1.1)' },
  neon:       { label: 'Neón',      type: 'css', css: 'saturate(2) contrast(1.5) brightness(1.2)' },
  dreamy:     { label: 'Sueño',     type: 'css', css: 'blur(1.5px) brightness(1.2) contrast(0.9)' },
  noir:       { label: 'Noir',      type: 'css', css: 'grayscale(1) contrast(1.4) brightness(0.85)' },
  fade:       { label: 'Fade',      type: 'css', css: 'contrast(0.85) saturate(0.6) brightness(1.15)' },
  retro:      { label: 'Retro',     type: 'css', css: 'sepia(0.4) saturate(0.7) hue-rotate(350deg) contrast(1.1)' },
  drama:      { label: 'Drama',     type: 'css', css: 'contrast(1.5) brightness(0.75) saturate(0.8)' },
  vivid:      { label: 'Vívido',    type: 'css', css: 'saturate(1.6) contrast(1.2) brightness(1.05)' },
  soft:       { label: 'Suave',     type: 'css', css: 'brightness(1.15) contrast(0.85) saturate(0.8)' },
  matrix:     { label: 'Matrix',    type: 'css', css: 'hue-rotate(90deg) contrast(1.3) brightness(1.1)' },
  lavender:   { label: 'Lavanda',   type: 'css', css: 'hue-rotate(270deg) saturate(0.6) brightness(1.15) sepia(0.15)' },
  sunset:     { label: 'Atardecer', type: 'css', css: 'hue-rotate(15deg) saturate(1.5) brightness(1.1) contrast(1.1)' },
  ocean:      { label: 'Océano',    type: 'css', css: 'hue-rotate(180deg) saturate(0.7) brightness(1.05)' },
  rose:       { label: 'Rosa',      type: 'css', css: 'hue-rotate(330deg) saturate(1.2) brightness(1.1) sepia(0.1)' },
  emerald:    { label: 'Esmeralda', type: 'css', css: 'hue-rotate(120deg) saturate(0.8) brightness(1.1) contrast(1.1)' },
  amber:      { label: 'Ámbar',     type: 'css', css: 'sepia(0.35) saturate(1.4) brightness(1.05) hue-rotate(5deg)' },
  ice:        { label: 'Hielo',     type: 'css', css: 'hue-rotate(210deg) saturate(0.4) brightness(1.2) contrast(0.9)' },
  chrome:     { label: 'Chrome',    type: 'css', css: 'contrast(1.3) saturate(1.3) brightness(1.05)' },
  midnight:   { label: 'Medianoche',type: 'css', css: 'brightness(0.7) contrast(1.3) hue-rotate(240deg) saturate(0.5)' },
  cinematic:  { label: 'Cine',      type: 'css', css: 'contrast(1.2) brightness(0.9) saturate(0.85) sepia(0.1)' },
  xray:       { label: 'Rayos X',   type: 'css', css: 'invert(1) grayscale(1) contrast(1.5)' },
  faded_warm: { label: 'Cálido+',   type: 'css', css: 'sepia(0.25) contrast(0.9) brightness(1.15) saturate(1.1)' },
  electric:   { label: 'Eléctrico', type: 'css', css: 'saturate(2.5) contrast(1.4) brightness(1.1) hue-rotate(10deg)' },
  ghost:      { label: 'Fantasma',  type: 'css', css: 'opacity(0.7) brightness(1.3) contrast(0.8) grayscale(0.3)' },

  // ── Filtros custom pixel (como instacam filter callback) ──
  noise:      { label: 'Ruido',     type: 'pixel', fn: 'noise' },
  threshold:  { label: 'Umbral',    type: 'pixel', fn: 'threshold' },
  pixelate:   { label: 'Pixel',     type: 'pixel', fn: 'pixelate' },
  sobel:      { label: 'Bordes',    type: 'pixel', fn: 'sobel' },
  negative:   { label: 'Negativo',  type: 'pixel', fn: 'negative' },
  posterize:  { label: 'Póster',    type: 'pixel', fn: 'posterize' },
  emboss:     { label: 'Relieve',   type: 'pixel', fn: 'emboss' },
};

export { FILTERS };

/**
 * Filtros pixel — implementaciones basadas en la API filter() de instacam.
 * Cada función recibe imageData y lo modifica in-place.
 */
const pixelFilters = {
  // Documentación instacam: random noise filter
  noise(imageData) {
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const rand = (Math.random() - 0.5) * 60;
      data[i]     += rand;
      data[i + 1] += rand;
      data[i + 2] += rand;
    }
  },

  // Documentación instacam: threshold filter
  threshold(imageData) {
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const avg = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      const val = avg >= 128 ? 255 : 0;
      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
    }
  },

  // Documentación instacam: color inversion (pixel-level)
  negative(imageData) {
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i]     = 255 - data[i];
      data[i + 1] = 255 - data[i + 1];
      data[i + 2] = 255 - data[i + 2];
    }
  },

  // Instacam demo: pixelate filter
  pixelate(imageData, w, h) {
    const data = imageData.data;
    const size = 8;
    for (let y = 0; y < h; y += size) {
      for (let x = 0; x < w; x += size) {
        const idx = (y * w + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        for (let dy = 0; dy < size && y + dy < h; dy++) {
          for (let dx = 0; dx < size && x + dx < w; dx++) {
            const i = ((y + dy) * w + (x + dx)) * 4;
            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
          }
        }
      }
    }
  },

  // Instacam demo: soft-sobel edge detection
  sobel(imageData, w, h) {
    const src = new Uint8ClampedArray(imageData.data);
    const data = imageData.data;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = (y * w + x) * 4;
        // Grayscale neighbors
        const tl = src[((y-1)*w+(x-1))*4] * 0.3 + src[((y-1)*w+(x-1))*4+1] * 0.59 + src[((y-1)*w+(x-1))*4+2] * 0.11;
        const t  = src[((y-1)*w+x)*4] * 0.3 + src[((y-1)*w+x)*4+1] * 0.59 + src[((y-1)*w+x)*4+2] * 0.11;
        const tr = src[((y-1)*w+(x+1))*4] * 0.3 + src[((y-1)*w+(x+1))*4+1] * 0.59 + src[((y-1)*w+(x+1))*4+2] * 0.11;
        const l  = src[(y*w+(x-1))*4] * 0.3 + src[(y*w+(x-1))*4+1] * 0.59 + src[(y*w+(x-1))*4+2] * 0.11;
        const r  = src[(y*w+(x+1))*4] * 0.3 + src[(y*w+(x+1))*4+1] * 0.59 + src[(y*w+(x+1))*4+2] * 0.11;
        const bl = src[((y+1)*w+(x-1))*4] * 0.3 + src[((y+1)*w+(x-1))*4+1] * 0.59 + src[((y+1)*w+(x-1))*4+2] * 0.11;
        const b  = src[((y+1)*w+x)*4] * 0.3 + src[((y+1)*w+x)*4+1] * 0.59 + src[((y+1)*w+x)*4+2] * 0.11;
        const br = src[((y+1)*w+(x+1))*4] * 0.3 + src[((y+1)*w+(x+1))*4+1] * 0.59 + src[((y+1)*w+(x+1))*4+2] * 0.11;
        const gx = -tl - 2*l - bl + tr + 2*r + br;
        const gy = -tl - 2*t - tr + bl + 2*b + br;
        const val = Math.min(255, Math.sqrt(gx * gx + gy * gy));
        data[idx] = val;
        data[idx + 1] = val;
        data[idx + 2] = val;
        data[idx + 3] = 255;
      }
    }
  },

  // Posterize — reduce color levels
  posterize(imageData) {
    const data = imageData.data;
    const levels = 4;
    const step = 255 / levels;
    for (let i = 0; i < data.length; i += 4) {
      data[i]     = Math.round(data[i] / step) * step;
      data[i + 1] = Math.round(data[i + 1] / step) * step;
      data[i + 2] = Math.round(data[i + 2] / step) * step;
    }
  },

  // Emboss — relief effect
  emboss(imageData, w, h) {
    const src = new Uint8ClampedArray(imageData.data);
    const data = imageData.data;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) {
          const val = -src[((y-1)*w+(x-1))*4+c] - src[((y-1)*w+x)*4+c]
                      + src[((y+1)*w+x)*4+c] + src[((y+1)*w+(x+1))*4+c] + 128;
          data[idx + c] = Math.max(0, Math.min(255, val));
        }
        data[idx + 3] = 255;
      }
    }
  },
};

/**
 * useInstacam — Hook para aplicar filtros en tiempo real al video local.
 *
 * Soporta dos tipos de filtros alineados con la librería instacam:
 * 1. CSS filters (via ctx.filter) — para brightness, contrast, hue, etc.
 * 2. Pixel filters (via getImageData/putImageData) — para noise, threshold, pixelate, sobel
 */
export function useInstacam(containerRef, videoRef) {
  const canvasRef = useRef(null);
  const hiddenVideoRef = useRef(null);
  const ctxRef = useRef(null);
  const rafRef = useRef(null);
  const streamRef = useRef(null);
  const currentFilterRef = useRef('none');
  const isRunningRef = useRef(false);

  /**
   * drawFrame — Loop de renderizado alineado con instacam._capture() loop.
   * Aplica filtro CSS o pixel en cada frame.
   */
  const drawFrame = useCallback(() => {
    if (!isRunningRef.current) return;

    const canvas = canvasRef.current;
    const video = hiddenVideoRef?.current; // Leer del video oculto, no del visible

    if (!canvas || !video) {
      rafRef.current = requestAnimationFrame(drawFrame);
      return;
    }

    // Adaptar canvas si la resolución de video cambia
    if (video.videoWidth && video.videoHeight) {
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
    }

    if (!video.videoWidth || !video.videoHeight) {
      rafRef.current = requestAnimationFrame(drawFrame);
      return;
    }

    const ctx = ctxRef.current;
    if (!ctx) {
      rafRef.current = requestAnimationFrame(drawFrame);
      return;
    }

    const w = canvas.width;
    const h = canvas.height;
    const filterKey = currentFilterRef.current;
    const filterDef = FILTERS[filterKey];

    if (!filterDef || filterDef.type === 'css') {
      // ── Filtro CSS (como instacam _compute() + viewport.style.filter) ──
      const filterCss = filterDef?.css || 'none';

      // IMPORTANTE: ctx.filter debe ir DENTRO del save/restore block.
      // save() guarda el estado sin filtro, luego ponemos filtro + scale,
      // drawImage se renderiza con ambos, restore() los limpia para el próximo frame.
      ctx.save();
      ctx.filter = filterCss;
      ctx.scale(-1, 1);
      ctx.drawImage(video, -w, 0, w, h);
      ctx.restore();
    } else if (filterDef.type === 'pixel') {
      // ── Filtro pixel (como instacam filter callback + _filter()) ──
      // Primero dibujar sin filtro CSS
      ctx.save();
      ctx.filter = 'none';
      ctx.scale(-1, 1);
      ctx.drawImage(video, -w, 0, w, h);
      ctx.restore();

      // Luego manipular píxeles (como instacam._filter con getImageData/putImageData)
      const fn = pixelFilters[filterDef.fn];
      if (fn) {
        try {
          const imageData = ctx.getImageData(0, 0, w, h);
          fn(imageData, w, h);
          ctx.putImageData(imageData, 0, 0);
        } catch (e) {
          // SecurityError si el canvas está tainted — ignorar silenciosamente
        }
      }
    }

    rafRef.current = requestAnimationFrame(drawFrame);
  }, []);

  /**
   * init — Inicializa el canvas y comienza a capturar frames.
   * No llama a getUserMedia (a diferencia de instacam.start()).
   */
  const init = useCallback(() => {
    if (!containerRef?.current || !videoRef?.current) {
      console.warn('[INSTACAM] init aborted: missing container or video ref');
      return null;
    }

    if (isRunningRef.current && streamRef.current) {
      return streamRef.current;
    }

    const video = videoRef.current;

    // Crear video oculto para leer los frames raw originales sin feedback loops
    if (!hiddenVideoRef.current) {
      const hv = document.createElement('video');
      hv.autoplay = true;
      hv.playsInline = true;
      hv.muted = true;
      // Clonar la fuente original
      hv.srcObject = video.srcObject;
      hiddenVideoRef.current = hv;
    }

    if (!canvasRef.current) {
      const canvas = document.createElement('canvas');
      canvasRef.current = canvas;
    }

    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    ctxRef.current = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctxRef.current) {
      console.error('[INSTACAM] Could not get 2D context');
      return null;
    }

    try {
      // Intentar obtener el stream del canvas
      const stream = canvas.captureStream(30);
      streamRef.current = stream;
      isRunningRef.current = true;
      rafRef.current = requestAnimationFrame(drawFrame);
      return stream;
    } catch (err) {
      console.error('[INSTACAM] canvas.captureStream failed:', err);
      return null;
    }
  }, [containerRef, videoRef, drawFrame]);

  /** applyFilter — Cambia el filtro activo (efecto inmediato en el próximo frame). */
  const applyFilter = useCallback((filterKey) => {
    if (!FILTERS[filterKey]) {
      console.warn('[INSTACAM] Unknown filter:', filterKey);
      return;
    }
    currentFilterRef.current = filterKey;
  }, []);

  /** destroy — Limpieza completa (como instacam.stop()). */
  const destroyInstacam = useCallback(() => {
    isRunningRef.current = false;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (hiddenVideoRef.current) {
      hiddenVideoRef.current.pause();
      hiddenVideoRef.current.srcObject = null;
      hiddenVideoRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
      streamRef.current = null;
    }
    if (canvasRef.current) {
      try { canvasRef.current.remove(); } catch (e) {}
      canvasRef.current = null;
    }
    ctxRef.current = null;
    currentFilterRef.current = 'none';
  }, []);

  useEffect(() => () => destroyInstacam(), [destroyInstacam]);

  return { init, applyFilter, destroy: destroyInstacam, currentFilter: currentFilterRef.current };
}
