# Especificaciones del proyecto


# Especificación Técnica: Juego Interactivo "Atrapa la Fruta Caída" (Webcam)

## 1. Visión General
Módulo web interactivo en tiempo real que utiliza la cámara web del usuario para jugar a un mini-juego estilo Arcade. Los objetos virtuales (frutas y bombas) caen desde la parte superior de la pantalla superpuestos sobre el flujo de video en vivo. El usuario interactúa físicamente moviendo sus manos frente a la cámara para "tocar" y recolectar u esquivar los objetos.

El objetivo del MVP es un juego de un solo jugador, ejecutado completamente en el navegador (cliente-side), sin servidor ni cuentas de usuario. El flujo de cámara y todo el procesamiento de video ocurren localmente en el dispositivo del usuario.

---

## 2. Requisitos Funcionales

### 2.1. Gestión de la Cámara y Permisos
* La aplicación debe solicitar acceso a la cámara web utilizando la API `navigator.mediaDevices.getUserMedia({ video: true })`.
* Debe mostrarse una pantalla/modal de solicitud de permisos clara antes de iniciar el juego, explicando por qué se necesita la cámara y cómo se usa (solo localmente, sin subir imágenes).
* El video debe renderizarse reflejado horizontalmente (efecto espejo) para que los movimientos del usuario sean intuitivos.
* Si el usuario deniega el permiso o no dispone de cámara, la aplicación debe mostrar un mensaje de error amigable y ofrecer un modo alternativo de prueba con mouse/touch (ver 2.8).
* El acceso a la cámara requiere contexto seguro (HTTPS) en producción; `localhost` está exento.
* Debe existir un botón para apagar/encender la cámara y detener los tracks de video cuando el juego no está activo.

### 2.2. Detección de Movimiento (Motion Tracking)
* Implementar detección de movimiento basada en la diferencia de píxeles entre fotogramas consecutivos (*frame differencing*) usando un elemento `<canvas>` oculto o secundario.
* El sistema debe convertir una imagen de video a escala de grises, aplicar un desenlace suave (blur) para reducir ruido, calcular el差 absoluto con el fotograma anterior y binarizar el resultado con un umbral de sensibilidad configurable.
* Se deben identificar las zonas donde existe cambio significativo de movimiento y representar el área activa como un rectángulo delimitador (*bounding box*) o máscara de movimiento.
* Las coordenadas del área de movimiento deben mapearse del espacio del video al espacio de la pantalla del juego, compensando el efecto espejo y posibles diferencias de resolución entre el stream de la cámara y el canvas del juego.
* El umbral de sensibilidad y el área mínima de movimiento deben ser ajustables para adaptarse a diferentes condiciones de iluminación.

### 2.3. Lógica del Juego y Mecánicas
* **Generación de Objetos:**
  * Aparecen objetos aleatorios desde la parte superior de la pantalla en una posición X aleatoria y caen verticalmente.
  * La velocidad de caída es constante inicialmente y puede volverse progresiva con el tiempo o la puntuación (ver 2.7).
  * La frecuencia de spawn es configurable y aumenta con la dificultad.
* **Tipos de objetos:**
  * **Frutas (Objetos Positivos):** Otorgan +10 puntos al ser tocadas. Diferentes tipos de fruta pueden otorgar distinto puntaje (ver 2.7).
  * **Bombas (Objetos Negativas):** Restan 1 vida al ser tocadas.
* **Detección de Colisión:**
  * Si el área de movimiento del usuario se superpone con la *hitbox* de un objeto, se activa la acción correspondiente (recolección de fruta o explosión de bomba).
  * Al tocar una fruta: efecto visual (parpadeo/partículas), sonido, suma de puntos y desaparición del objeto.
  * Al tocar una bomba: efecto visual, sonido, resta de vida y desaparición del objeto.
  * Debe aplicarse un breve período de invulnerabilidad o cooldown tras una colisión para evitar que un mismo objeto cuente múltiples veces en fotogramas consecutivos.
* **Sistema de Vidas y Puntuación:**
  * El usuario inicia con 3 vidas.
  * Si una fruta llega al borde inferior sin ser tocada, se pierde 1 vida y el objeto desaparece.
  * Si el usuario toca una bomba, se pierde 1 vida.
  * El juego termina (*Game Over*) cuando las vidas llegan a 0.
  * La puntuación se acumula durante la partida y se muestra en tiempo real.

### 2.4. Interfaz de Usuario (UI/HUD)
* **Pantalla de Inicio:** Botón flotante "Comenzar Juego" centrado que activa la cámara y arranca el bucle del juego.
* **Overlay del Juego (HUD):**
  * Contador de Puntuación actual (arriba a la izquierda).
  * Contador de Vidas representado con corazones o número (arriba a la derecha).
* **Pantalla de Game Over:** Muestra la puntuación final, la puntuación más alta histórica (si corresponde) y un botón para "Reiniciar".
* **Pantalla de Pausa (opcional):** Superposición que detiene el juego y muestra un botón "Reanudar".
* Todos los textos y botones deben estar en español y tener suficiente contraste para accesibilidad.

### 2.5. Requisitos No Funcionales
* **Rendimiento:** El bucle principal debe ejecutarse con `requestAnimationFrame` apuntando a 60 FPS. La detección de movimiento no debe bloquear el hilo principal.
* **Privacidad:** El flujo de la cámara nunca sale del dispositivo del usuario, no se sube a ningún servidor ni se almacena. Debe incluirse un aviso breve de privacidad en la pantalla de solicitud de permisos.
* **Compatibilidad:** Navegadores modernos que soporten `getUserMedia`, `Canvas API` y `requestAnimationFrame` (Chrome, Edge, Firefox, Safari en desktop y móvil). En producción requiere HTTPS; en desarrollo `localhost` es suficiente.
* **Accesibilidad:** Botones con etiquetas ARIA, navegación básica por teclado para menús (inicio, reinicio, pausa) y contraste mínimo WCAG AA en textos e interfaz.
* **Manejo de errores:** Mensajes claros y accionables cuando se deniega el permiso, no hay cámara disponible, o el navegador no soporta las APIs requeridas.

