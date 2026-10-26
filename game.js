/**
 * Lógica principal del juego "Atrapa la Fruta Caída".
 * Orquesta cámara, detección de movimiento, spawn de objetos, colisiones,
 * puntuación, dificultad, sonidos y pantallas.
 */
const CONFIG = {
  objectSize: 48,
  startLives: 3,
  fruitScore: 10,

  spawnIntervalBase: 1100,
  spawnIntervalMin: 420,
  spawnIntervalStep: 90,

  speedBase: 3,
  speedIncrement: 0.55,
  speedMax: 11,

  difficultyEveryPoints: 50,

  bombChanceBase: 0.2,
  bombChanceStep: 0.03,
  bombChanceMax: 0.48,

  maxDt: 50,

  // El proyecto se usa sin espejo por pedido del usuario.
  // Si se pone en true, se recupera el efecto espejo del spec: el mapeo
  // de coordenadas ya compensa el reflejo automáticamente.
  mirror: false,

  motion: {
    threshold: 26,
    targetWidth: 192,
    interval: 33,
    persistence: 220,
    smoothing: 0.4
  }
};

class Game {
  constructor() {
    this.video = document.getElementById('video');
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.container = this.canvas.parentElement;

    this.scoreEl = document.getElementById('score-value');
    this.livesEl = document.getElementById('lives-value');
    this.finalScoreEl = document.getElementById('final-score');
    this.highScoreEl = document.getElementById('high-score');
    this.errorOverlay = document.getElementById('overlay-camera-error');
    this.errorTitulo = document.getElementById('error-titulo');
    this.errorMensaje = document.getElementById('error-mensaje');
    this.modalPermisos = document.getElementById('modal-permisos');
    this.btnPermisosAceptar = document.getElementById('btn-permisos-aceptar');
    this.btnPermisosDenegar = document.getElementById('btn-permisos-denegar');
    this.msgEstado = document.getElementById('msg-estado');
    this.btnPause = document.getElementById('btn-pause');
    this.pauseOverlay = document.getElementById('overlay-pause');

    this.score = 0;
    this.lives = CONFIG.startLives;
    this.highScore = this.loadHighScore();
    this.objects = [];
    this.particles = [];

    this.running = false;
    this.paused = false;
    this.rafId = 0;
    this.lastTime = 0;
    this.lastSpawn = 0;
    this.spawnInterval = CONFIG.spawnIntervalBase;
    this.speed = this.getBaseSpeed();
    this.level = 0;

    this.mode = 'camera';
    this.stream = null;
    this.cameraReady = false;
    this.fallbackMode = false;
    this._fallbackBound = false;
    this.audioCtx = null;
    this.mirror = CONFIG.mirror;

    this.video.classList.toggle('mirrored', this.mirror);

    this.motion = new MotionDetector(this.video, CONFIG.motion);

    this.bindUI();
    this.bindLifecycle();
    this.resizeCanvas();

    window.addEventListener('resize', () => this.resizeCanvas());

    document.addEventListener('keydown', (event) => {
      if (event.key === 'p' || event.key === 'P') {
        if (this.running) {
          event.preventDefault();
          this.togglePause();
        }
        return;
      }

      if (event.key === 'Escape') {
        if (!this.modalPermisos.classList.contains('hidden')) {
          this.modalPermisos.classList.add('hidden');
          document.getElementById('btn-start')?.focus();
          return;
        }
        if (this.paused) this.setPaused(false);
      }
    });

    this.mostrarEstado('Listo. Hacé clic en «Comenzar Juego».', 'info');
  }

  /* ------------------------------------------------------------------ */
  /* Pantallas, estado y HUD                                            */
  /* ------------------------------------------------------------------ */

  setScreen(id) {
    document.querySelectorAll('.screen').forEach((screen) => {
      screen.classList.remove('active');
    });

    const screen = document.getElementById(id);
    if (!screen) return;
    screen.classList.remove('hidden');
    screen.classList.add('active');
  }

  mostrarEstado(texto, tipo = 'info') {
    if (!this.msgEstado) return;
    this.msgEstado.textContent = texto;
    this.msgEstado.className = 'msg-estado visible ' + tipo;
  }

