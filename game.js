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
  speedBase: 3,
  speedIncrement: 0.5,
  difficultyEveryPoints: 50,
  cooldownFrames: 8
};

class Game {
  constructor() {
    this.video = document.getElementById('video');
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');

    this.scoreEl = document.getElementById('score-value');
    this.livesEl = document.getElementById('lives-value');
    this.finalScoreEl = document.getElementById('final-score');
    this.highScoreEl = document.getElementById('high-score');
    this.errorOverlay = document.getElementById('overlay-camera-error');
    this.btnFallback = document.getElementById('btn-fallback');
    this.btnReintentarCamara = document.getElementById('btn-reintentar-camara');
    this.btnModoRapido = document.getElementById('btn-modo-rapido');
    this.modalPermisos = document.getElementById('modal-permisos');
    this.btnPermisosAceptar = document.getElementById('btn-permisos-aceptar');
    this.btnPermisosDenegar = document.getElementById('btn-permisos-denegar');
    this.msgEstado = document.getElementById('msg-estado');
    this.errorTitulo = document.getElementById('error-titulo');
    this.errorMensaje = document.getElementById('error-mensaje');

    this.score = 0;
    this.lives = CONFIG.startLives;
    this.highScore = parseInt(localStorage.getItem('af-highscore') || '0', 10);
    this.objects = [];
    this.running = false;
    this.paused = false;
    this.lastTime = 0;
    this.lastSpawn = 0;
    this.spawnInterval = CONFIG.spawnIntervalBase;
    this.speed = CONFIG.speedBase;
    this.framesSinceDifficulty = 0;

    this.motion = new MotionDetector(this.video);
    this.stream = null;
    this.cameraReady = false;
    this.fallbackMode = false;

    this.bindUI();
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'p' || e.key === 'P') this.togglePause();
    });
    this.mostrarEstado('Listo. Hacé clic en "Comenzar Juego" o "Modo rápido".', 'info');
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

  bindUI() {
    const btnStart = document.getElementById('btn-start');
    if (btnStart) btnStart.addEventListener('click', () => this.startConCamara());
    if (this.btnModoRapido) this.btnModoRapido.addEventListener('click', () => this.startSinCamara());
    if (this.btnPermisosAceptar) this.btnPermisosAceptar.addEventListener('click', () => {
      this.modalPermisos.classList.add('hidden');
      this.startConCamara();
    });
    if (this.btnPermisosDenegar) this.btnPermisosDenegar.addEventListener('click', () => {
      this.modalPermisos.classList.add('hidden');
      this.startSinCamara();
    });
    const btnResume = document.getElementById('btn-resume');
    if (btnResume) btnResume.addEventListener('click', () => this.setPaused(false));
    const btnRestart = document.getElementById('btn-restart');
    if (btnRestart) btnRestart.addEventListener('click', () => this.restartGame());
    if (this.btnFallback) this.btnFallback.addEventListener('click', () => this.enableFallback());
    if (this.btnReintentarCamara) this.btnReintentarCamara.addEventListener('click', () => {
      this.errorOverlay.classList.add('hidden');
      this.startConCamara();
    });
  }

  resizeCanvas() {
    const container = this.canvas.parentElement;
    this.canvas.width = container.clientWidth || 640;
    this.canvas.height = container.clientHeight || 480;
  }

  setScreen(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  updateHUD() {
    this.scoreEl.textContent = this.score;
    this.livesEl.textContent = '❤️'.repeat(Math.max(0, this.lives));
  }

  mostrarModalPermisos() {
    this.mostrarEstado('Solicitando permiso de cámara...', 'info');
    this.modalPermisos.classList.remove('hidden');
  }

  startConCamara() {
    this.modalPermisos.classList.add('hidden');
    this.setScreen('screen-game');
    this.resetState();
    this.errorOverlay.classList.add('hidden');
    this.iniciarBucleConCamara();
  }

  startSinCamara() {
    this.modalPermisos.classList.add('hidden');
    this.setScreen('screen-game');
    this.resetState();
    this.cameraReady = false;
    this.errorOverlay.classList.add('hidden');
    this.motion.enableFallback();
    this.fallbackMode = true;
    this.enableFallbackInput();
    this.lastTime = performance.now();
    this.running = true;
    this.paused = false;
    document.getElementById('overlay-pause').classList.add('hidden');
    requestAnimationFrame((t) => this.loop(t));
  }

  async iniciarBucleConCamara() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.mostrarEstado('Tu navegador no soporta la cámara.', 'error');
      return;
    }

    const constraintsList = [
      { video: true },
      { video: { facingMode: 'user' } },
      { video: { facingMode: 'environment' } }
    ];

    let stream = null;
    let lastError = null;

    for (const constraints of constraintsList) {
      try {
        console.log('[AF] Probando cámara con:', JSON.stringify(constraints));
        stream = await navigator.mediaDevices.getUserMedia(constraints);

        // Configurar video para autoplay sin interacción (muted es obligatorio en muchos navegadores)
        this.video.muted = true;
        this.video.playsInline = true;
        this.video.style.display = 'block';
        this.video.srcObject = stream;

        try {
          await this.video.play();
        } catch (playErr) {
          console.warn('[AF] video.play() falló, pero el stream está asignado:', playErr);
          // Algunos navegadores requieren interacción para play(); igual arrancamos el juego
        }

        break;
      } catch (err) {
        console.warn('[AF] Falló con:', JSON.stringify(constraints), err);
        lastError = err;
      }
    }

    if (!stream) {
      console.error('[AF] No se pudo abrir ninguna cámara:', lastError);
      this.errorOverlay.classList.remove('hidden');
      this.errorTitulo.textContent = 'No se pudo acceder a la cámara.';
      this.errorMensaje.textContent = 'Probá lo siguiente:\n• Revisá que ningún otro programa (Zoom, Teams, etc.) esté usando la cámara.\n• Buscá el ícono de cámara en la barra de direcciones del navegador y permití el acceso.\n• Recargá la página y aceptá el permiso cuando el navegador te lo pida.';
      return;
    }

    this.stream = stream;

    // Iniciar el juego inmediatamente, no esperamos a loadedmetadata.
    // El video puede cargar sus frames asíncronamente; el loop seguirá corriendo.
    this.cameraReady = true;
    this.errorOverlay.classList.add('hidden');
    this.motion.disableFallback();
    this.fallbackMode = false;

    this.lastTime = performance.now();
    this.running = true;
    this.paused = false;
    document.getElementById('overlay-pause').classList.add('hidden');
    requestAnimationFrame((t) => this.loop(t));
  }

  enableFallbackInput() {
    this.video.style.display = 'none';
    this.canvas.style.background = '#000';
    const rect = this.canvas.getBoundingClientRect();
    const onMove = (clientX, clientY) => {
      this.motion.setFallback(clientX - rect.left, clientY - rect.top);
    };
    window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
    window.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const t = e.touches[0];
      onMove(t.clientX, t.clientY);
    }, { passive: false });
  }

  enableFallback() {
    this.fallbackMode = true;
    this.cameraReady = true;
    this.errorOverlay.classList.add('hidden');
    this.enableFallbackInput();
  }

  resetState() {
    this.score = 0;
    this.lives = CONFIG.startLives;
    this.objects = [];
    this.spawnInterval = CONFIG.spawnIntervalBase;
    this.speed = CONFIG.speedBase;
    this.framesSinceDifficulty = 0;
    this.updateHUD();
    this.highScoreEl.textContent = this.highScore;
  }

  reset() {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.video.srcObject = null;
    this.cameraReady = false;
    this.motion.prevGray = null;
    this.setScreen('screen-start');
  }

  restartGame() {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.video.srcObject = null;
    this.cameraReady = false;
    this.fallbackMode = false;
    this.motion.prevGray = null;
    this.errorOverlay.classList.add('hidden');
    this.setScreen('screen-game');
    this.resetState();
    this.iniciarBucleConCamara();
  }

  setPaused(p) {
    this.paused = p;
    document.getElementById('overlay-pause').classList.toggle('hidden', !p);
    if (!p) {
      this.lastTime = performance.now();
      requestAnimationFrame((t) => this.loop(t));
    }
  }

  togglePause() {
    if (this.running && !this.paused) this.setPaused(true);
  }

  spawnObject(now) {
    if (now - this.lastSpawn < this.spawnInterval) return;
    const type = Math.random() < 0.75 ? 'fruit' : 'bomb';
    const size = CONFIG.objectSize;
    this.objects.push({
      x: Math.random() * (this.canvas.width - size),
      y: -size,
      w: size,
      h: size,
      type,
      vy: this.speed,
      collected: false,
      exploded: false,
      cooldown: 0
    });
    this.lastSpawn = now;
  }

  aabb(r1, r2) {
    return (
      r1.x < r2.x + r2.w &&
      r1.x + r1.w > r2.x &&
      r1.y < r2.y + r2.h &&
      r1.y + r1.h > r2.y
    );
  }

  loseLife() {
    if (this.lives <= 0) return;
    this.lives = Math.max(0, this.lives - 1);
    this.updateHUD();
    if (this.lives <= 0) {
      this.gameOver();
    }
  }

  updateObjects(now, dt) {
    const move = this.motion.update();
    // Compensa el espejo del contenedor: invierte X respecto al ancho del canvas
    let drawMove = null;
    if (move && move.active) {
      drawMove = {
        x: this.canvas.width - move.x - move.w,
        y: move.y,
        w: move.w,
        h: move.h,
        active: true
      };
    }

    for (const obj of this.objects) {
      if (obj.collected || obj.exploded) continue;
      if (obj.cooldown > 0) obj.cooldown--;

      obj.y += obj.vy * (dt / 16);
      obj.age = (obj.age || 0) + 1;

      // Fruta que llega al suelo sin ser tocada
      if (obj.y > this.canvas.height + obj.h) {
        if (obj.type === 'fruit') this.loseLife();
        obj.collected = true;
        continue;
      }

      // Colisión con el área de movimiento del usuario
      if (drawMove && drawMove.active && obj.cooldown === 0 && this.aabb(drawMove, obj)) {
        if (obj.type === 'fruit') {
          this.score += CONFIG.fruitScore;
          obj.collected = true;
          this.playSound('fruit');
        } else {
          this.loseLife();
          obj.exploded = true;
          this.playSound('bomb');
        }
        obj.cooldown = CONFIG.cooldownFrames;
      }
    }

    this.objects = this.objects.filter(
      (o) => !(o.collected || o.exploded || o.y > this.canvas.height + 120)
    );

    // Dificultad progresiva
    this.framesSinceDifficulty++;
    if (
      this.score > 0 &&
      this.score % CONFIG.difficultyEveryPoints === 0 &&
      this.framesSinceDifficulty > 600
    ) {
      this.speed += CONFIG.speedIncrement;
      this.spawnInterval = Math.max(400, this.spawnInterval - 100);
      this.framesSinceDifficulty = 0;
    }
  }

  drawObjects() {
    for (const obj of this.objects) {
      this.ctx.fillStyle = obj.type === 'fruit' ? '#4caf50' : '#f44336';
      this.ctx.beginPath();
      this.ctx.arc(obj.x + obj.w / 2, obj.y + obj.h / 2, obj.w / 2, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 2;
      this.ctx.stroke();

      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = '16px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(
        obj.type === 'fruit' ? '🍎' : '💣',
        obj.x + obj.w / 2,
        obj.y + obj.h / 2 + 4
      );
    }
  }

  drawMotion(move) {
    if (!move) return;
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    this.ctx.fillRect(move.x, move.y, move.w, move.h);
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(move.x, move.y, move.w, move.h);
  }

  loop(now) {
    if (!this.running) return;
    if (this.paused) return;

    const dt = now - this.lastTime;
    this.lastTime = now;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const move = this.motion.update();
    let drawMove = null;
    if (move && move.active) {
      drawMove = {
        x: this.canvas.width - move.x - move.w,
        y: move.y,
        w: move.w,
        h: move.h,
        active: true
      };
    }

    this.spawnObject(now);
    this.updateObjects(now, dt);
    this.drawObjects();
    if (drawMove) this.drawMotion(drawMove);

    requestAnimationFrame((t) => this.loop(t));
  }

  gameOver() {
    this.running = false;
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('af-highscore', String(this.highScore));
    }
    this.finalScoreEl.textContent = this.score;
    this.highScoreEl.textContent = this.highScore;
    this.setScreen('screen-gameover');
  }

  playSound(type) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      if (type === 'fruit') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1760, now + 0.12);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        osc.start(now);
        osc.stop(now + 0.16);
      } else if (type === 'bomb') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.22);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
        osc.start(now);
        osc.stop(now + 0.26);
      }
    } catch (e) {
      // Audio bloqueado sin interacción de usuario; no interrumpe el juego.
    }
  }
}

// Inicializar el juego cuando el DOM esté listo
window.addEventListener('DOMContentLoaded', () => {
  try {
    window.game = new Game();
    console.log('[AF] Juego inicializado correctamente');
  } catch (err) {
    console.error('[AF] Error inicializando el juego:', err);
    const msg = document.getElementById('msg-estado');
    if (msg) {
      msg.textContent = 'Error al iniciar el juego: ' + err.message;
      msg.className = 'msg-estado visible error';
    }
  }
});
