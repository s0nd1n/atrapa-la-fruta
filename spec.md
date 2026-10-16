# Especificaciones del proyecto


# Especificación Técnica: Juego Interactivo "Atrapa la Fruta Caída" (Webcam)

## 1. Visión General
Módulo web interactivo en tiempo real que utiliza la cámara web del usuario para jugar a un mini-juego estilo Arcade. Los objetos virtuales (frutas y bombas) caen desde la parte superior de la pantalla superpuestos sobre el flujo de video en vivo. El usuario interactúa físicamente moviendo sus manos frente a la cámara para "tocar" y recolectar u esquivar los objetos.

---

## 2. Requisitos Funcionales

### 2.1. Gestión de la Cámara y Permisos
* La aplicación debe solicitar acceso a la cámara web utilizando la API `navigator.mediaDevices.getUserMedia`.
* Debe mostrarse una pantalla/modal de solicitud de permisos clara si la cámara no está habilitada.
* El video debe renderizarse reflejado horizontalmente (efecto espejo) para que los movimientos del usuario sean intuitivos.

### 2.2. Detección de Movimiento (Motion Tracking)
* Implementar detección de movimiento basada en la diferencia de píxeles entre fotogramas (*frame differencing*) usando un elemento `<canvas>`.
* El sistema debe identificar zonas donde exista un cambio significativo de movimiento para registrar una "colisión".

### 2.3. Lógica del Juego y Mecánicas
* **Generación de Objetos:**
  * Aparecen objetos aleatorios desde la parte superior de la pantalla y caen verticalmente a una velocidad constante/progresiva.
  * **Tipos de objetos:**
    *  **Frutas (Objetos Positivos):** Otorgan +10 puntos al ser tocadas.
    *  **Bombas (Objetos Negativos):** Restan 1 vida o resta puntos al ser tocadas.
* **Detección de Colisión:**
  * Si el área de movimiento del usuario se superpone con la caja de colisión (*hitbox*) de una fruta, se activa la acción de recolección (efecto visual/sonido + suma de puntos + desaparición del objeto).
* **Sistema de Vidas y Puntuación:**
  * El usuario inicia con 3 vidas.
  * Si una fruta llega al borde inferior sin ser tocada, o si el usuario toca una bomba, pierde 1 vida.
  * El juego termina (*Game Over*) cuando las vidas llegan a 0.

### 2.4. Interfaz de Usuario (UI/HUD)
* **Pantalla de Inicio:** Botón flotante "Comenzar Juego" para activar la cámara.
* **Overlay del Juego (HUD):**
  * Contador de Puntuación actual (arriba a la izquierda).
  * Contador de Vidas / Corazones (arriba a la derecha).
* **Pantalla de Game Over:** Muestra la puntuación final y un botón para "Reiniciar".

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

Escenario: El usuario toca una bomba o deja caer una fruta
  Dado que el juego está activo
  Cuando el usuario toca una bomba O una fruta toca el suelo
  Entonces el contador de vidas disminuye en 1.