  ocultarEstado() {
    if (!this.msgEstado) return;
    this.msgEstado.classList.remove('visible');
  }

  updateHUD() {
    if (this.scoreEl) this.scoreEl.textContent = String(this.score);
    if (this.livesEl) {
      this.livesEl.textContent = this.lives > 0 ? '❤️'.repeat(this.lives) : '💔';
    }

    const livesBox = document.getElementById('hud-lives');
    if (livesBox) livesBox.setAttribute('aria-label', `Vidas: ${this.lives}`);
  }

  resetState() {
    this.score = 0;
    this.lives = CONFIG.startLives;
    this.objects = [];
    this.particles = [];
    this.spawnInterval = CONFIG.spawnIntervalBase;
    this.speed = this.getBaseSpeed();
    this.level = 0;
    this.lastSpawn = 0;
    this.lastTime = performance.now();
    this.paused = false;

    this.pauseOverlay.classList.add('hidden');
    this.btnPause.textContent = 'Pausa';
    this.btnPause.setAttribute('aria-label', 'Pausar juego');
    this.updateHUD();
  }

  getBaseSpeed() {
    // En pantallas chicas la caída se ajusta para seguir siendo jugable.
    const factor = Math.max(0.65, this.canvas.height / 480);
    return CONFIG.speedBase * factor;
  }

  /* ------------------------------------------------------------------ */
  /* Cámara, permisos y modo mouse/touch                                */
  /* ------------------------------------------------------------------ */

  mostrarModalPermisos() {
    this.ocultarEstado();
    this.modalPermisos.classList.remove('hidden');
    this.btnPermisosAceptar?.focus();
  }

  async startConCamara() {
    this._ensureAudio();
    this.modalPermisos.classList.add('hidden');

    this.stopLoop();
    this.running = false;
    this.stopCamera();

    this.mode = 'camera';
    this.fallbackMode = false;
    this.motion.disableFallback();
    this.container.classList.remove('fallback-mode');

    this.setScreen('screen-game');
    this.resizeCanvas();
    this.resetState();
    this.errorOverlay.classList.add('hidden');

    await this.iniciarCamara();
  }

