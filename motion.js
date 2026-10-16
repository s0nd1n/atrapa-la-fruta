/**
 * Detección de movimiento por frame differencing.
 * Lee frames del video, calcula diferencia absoluta con el frame anterior,
 * binariza con umbral y devuelve el bounding box del área en movimiento.
 */
class MotionDetector {
  constructor(videoElement, options = {}) {
    this.video = videoElement;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.prevGray = null;
    this.threshold = options.threshold || 30;
    this.minArea = options.minArea || 80;
    this.scale = 0.4; // resolución reducida para rendimiento
    this.fallback = false;
    this.fallbackPoint = null;
  }

  resize() {
    if (!this.video.videoWidth || this.video.videoWidth === 0) return;
    this.canvas.width = Math.max(1, Math.floor(this.video.videoWidth * this.scale));
    this.canvas.height = Math.max(1, Math.floor(this.video.videoHeight * this.scale));
  }

  toGray(data, w, h) {
    const out = new Uint8Array(w * h);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      out[j] = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
    }
    return out;
  }

  absDiff(prev, curr, len) {
    const out = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      let d = curr[i] - prev[i];
      if (d < 0) d = -d;
      out[i] = d > this.threshold ? 255 : 0;
    }
    return out;
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

    // Dibuja el frame actual en el canvas de análisis (sin espejo: coordenadas crudas del video)
    this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);

    const frame = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const gray = this.toGray(frame.data, this.canvas.width, this.canvas.height);

    if (!this.prevGray) {
      this.prevGray = gray;
      return null;
    }

    const mask = this.absDiff(this.prevGray, gray, gray.length);
    const box = this.findBox(mask, this.canvas.width, this.canvas.height);
    this.prevGray = gray;

    if (!box) return null;

    // Mapea del espacio reducido al espacio real del video
    return {
      x: (box.cx / this.canvas.width) * this.video.videoWidth,
      y: (box.cy / this.canvas.height) * this.video.videoHeight,
      w: (box.w / this.canvas.width) * this.video.videoWidth,
      h: (box.h / this.canvas.height) * this.video.videoHeight,
      active: true
    };
  }

  enableFallback() { this.fallback = true; }
  disableFallback() { this.fallback = false; }
  setFallback(x, y) {
    this.fallbackPoint = { x, y, active: true, w: 44, h: 44 };
  }
}
