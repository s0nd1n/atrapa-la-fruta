/**
 * Detección de movimiento por frame differencing.
 *
 * Pipeline:
 *   video -> canvas reducido -> escala de grises -> blur 3x3 ->
 *   diferencia absoluta con el frame anterior -> umbral ->
 *   grilla de celdas -> componente conexo más grande -> caja normalizada.
 *
 * Decisiones de rendimiento y estabilidad:
 * - Analiza a ~192 px de ancho y como máximo ~30 veces por segundo.
 * - Reutiliza todos los buffers (sin asignaciones por frame).
 * - Suaviza la caja con interpolación temporal y la mantiene unos ms
 *   después del último movimiento para evitar parpadeos.
 * - Descarta cambios globales de iluminación.
 *
 * Las coordenadas que devuelve `update()` son NORMALIZADAS (0..1) respecto
 * del frame de video y SIN espejo. `game.js` las mapea al canvas del juego
 * teniendo en cuenta el recorte de `object-fit: cover` y, si corresponde,
 * el efecto espejo.
 */
class MotionDetector {
  constructor(videoElement, options = {}) {
    this.video = videoElement;

    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', {
      willReadFrequently: true,
      alpha: false
    });

    // Sensibilidad y dimensiones del análisis.
    this.threshold = options.threshold ?? 26;
    this.minAreaRatio = options.minAreaRatio ?? 0.0025;
    this.targetWidth = options.targetWidth ?? 192;
    this.cellSize = options.cellSize ?? 8;

    // Cadencia y estabilidad temporal.
    this.interval = options.interval ?? 33; // ms (~30 análisis por segundo)
    this.persistence = options.persistence ?? 220; // ms que sobrevive la caja
    this.smoothing = options.smoothing ?? 0.4; // 0..1 por actualización

    this.fallbackSize = options.fallbackSize ?? 72;
    this.fallback = false;
    this.fallbackPoint = null;

    this._w = 0;
    this._h = 0;
    this._gridW = 0;
    this._gridH = 0;

    this._prev = null;
    this._curr = null;
    this._blurTmp = null;
    this._blur = null;
    this._cellSum = null;
    this._cellActive = null;
    this._visited = null;
    this._queue = null;

    this._hasPrev = false;
    this._lastProcess = 0;
    this._lastSeen = 0;
    this._target = null;
    this._result = null;
    this._errorReported = false;
  }

  /**
   * Ajusta el canvas interno al tamaño de análisis.
   * Devuelve false mientras el video todavía no tiene dimensiones.
   */
  _ensureSize() {
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    if (!vw || !vh) return false;

    const scale = Math.min(1, this.targetWidth / vw);
    const w = Math.max(32, Math.round(vw * scale));
    const h = Math.max(24, Math.round(vh * scale));

    if (w !== this._w || h !== this._h) {
      this._w = w;
      this._h = h;
      this.canvas.width = w;
      this.canvas.height = h;
      this.ctx.imageSmoothingEnabled = true;
      this._allocate(w, h);
      this._hasPrev = false;
      this._target = null;
      this._result = null;
    }

    return true;
  }

  _allocate(w, h) {
    const len = w * h;
    this._prev = new Uint8Array(len);
    this._curr = new Uint8Array(len);
    this._blurTmp = new Uint8Array(len);
    this._blur = new Uint8Array(len);

    this._gridW = Math.ceil(w / this.cellSize);
    this._gridH = Math.ceil(h / this.cellSize);
    const cells = this._gridW * this._gridH;
    this._cellSum = new Uint32Array(cells);
    this._cellActive = new Uint8Array(cells);
    this._visited = new Uint8Array(cells);
    this._queue = new Int32Array(cells);
  }

  /**
   * Blur gaussiano aproximado con dos pasadas [1, 2, 1] / 4.
   * Reduce ruido de la cámara antes de calcular la diferencia.
   */
  _boxBlur(src, w, h, tmp, dst) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const left = src[row + (x > 0 ? x - 1 : x)];
        const center = src[row + x];
        const right = src[row + (x < w - 1 ? x + 1 : x)];
        tmp[row + x] = (left + center + center + right) >> 2;
      }
    }

    for (let y = 0; y < h; y++) {
      const row = y * w;
      const up = (y > 0 ? y - 1 : y) * w;
      const down = (y < h - 1 ? y + 1 : y) * w;
      for (let x = 0; x < w; x++) {
        dst[row + x] = (tmp[up + x] + tmp[row + x] + tmp[row + x] + tmp[down + x]) >> 2;
      }
    }
  }

  /**
   * Calcula la caja de movimiento más relevante para el frame actual.
   * Guarda el resultado normalizado en `this._target`.
   */
  _process() {
    const w = this._w;
    const h = this._h;

    this.ctx.drawImage(this.video, 0, 0, w, h);
    const data = this.ctx.getImageData(0, 0, w, h).data;
    const curr = this._curr;

    // Escala de grises (aproximación entera de BT.601).
    for (let i = 0, j = 0; j < curr.length; i += 4, j++) {
      curr[j] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
    }

    this._boxBlur(curr, w, h, this._blurTmp, this._blur);

    if (!this._hasPrev) {
      this._prev.set(this._blur);
      this._hasPrev = true;
      this._target = null;
      return;
    }

    const prev = this._prev;
    const blurred = this._blur;
    const cellSum = this._cellSum;
    const threshold = this.threshold;
    const cellSize = this.cellSize;
    const gridW = this._gridW;

    cellSum.fill(0);

    let movingPixels = 0;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      const gridRow = ((y / cellSize) | 0) * gridW;
      for (let x = 0; x < w; x++) {
        const index = row + x;
        let diff = blurred[index] - prev[index];
        if (diff < 0) diff = -diff;

        if (diff > threshold) {
          cellSum[gridRow + ((x / cellSize) | 0)]++;
          movingPixels++;
        }
      }
    }

    this._prev.set(blurred);

    const totalPixels = w * h;
    // Poco movimiento (ruido) o cambio global de iluminación: sin caja.
    if (
      movingPixels < totalPixels * this.minAreaRatio ||
      movingPixels > totalPixels * 0.55
    ) {
      this._target = null;
      return;
    }

    // Activa solo celdas con suficiente movimiento (filtra píxeles aislados).
    const cells = this._cellActive;
    const cellArea = cellSize * cellSize;
    const minCellPixels = Math.max(2, Math.round(cellArea * 0.05));
    for (let i = 0; i < cellSum.length; i++) {
      cells[i] = cellSum[i] >= minCellPixels ? 1 : 0;
    }

    // Busca el componente conexo (4-vecinos) con más movimiento.
    const visited = this._visited;
    const queue = this._queue;
    const gridH = this._gridH;
    visited.fill(0);

    let best = null;

    for (let start = 0; start < cells.length; start++) {
      if (!cells[start] || visited[start]) continue;

      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      visited[start] = 1;

      let minX = gridW;
      let minY = gridH;
      let maxX = -1;
      let maxY = -1;
      let weight = 0;
      let count = 0;

      while (head < tail) {
        const index = queue[head++];
        const gx = index % gridW;
        const gy = (index / gridW) | 0;

        weight += cellSum[index];
        count++;

        if (gx < minX) minX = gx;
        if (gx > maxX) maxX = gx;
        if (gy < minY) minY = gy;
        if (gy > maxY) maxY = gy;

        if (gx > 0) {
          const n = index - 1;
          if (cells[n] && !visited[n]) {
            visited[n] = 1;
            queue[tail++] = n;
          }
        }
        if (gx < gridW - 1) {
          const n = index + 1;
          if (cells[n] && !visited[n]) {
            visited[n] = 1;
            queue[tail++] = n;
          }
        }
        if (gy > 0) {
          const n = index - gridW;
          if (cells[n] && !visited[n]) {
            visited[n] = 1;
            queue[tail++] = n;
          }
        }
        if (gy < gridH - 1) {
          const n = index + gridW;
          if (cells[n] && !visited[n]) {
            visited[n] = 1;
            queue[tail++] = n;
          }
        }
      }

      if (!best || weight > best.weight) {
        best = { minX, minY, maxX, maxY, weight, count };
      }
    }

    // Un componente que ocupa media pantalla suele ser un cambio de luz.
    if (!best || best.count > cells.length * 0.5) {
      this._target = null;
      return;
    }

    const x0 = best.minX * cellSize;
    const y0 = best.minY * cellSize;
    const x1 = Math.min(w, (best.maxX + 1) * cellSize);
    const y1 = Math.min(h, (best.maxY + 1) * cellSize);

    this._target = {
      x: x0 / w,
      y: y0 / h,
      w: (x1 - x0) / w,
      h: (y1 - y0) / h
    };
  }

  /**
   * Aplica suavizado temporal y persistencia a la última caja detectada.
   * Devuelve coordenadas normalizadas o null.
   */
  _smooth(now) {
    if (!this._target) {
      if (this._result && now - this._lastSeen > this.persistence) {
        this._result = null;
      }
      return this._result
        ? { x: this._result.x, y: this._result.y, w: this._result.w, h: this._result.h, active: true, space: 'video' }
        : null;
    }

    this._lastSeen = now;
    const target = this._target;

    if (!this._result) {
      this._result = { x: target.x, y: target.y, w: target.w, h: target.h };
    } else {
      const result = this._result;

      // Si la caja salta demasiado lejos (otra mano, otro objeto), no
      // interpolamos: sería un barrido falso por toda la pantalla.
      const dx = (target.x + target.w / 2) - (result.x + result.w / 2);
      const dy = (target.y + target.h / 2) - (result.y + result.h / 2);
      const snap = Math.abs(dx) > 0.22 || Math.abs(dy) > 0.22;
      const alpha = snap ? 1 : this.smoothing;

      result.x += (target.x - result.x) * alpha;
      result.y += (target.y - result.y) * alpha;
      result.w += (target.w - result.w) * alpha;
      result.h += (target.h - result.h) * alpha;
    }

    return {
      x: this._result.x,
      y: this._result.y,
      w: this._result.w,
      h: this._result.h,
      active: true,
      space: 'video'
    };
  }

  /**
   * Debe llamarse una sola vez por frame del juego, idealmente desde
   * requestAnimationFrame. `now` es opcional para pruebas.
   */
  update(now = performance.now()) {
    if (this.fallback) {
      if (!this.fallbackPoint) return null;
      return {
        x: this.fallbackPoint.x,
        y: this.fallbackPoint.y,
        w: this.fallbackPoint.w,
        h: this.fallbackPoint.h,
        active: true,
        space: 'canvas'
      };
    }

    if (!this._ensureSize()) return null;

    if (now - this._lastProcess >= this.interval) {
      this._lastProcess = now;
      try {
        this._process();
      } catch (error) {
        this._target = null;
        if (!this._errorReported) {
          this._errorReported = true;
          console.warn('[AF] No se pudo analizar el frame de la cámara:', error);
        }
      }
    }

    return this._smooth(now);
  }

  /** Limpia el estado temporal (reinicio, cambio de modo o de cámara). */
  reset() {
    this._hasPrev = false;
    this._lastProcess = 0;
    this._lastSeen = 0;
    this._target = null;
    this._result = null;
    this.fallbackPoint = null;

    if (this._prev) this._prev.fill(0);
    if (this._cellSum) this._cellSum.fill(0);
    if (this._cellActive) this._cellActive.fill(0);
  }

  enableFallback() {
    this.fallback = true;
    this.fallbackPoint = null;
  }

  disableFallback() {
    this.fallback = false;
    this.fallbackPoint = null;
    this.reset();
  }

  /** Coordenadas en píxeles del canvas del juego (modo mouse/touch). */
  setFallback(x, y) {
    const half = this.fallbackSize / 2;
    this.fallbackPoint = {
      x: x - half,
      y: y - half,
      w: this.fallbackSize,
      h: this.fallbackSize
    };
  }

  clearFallback() {
    this.fallbackPoint = null;
  }
}