  async iniciarCamara() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.showCameraError(
        'Tu navegador no permite usar la cámara.',
        'Probá con un navegador moderno (Chrome, Edge, Firefox o Safari).\nSi estás en producción, la cámara requiere HTTPS; en desarrollo usá localhost.\nTambién podés jugar en modo mouse/touch.'
      );
      return;
    }

    const constraintsList = [
      { video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } },
      { video: { facingMode: 'user' } },
      { video: true }
    ];

    let stream = null;
    let lastError = null;

    for (const constraints of constraintsList) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        break;
      } catch (error) {
        lastError = error;
        // Si el usuario negó el permiso, no insistir con más prompts.
        if (error && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) {
          break;
        }
      }
    }

    if (!stream) {
      this.showCameraErrorFor(lastError);
      return;
    }

    this.stream = stream;
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.srcObject = stream;

    try {
      await this.video.play();
    } catch (error) {
      // Algunos navegadores exigen un gesto extra; el stream ya está asignado
      // y el bucle puede arrancar igualmente.
      console.warn('[AF] No se pudo reproducir el video automáticamente:', error);
    }

    this.cameraReady = true;
    this.errorOverlay.classList.add('hidden');
    this.fallbackMode = false;
    this.motion.disableFallback();
    this.container.classList.remove('fallback-mode');

    this.running = true;
    this.paused = false;
    this.startLoop();
  }

  showCameraErrorFor(error) {
    const name = error && error.name;

    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      this.showCameraError(
        'Permiso de cámara denegado.',
        'No diste permiso para usar la cámara.\nBuscá el ícono de cámara o candado en la barra de direcciones y permití el acceso.\nTambién podés jugar en modo mouse/touch.'
      );
      return;
    }

    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      this.showCameraError(
        'No encontramos una cámara.',
        'Conectá una cámara web y volvé a intentar.\nTambién podés jugar en modo mouse/touch.'
      );
      return;
    }

    if (name === 'NotReadableError' || name === 'TrackStartError') {
      this.showCameraError(
        'La cámara está siendo usada por otra aplicación.',
        'Cerrá Zoom, Teams, Meet u otra app que esté usando la cámara y reintentá.\nTambién podés jugar en modo mouse/touch.'
      );
      return;
    }

    if (name === 'SecurityError') {
      this.showCameraError(
        'La cámara necesita un contexto seguro.',
        'Abrí el juego desde https:// o desde localhost.\nEn producción, la cámara solo funciona con HTTPS.'
      );
      return;
    }

    this.showCameraError(
      'No se pudo acceder a la cámara.',
      'Revisá que la cámara esté conectada y que el navegador tenga permiso.\nRecargá la página y aceptá el permiso cuando el navegador lo pida.\nTambién podés jugar en modo mouse/touch.'
    );
  }

  showCameraError(titulo, mensaje) {
    this.running = false;
    this.stopLoop();
    this.stopCamera();

    if (this.errorTitulo) this.errorTitulo.textContent = titulo;
    if (this.errorMensaje) this.errorMensaje.textContent = mensaje;
    this.errorOverlay.classList.remove('hidden');
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.video.srcObject) this.video.srcObject = null;

    this.cameraReady = false;
    this.motion.reset();
  }

  startSinCamara() {
    this._ensureAudio();
    this.modalPermisos.classList.add('hidden');

    this.stopLoop();
    this.running = false;
    this.stopCamera();

    this.mode = 'fallback';
    this.fallbackMode = true;
    this.cameraReady = false;

    this.setScreen('screen-game');
    this.resizeCanvas();
    this.resetState();

    this.errorOverlay.classList.add('hidden');
    this.container.classList.add('fallback-mode');

    this.motion.enableFallback();
    this.motion.reset();
    this.bindFallbackInput();

    this.running = true;
    this.paused = false;
    this.startLoop();
  }

  bindFallbackInput() {
    if (this._fallbackBound) return;
    this._fallbackBound = true;

    const updatePointer = (clientX, clientY) => {
      const rect = this.canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const x = (clientX - rect.left) * (this.canvas.width / rect.width);
      const y = (clientY - rect.top) * (this.canvas.height / rect.height);

      if (x < 0 || y < 0 || x > this.canvas.width || y > this.canvas.height) return;
      this.motion.setFallback(x, y);
    };

    this.container.addEventListener('pointermove', (event) => {
      updatePointer(event.clientX, event.clientY);
    });

    this.container.addEventListener('pointerdown', (event) => {
      updatePointer(event.clientX, event.clientY);
    });

    this.container.addEventListener('pointerleave', () => {
      this.motion.clearFallback();
    });

    this.container.addEventListener('pointercancel', () => {
      this.motion.clearFallback();
    });
  }

  /* ------------------------------------------------------------------ */
  /* Bucle principal                                                    */
  /* ------------------------------------------------------------------ */

  startLoop() {
    this.stopLoop();
    if (!this.running) return;

    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame((now) => this.loop(now));
  }

  stopLoop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  loop(now) {
    this.rafId = 0;
    if (!this.running || this.paused) return;

    const dt = Math.min(CONFIG.maxDt, Math.max(0, now - this.lastTime));
    this.lastTime = now;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Una sola actualización de movimiento por frame.
    const motion = this.motion.update(now);
    const hitbox = this.mapMotionToCanvas(motion);

    this.spawnObject(now);
    this.updateObjects(now, dt, hitbox);
    if (!this.running) return;

    this.updateParticles(dt);

    this.drawObjects();
    this.drawParticles();
    if (hitbox) this.drawMotion(hitbox);

    if (this.running && !this.paused) {
      this.rafId = requestAnimationFrame((nextNow) => this.loop(nextNow));
    }
  }

  setPaused(paused) {
    if (!this.running || this.paused === paused) return;

    this.paused = paused;
    this.pauseOverlay.classList.toggle('hidden', !paused);

    if (paused) {
      this.stopLoop();
      this.btnPause.textContent = 'Reanudar';
      this.btnPause.setAttribute('aria-label', 'Reanudar juego');
      document.getElementById('btn-resume')?.focus();
    } else {
      this.btnPause.textContent = 'Pausa';
      this.btnPause.setAttribute('aria-label', 'Pausar juego');
      this.lastTime = performance.now();
      this.startLoop();
      this.btnPause.focus();
    }
  }

  togglePause() {
    if (!this.running) return;
    this.setPaused(!this.paused);
  }

  /* ------------------------------------------------------------------ */
  /* Coordenadas de la cámara -> canvas del juego                       */
  /* ------------------------------------------------------------------ */

  /**
   * Convierte la caja normalizada del video a píxeles del canvas.
   * Compensa:
   * - diferencias de resolución entre el stream y el canvas;
   * - el recorte de `object-fit: cover`;
   * - el efecto espejo, si está activo.
   */
  mapMotionToCanvas(move) {
    if (!move || !move.active) return null;

    if (move.space === 'canvas') {
      return { x: move.x, y: move.y, w: move.w, h: move.h, active: true };
    }

    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    if (!cw || !ch || !vw || !vh) return null;

    const scale = Math.max(cw / vw, ch / vh);
    const displayedW = vw * scale;
    const displayedH = vh * scale;
    const offsetX = (cw - displayedW) / 2;
    const offsetY = (ch - displayedH) / 2;

    const x0 = offsetX + move.x * displayedW;
    const x1 = offsetX + (move.x + move.w) * displayedW;
    const y0 = offsetY + move.y * displayedH;
    const y1 = offsetY + (move.y + move.h) * displayedH;

    let x = Math.min(x0, x1);
    const w = Math.abs(x1 - x0);

    if (this.mirror) x = cw - x - w;

    return {
      x,
      y: Math.min(y0, y1),
      w,
      h: Math.abs(y1 - y0),
      active: true
    };
  }

  /* ------------------------------------------------------------------ */
  /* Objetos, colisiones y dificultad                                   */
  /* ------------------------------------------------------------------ */

  spawnObject(now) {
    if (now - this.lastSpawn < this.spawnInterval) return;

    const size = Math.max(
      28,
      Math.min(CONFIG.objectSize, Math.round(this.canvas.height * 0.1))
    );

    const bombChance = Math.min(
      CONFIG.bombChanceMax,
      CONFIG.bombChanceBase + this.level * CONFIG.bombChanceStep
    );

    const type = Math.random() < bombChance ? 'bomb' : 'fruit';
    const maxX = Math.max(0, this.canvas.width - size);

    this.objects.push({
      x: Math.random() * maxX,
      y: -size,
      w: size,
      h: size,
      type,
      vy: this.speed,
      collected: false,
      exploded: false
    });

    this.lastSpawn = now;
  }

  aabb(a, b) {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  updateObjects(now, dt, hitbox) {
    const frames = dt / (1000 / 60);

    for (const obj of this.objects) {
      if (obj.collected || obj.exploded) continue;

      obj.y += obj.vy * frames;

      // Fruta que llega al borde inferior sin ser tocada.
      if (obj.y + obj.h > this.canvas.height) {
        if (obj.type === 'fruit') {
          obj.collected = true;
          this.playSound('miss');
          this.loseLife();
          if (!this.running) return;
        } else {
          obj.exploded = true;
        }
        continue;
      }

      // Colisión con el área de movimiento del usuario.
      if (hitbox && this.aabb(hitbox, obj)) {
        if (obj.type === 'fruit') {
          obj.collected = true;
          this.score += CONFIG.fruitScore;
          this.updateHUD();
          this.spawnParticles(obj, '#7CFF9B');
          this.playSound('fruit');
        } else {
          obj.exploded = true;
          this.spawnParticles(obj, '#FF7B6B');
          this.playSound('bomb');
          this.loseLife();
          if (!this.running) return;
        }
      }
    }

    this.objects = this.objects.filter((obj) => !obj.collected && !obj.exploded);
    this.updateDifficulty();
  }

  updateDifficulty() {
    const level = Math.floor(this.score / CONFIG.difficultyEveryPoints);
    if (level <= this.level) return;

    this.level = level;
    this.speed = Math.min(
      CONFIG.speedMax,
      this.getBaseSpeed() + level * CONFIG.speedIncrement
    );
    this.spawnInterval = Math.max(
      CONFIG.spawnIntervalMin,
      CONFIG.spawnIntervalBase - level * CONFIG.spawnIntervalStep
    );
  }

  loseLife() {
    if (!this.running || this.lives <= 0) return;

    this.lives = Math.max(0, this.lives - 1);
    this.updateHUD();

    if (this.lives === 0) this.gameOver();
  }

  gameOver() {
    if (!this.running) return;

    this.running = false;
    this.paused = false;
    this.stopLoop();
    this.stopCamera();

    if (this.score > this.highScore) {
      this.highScore = this.score;
      this.saveHighScore();
    }

    this.finalScoreEl.textContent = String(this.score);
    this.highScoreEl.textContent = String(this.highScore);
    this.pauseOverlay.classList.add('hidden');

    this.playSound('gameover');
    this.setScreen('screen-gameover');

    window.setTimeout(() => {
      document.getElementById('btn-restart')?.focus();
    }, 50);
  }

  /* ------------------------------------------------------------------ */
  /* Dibujo                                                             */
  /* ------------------------------------------------------------------ */

  drawObjects() {
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.font = '22px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';

    for (const obj of this.objects) {
      const cx = obj.x + obj.w / 2;
      const cy = obj.y + obj.h / 2;

      this.ctx.beginPath();
      this.ctx.fillStyle = obj.type === 'fruit' ? '#2ecc71' : '#e74c3c';
      this.ctx.arc(cx, cy, obj.w / 2, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.lineWidth = 2;
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      this.ctx.stroke();

      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillText(obj.type === 'fruit' ? '🍎' : '💣', cx, cy + 1);
    }
  }

  drawMotion(move) {
    if (move.w < 4 || move.h < 4) return;

    this.ctx.save();

    if (this.fallbackMode) {
      const cx = move.x + move.w / 2;
      const cy = move.y + move.h / 2;
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, move.w / 2, 0, Math.PI * 2);
      this.ctx.fillStyle = 'rgba(46, 204, 113, 0.18)';
      this.ctx.fill();
      this.ctx.lineWidth = 2;
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      this.ctx.stroke();
    } else {
      const radius = Math.min(12, move.w / 2, move.h / 2);
      this.ctx.beginPath();
      if (typeof this.ctx.roundRect === 'function') {
        this.ctx.roundRect(move.x, move.y, move.w, move.h, radius);
      } else {
        this.ctx.rect(move.x, move.y, move.w, move.h);
      }
      this.ctx.fillStyle = 'rgba(46, 204, 113, 0.16)';
      this.ctx.fill();
      this.ctx.lineWidth = 2;
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  spawnParticles(obj, color) {
    const cx = obj.x + obj.w / 2;
    const cy = obj.y + obj.h / 2;

    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;

      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1,
        life: 1,
        decay: 0.02 + Math.random() * 0.02,
        size: 2 + Math.random() * 3,
        color
      });
    }

    if (this.particles.length > 120) {
      this.particles.splice(0, this.particles.length - 120);
    }
  }

  updateParticles(dt) {
    const frames = dt / (1000 / 60);

    for (const particle of this.particles) {
      particle.x += particle.vx * frames;
      particle.y += particle.vy * frames;
      particle.vy += 0.15 * frames;
      particle.life -= particle.decay * frames;
    }

    this.particles = this.particles.filter((particle) => particle.life > 0);
  }

  drawParticles() {
    for (const particle of this.particles) {
      this.ctx.globalAlpha = Math.max(0, particle.life);
      this.ctx.fillStyle = particle.color;
      this.ctx.beginPath();
      this.ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.globalAlpha = 1;
  }

  resizeCanvas() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (!width || !height) return;

    const oldWidth = this.canvas.width;
    const oldHeight = this.canvas.height;

    if (width === oldWidth && height === oldHeight) return;

    this.canvas.width = width;
    this.canvas.height = height;

    // Mantiene los objetos en proporción si cambia el tamaño en pleno juego.
    if (oldWidth && oldHeight && this.objects.length) {
      const sx = width / oldWidth;
      const sy = height / oldHeight;
      for (const obj of this.objects) {
        obj.x *= sx;
        obj.y *= sy;
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Sonido, récord y ciclo de vida                                     */
  /* ------------------------------------------------------------------ */

  _ensureAudio() {
    if (!this.audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;

      try {
        this.audioCtx = new AudioCtx();
      } catch (error) {
        return null;
      }
    }

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }

    return this.audioCtx;
  }

  playSound(type) {
    const ctx = this._ensureAudio();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      let duration = 0.16;

      if (type === 'fruit') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1760, now + 0.12);
        duration = 0.16;
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.16, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      } else if (type === 'bomb') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.22);
        duration = 0.26;
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      } else if (type === 'miss') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.12);
        duration = 0.14;
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      } else {
        // gameover
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.6);
        duration = 0.7;
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      }

      osc.start(now);
      osc.stop(now + duration + 0.02);
    } catch (error) {
      // El audio puede estar bloqueado sin interacción; no interrumpe el juego.
    }
  }

  loadHighScore() {
    try {
      const value = parseInt(localStorage.getItem('af-highscore') || '0', 10);
      return Number.isFinite(value) && value > 0 ? value : 0;
    } catch (error) {
      return 0;
    }
  }

  saveHighScore() {
    try {
      localStorage.setItem('af-highscore', String(this.highScore));
    } catch (error) {
      // localStorage puede fallar en modo privado; el juego sigue funcionando.
    }
  }

  bindLifecycle() {
    const cleanup = () => {
      this.running = false;
      this.stopLoop();
      this.stopCamera();
    };

    window.addEventListener('pagehide', cleanup);
    window.addEventListener('beforeunload', cleanup);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.running && !this.paused) {
        this.setPaused(true);
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* UI                                                                 */
  /* ------------------------------------------------------------------ */

  bindUI() {
    const btnStart = document.getElementById('btn-start');
    if (btnStart) {
      btnStart.addEventListener('click', () => this.mostrarModalPermisos());
    }

    if (this.btnPermisosAceptar) {
      this.btnPermisosAceptar.addEventListener('click', () => {
        this.modalPermisos.classList.add('hidden');
        this.startConCamara();
      });
    }

    if (this.btnPermisosDenegar) {
      this.btnPermisosDenegar.addEventListener('click', () => {
        this.modalPermisos.classList.add('hidden');
        this.startSinCamara();
      });
    }

    this.btnPause.addEventListener('click', () => this.togglePause());

    const btnResume = document.getElementById('btn-resume');
    if (btnResume) btnResume.addEventListener('click', () => this.setPaused(false));

    const btnRestart = document.getElementById('btn-restart');
    if (btnRestart) btnRestart.addEventListener('click', () => this.restartGame());

    const btnFallback = document.getElementById('btn-fallback');
    if (btnFallback) btnFallback.addEventListener('click', () => this.startSinCamara());

    const btnReintentarCamara = document.getElementById('btn-reintentar-camara');
    if (btnReintentarCamara) {
      btnReintentarCamara.addEventListener('click', () => {
        this.errorOverlay.classList.add('hidden');
        this.startConCamara();
      });
    }
  }

  restartGame() {
    if (this.mode === 'fallback') {
      this.startSinCamara();
    } else {
      this.startConCamara();
    }
  }
}

// Inicializar el juego cuando el DOM esté listo.
window.addEventListener('DOMContentLoaded', () => {
  try {
    window.game = new Game();
    console.log('[AF] Juego inicializado correctamente');
  } catch (error) {
    console.error('[AF] Error inicializando el juego:', error);
    const msg = document.getElementById('msg-estado');
    if (msg) {
      msg.textContent = 'Error al iniciar el juego: ' + error.message;
      msg.className = 'msg-estado visible error';
    }
  }
});
