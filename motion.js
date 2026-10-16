/**
 * Detección de movimiento por frame differencing.
 * Lee frames del video, calcula diferencia absoluta con el frame anterior,
 * binariza con umbral y devuelve el bounding box del área en movimiento.
 *
 * Optimizaciones de rendimiento:
 * - Procesa movimiento cada N frames (frameSkip) para no saturar el hilo principal.
 * - Reduce la resolución de análisis (scale).
 * - Reutiliza buffers Uint8Array en lugar de crear nuevos cada frame.
 */
class MotionDetector {
  constructor(videoElement, options = {}) {
    this.video = videoElement;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.prevGray = null;
    this.currGray = null;
    this.threshold = options.threshold || 30;
    this.minArea = options.minArea || 60;
    this.scale = options.scale || 0.3;
    this.frameSkip = options.frameSkip || 2; // procesar 1 de cada N frames
    this.frameCounter = 0;
    this.fallback = false;
    this.fallbackPoint = null;
    this._grayBuffer = null;
    this._diffBuffer = null;
  }

  resize() {
    if (!this.video.videoWidth || this.video.videoWidth === 0) return;
    const w = Math.max(1, Math.floor(this.video.videoWidth * this.scale));
    const h = Math.max(1, Math.floor(this.video.videoHeight * this.scale));
    this.canvas.width = w;
    this.canvas.height = h;
    const len = w * h;
    if (!this._grayBuffer || this._grayBuffer.length !== len) {
      this._grayBuffer = new Uint8Array(len);
      this._diffBuffer = new Uint8Array(len);
    }
  }

  toGray(data, w, h, out) {
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      out[j] = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
    }
  }

  absDiff(prev, curr, len, out) {
    let anySignificant = false;
    for (let i = 0; i < len; i++) {
      let d = curr[i] - prev[i];
      if (d < 0) d = -d;
      out[i] = d > this.threshold ? 255 : 0;
      if (out[i]) anySignificant = true;
    }
    return anySignificant;
  }

  findBox(mask, w, h) {
    let minX = w, minY = h, maxX = 0, maxY = 0, count = 0;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        if (mask[row + x]) {
          count++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (count < this.minArea) return null;
    return {
      x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1,
      cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, area: count
    };
  }

  update() {
    if (this.fallback) return this.fallbackPoint;
    if (!this.video.videoWidth || this.video.videoWidth === 0) return null;

    this.resize();

    // Throttle: solo procesar movimiento cada frameSkip frames
    this.frameCounter++;
    if (this.frameCounter < this.frameSkip) {
      // Devolver la última posición conocida para suavizar
      return this._lastBox || null;
    }
    this.frameCounter = 0;

    // Dibuja el frame actual en el canvas de análisis (sin espejo)
    this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);

    const frame = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const w = this.canvas.width;
    const h = this.canvas.height;

    this.toGray(frame.data, w, h, this._grayBuffer);

    if (!this.prevGray) {
      this.prevGray = new Uint8Array(this._grayBuffer);
      this._lastBox = null;
      return null;
    }

    const anySignificant = this.absDiff(this.prevGray, this._grayBuffer, w * h, this._diffBuffer);
    if (!anySignificant) {
      this.prevGray = new Uint8Array(this._grayBuffer);
      return this._lastBox || null;
    }

    const box = this.findBox(this._diffBuffer, w, h);
    this.prevGray = new Uint8Array(this._grayBuffer);

    if (!box) {
      this._lastBox = null;
      return null;
    }

    // Mapea del espacio reducido al espacio real del video
    const result = {
      x: (box.cx / w) * this.video.videoWidth,
      y: (box.cy / h) * this.video.videoHeight,
      w: (box.w / w) * this.video.videoWidth,
      h: (box.h / h) * this.video.videoHeight,
      active: true
    };
    this._lastBox = result;
    return result;
  }

  enableFallback() { this.fallback = true; }
  disableFallback() { this.fallback = false; }
  setFallback(x, y) {
    this.fallbackPoint = { x, y, active: true, w: 44, h: 44 };
    this._lastBox = this.fallbackPoint;
  }
}