### 2.6. Stack Tecnológico y Estructura de Archivos
* **Tecnologías:** Vanilla HTML5, CSS3 y JavaScript (ES6+). Sin frameworks ni librerías de terceros obligatorias, para mantener el proyecto ligero y fácil de desplegar.
* **APIs del navegador:** `navigator.mediaDevices.getUserMedia`, `Canvas API` (video y renderizado de objetos), `requestAnimationFrame`, `Web Audio API` o elemento `<audio>` para sonidos, `localStorage` para la puntuación más alta.
* **Estructura sugerida:**
  ```
  index.html          # Punto de entrada y markup de pantallas (inicio, juego, game over)
  style.css           # Estilos, incluyendo efecto espejo del video y HUD
  game.js             # Lógica del juego, bucle principal, spawn, colisiones, puntuación
  motion.js           # Detección de movimiento por frame differencing
  assets/
    images/           # Sprites de frutas y bombas (o figuras geométricas de fallback)
    audio/            # Sonidos de recolección, bomba, game over, inicio
  ```
* Los sprites de frutas y bombas pueden ser imágenes simples o figuras geométricas coloreadas (círculos, rectángulos) como fallback si no hay assets gráficos.

### 2.7. Dificultad Progresiva
* La velocidad de caída de los objetos aumenta gradualmente cada N segundos o cada X puntos acumulados.
* La frecuencia de spawn se incrementa con la puntuación para reducir el tiempo entre apariciones.
* Opcionalmente, pueden introducirse frutas con distinto valor (por ejemplo, manzana +10, banana +15, golden apple +25) con probabilidades de aparición diferentes.
* Las bombas pueden aparecer con mayor frecuencia a medida que avanza la partida.

### 2.8. Flujo Extendido, Pausa y Fallbacks
* **Reinicio:** El botón "Reiniciar" en Game Over restablece puntuación, vidas, objetos en pantalla y velocidad a sus valores iniciales, sin recargar la página.
* **Pausa:** Existe una acción de pausa (tecla `P` o botón en pantalla) que congela el bucle del juego y el movimiento de objetos, manteniendo la cámara activa.
* **Modo sin cámara (fallback):** Cuando no hay cámara o el permiso es denegado, se habilita un modo de desarrollo/prueba donde el usuario puede mover un cursor con el mouse o tocar la pantalla para simular el área de movimiento y colisiones.
* **Limpieza:** Al cerrar la pestaña o salir del juego, se deben detener los tracks de la cámara para liberar el hardware y apagar el indicador de grabación del dispositivo.

---

## 3. Criterios de Aceptación (BDD)

```gherkin
Escenario: El usuario otorga permiso y comienza el juego
  Dado que el usuario está en la página web
  Cuando hace clic en "Comenzar Juego" y acepta los permisos de la cámara
  Entonces el video de la webcam se muestra en pantalla con efecto espejo
  Y los objetos (frutas) comienzan a caer desde la parte superior.

Escenario: El usuario atrapa una fruta con la mano
  Dado que una fruta está cayendo en la pantalla
  Cuando el usuario mueve la mano sobre la fruta
  Entonces la fruta desaparece
  Y el marcador de puntuación se incrementa en 10 puntos.
  Y se reproduce un efecto de sonido de recolección.

Escenario: El usuario toca una bomba
  Dado que el juego está activo y una bomba está cayendo
  Cuando el usuario mueve la mano sobre la bomba
  Entonces la bomba desaparece
  Y el contador de vidas disminuye en 1.
  Y se reproduce un efecto de sonido de explosión.

Escenario: El usuario deja caer una fruta hasta el suelo
  Dado que el juego está activo y una fruta está cayendo
  Cuando la fruta llega al borde inferior sin ser tocada
  Entonces la fruta desaparece
  Y el contador de vidas disminuye en 1.

Escenario: El usuario deniega el permiso de la cámara
  Dado que el usuario está en la página web
  Cuando hace clic en "Comenzar Juego" y deniega el acceso a la cámara
  Entonces se muestra un mensaje de error explicando que se requiere la cámara
  Y se ofrece un modo alternativo con mouse/touch para probar el juego.

Escenario: Fin del juego por falta de vidas
  Dado que el contador de vidas llega a 0
  Entonces se muestra la pantalla de Game Over
  Y se muestra la puntuación final obtenida
  Y se muestra la puntuación más alta histórica si supera el récord previo.
  Y aparece un botón "Reiniciar" para comenzar una nueva partida.

Escenario: Reinicio del juego
  Dado que el juego terminó en pantalla de Game Over
  Cuando el usuario hace clic en "Reiniciar"
  Entonces la puntuación vuelve a 0
  Y las vidas vuelven a 3
  Y los objetos en pantalla se eliminan
  Y comienza una nueva partida con la cámara activa.

Escenario: Pausa y reanudación del juego
  Dado que el juego está activo
  Cuando el usuario activa la pausa (tecla P o botón de pausa)
  Entonces el movimiento de los objetos se congela
  Y el bucle del juego se detiene temporalmente
  Cuando el usuario reanuda el juego
  Entonces los objetos continúan cayendo desde donde estaban.
```