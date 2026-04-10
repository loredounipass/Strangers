# 💻 Arquitectura del Cliente (Frontend) - The Strangers

El cliente de **The Strangers** no es una simple página que "reproduce" un video; es una aplicación masivamente distribuida escrita bajo React y Vite. El objetivo del front-end es comportarse como un enrutador inteligente P2P (Peer-to-Peer), asumiendo toda la carga del servidor al enviar gigabytes de video directamente al navegador cruzado.

A continuación, la anatomía técnica detallada sobre cómo domina su red.

---

## 🏗️ 1. Estructura FSM (El Controlador de Tráfico)

En el mundo asíncrono y caótico de WebRTC, depender de variables comunes causa desastres (ej: hacer clic en "Next" dos veces crea túneles fantasma). Todo el cerebro gráfico de React y lógico está resguardado tras una **Máquina de Estados Finita (FSM)** (`useAppState.js`).

- **Doble Reactor (`useState` + `useRef`)**: Los ciclos de re-renderizado de React a veces tardan unos milisegundos de más. Para evitar que la conexión WebRTC lea estados viejos, el `FSM` utiliza un Ref síncrono al instante, mientras notifica a la UI que muestre botones dinámicamente.
- **La Burocracia del Flujo**: Existen compuertas estrictas: _[IDLE]_ → _[CONNECTING]_ → _[MATCHED]_ → _[NEGOTIATING]_ → _[CONNECTED]_. Ningún túnel WebRTC o Socket puede saltarse el flujo, previniendo el mortífero bug de colisión bidireccional (Glare).

---

## 📡 2. La Orquestación Sockets (`useSocket.js`)

Mientras `useWebRTC.js` transmite el video real, `useSocket.js` es el teléfono rojo que se comunica con el servidor Express para triangular el descubrimiento:

1. **Reclutamiento ICE Temprano**: Antes incluso de conectar los WebSockets, efectúa silenciosamente un `fetch` a `GET /ice` en Express. Mágicamente, absorbe y guarda localmente tus configuraciones secretas del servidor **Coturn en Docker**, sin quemar contraseñas estáticas de STUN/TURN en el código y habilitando alta compatibilidad de firewalls (NAT Simétricos).
2. **Triangulación Activa**: Reacciona perpetuamente inyectando datos. Si tú estás enviando un audio, el socket notifica `on('media:state')`. Si escribes texto, `on('typing')`.
3. **Escudo de Desconexión Temprana**: Posee un mecanismo matemático (*Exponential Backoff*). Si el servidor maestro de NodeJS tira un pico de latencia, el WebSocket no botará error en la cara del cliente. Disminuirá asíncronamente sus peticiones y reconectará en modo espectro progresivamente.

---

## 🎥 3. El Constructor de Túneles P2P (`useWebRTC.js`)

Aquí recae el milagro de "The Strangers". Una vez que `useSocket.js` avisa que Nodejs nos encontró un compañante (disparando el evento `"start"` y decidiendo quién es "p1" o "p2"), iniciamos la perforación de red WebRTC:

### A) Negociación de Medios (El Apretón de Manos SDP)
- **El Ofertante (P1)**: Inicia `createOffer()`. El navegador genera un documento gigante llamado **SDP** resumiendo en qué velocidad manda video y con qué compresores H264 o VP8 trabaja la webcam. Esto viaja por los Sockets y llega a Node.js quien se lo avienta a P2.
- **El Receptor (P2)**: Procesa pasivamente el diseño en memoria local con `handleSdp()`, acomoda su *LocalDescription*, y retorna un *Answer SDP* finalizando el puente filosófico.

### B) El Juego "Trickle ICE" y Perforación STUN/TURN
Ya tienen las configuraciones, pero les flata el plano de red:
- Al dispararse el navegador, el evento nativo `onicecandidate` comienza a inyectar "huecos". Tu cliente emite hacia Google STUN para averiguar tu IP real y comparte la "dirección" enviando `ice:send`.
- WebRTC encola cientos de candidatos en `pendingIceCandidates` hasta que el socket remoto confirme encendido. Cuando coinciden direcciones compatibles en ambos extremos, cruzan el video a máxima ganancia logrando el deseado estado `Connected` P2P, bajando la dependencia de servidores externos a cero mili-amperios. Del caso contrario, Coturn toma los paquetes y transfiere la carga del proxy.

### C) Auto Curación Extrema (ICE Restart Deadlock Fix)
Construiste uno de los parches de resiliencia de élite incrustado exclusivamente en `useWebRTC.js`:
**¿El Problema?:** En plataformas de video corrientes, si tu móvil entra en zona oscura y el Internet baja una raya fluctuando, el WebRTC colapsa marcando tu conexión UDP como `failed`.
**La Solución Mágica:** Insertamos lógicas de detección asíncrona dentro del capturador de errores y le otorgamos un tiempo de reseteo Cooldown de "10s". Esto desencadena un **Force ICE Restart**. Un túnel WebRTC de emergencia, inyectado por la "puerta trasera" saltándose intencionalmente los bloqueos del validador estricto del *FSM* y reconstruyendo mágicamente la arquitectura TURN en el mismo video estancado de la persona sin requerirles que teclear *"F5 Refresh"* nunca.

---

## 🎙️ 4. Custodia del Hardware Local (`useMedia.js`)

En vez de mutear los videos utilizando CSS o etiquetas estáticas en React, el Media Guardian reescribe directamente las entrañas del objeto *MediaStream* proveniente del `navigator.mediaDevices`.
- **Transmisión Cero**: Modificar dinámicamente `.track.enabled = false` causa un apagón de compresión a nivel del codec y un cese digital a los paquetes RTP en ruta WebRTC. Desaparece el glitcheo de micrófonos rebotantes y mantiene los botones GUI sincronizados con total destreza en toda la SPA.
