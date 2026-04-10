# 🧠 Arquitectura del Servidor (Backend) - The Strangers

El backend de **The Strangers** es un orquestador híbrido de alta disponibilidad. Sus venas están fabricadas en Node.js (TypeScript) complementado con Redis y Docker, y su propósito único no es enviar tu video, sino establecer la compleja "burocracia de red" necesaria para que dos máquinas hablen directamente cara a cara (P2P).

A continuación, la anatomía técnica precisa.

---

## 📡 1. La Coreografía de Red: Señalización, Sockets y P2P

WebRTC, el motor que envía el video y audio, es ciego e inmanejable por naturaleza. Jamás podría conectar dos navegadores a la deriva en el inmenso Internet sin alguien que los presente. A este proceso se le denomina **"Señalización" (Signaling)** y este backend de Express/Socket.IO es exactamente ese punto de encuentro.

### 🎥 ¿Cómo funciona la transmisión de Video real?
El backend **NUNCA** toca el streaming de video del usuario ni gasta CPU en codificar pixeles. El tráfico multimedia fluye **Directamente** (de computadora a computadora) gracias a que el servidor WebSockets hace el milagro de "presentarlos".

#### Cronología del Emparejamiento (Paso a Paso):
1. **La Sala de Espera (`socket.on('start')`)**: El Cliente A envía un mensaje Socket de que está listo. NodeJS lo inyecta a Redis marcándolo como `p1`. Llega el Cliente B (marcado como `p2`). NodeJS crea un UUID de Sala Privada y les envía telepáticamente a ambos:`"Tu partner tiene este socketID y la sala es la 33fd93f9"`.
2. **El Apretón de Manos SDP (Session Description Protocol)**: 
   - `p1` recopila los detalles técnicos del USB de su cámara y su resolución deseada y lo encapsula en un sobre WebRTC llamado *SDP Oferta*.
   - El front-end dispara `socket.emit('sdp:send', oferta)`.
   - NodeJS lo intercepta, sabe que A le habla a B por su sala y lo enruta (`io.to(PartnerId).emit('sdp:reply')`).
   - `p2` recibe la configuración de la cámara, acomoda la suya, y responde con una *SDP Respuesta*. NodeJS repite el puente.
3. **El Juego del Ratón y el Gato (Candidatos ICE)**: ¡Tienen el formato, ahora necesitan las rutas y las IPs! Ambos navegadores empiezan a escupir mini-paquetes UDP por cientos (vía `socket.emit('ice:send')`). El backend los redirige cruzados velozmente hasta que chocan y la conexión WebRTC explota en *Connected*. Cesa la señalización y nace el video P2P.

---

## 🐋 2. La Escalera de Resiliencia: Esquivando Firewalls (TURN/STUN Server)

El Internet es un lugar defensivo. El 30% de las videollamadas P2P se estrellarán contra NATs estrictos (por ejemplo, redes móviles 4G, redes corporativas de universidades, routers agresivos de oficinas). Aquí entra el **Contenedor Coturn alojado por el Servidor backend.**

Cuando el navegador del usuario inicializa `useSocket.js`, primero le toca la puerta a `GET /ice` en Express. Nuestro backend revisa el archivo de secretos `.env` (`TURN_URL`) y le contesta regalándole permisos limitados en JSON a los servidores de rescate.

El cliente entonces intentará conectar bajo esta jerarquía de supervivencia:
- **Nivel 1 (Conexión Host-to-Host):** Tratan de conectarse usando sus redes hogareñas locales. Casi nunca funciona a larga distancia cruzando mares.
- **Nivel 2 (Triangulación STUN):** Es nuestra primera carta de `/ice`. Envían una notificación al exterior (ej: los servidores de Google que regalamos), lo que revela su "IP Pública Cruda". El 70% de las citas WebRTC florecen y viajan puramente vía P2P gracias a esto.
- **Nivel 3 (El Relé de Rescate TURN):** Si estamos dentro de un bloqueo de firewall (Symmetric NAT), ocurre lo imposible: P1 y P2 envían todo el flujo gigabyte de video a la IP del contenedor Docker del backend (puerto físico reservado del `49152` al `49160` y auth `3478`). El **servidor TURN** recoge los videos UDP encriptados, hace de espejo de rebote en los puertos, y se lo reinyecta hacia las computadoras, saltándose el firewall. **¡Magia P2P salvada por un relevo central proxy!**

---

## 3. Topología Horizontal del Servidor (Matchmaking Distribuido)

El sistema en `server/src/lib.ts`, utiliza colas asíncronas para garantizar que si escalas de 1 a N contenedores, nada se rompa:
- En lugar de emparejar físicamente a la RAM (`io.sockets.sockets.get()`), NodeJS se adiestró usando inyección de canales abstractos: `io.in(p1SocketId).socketsJoin()`. 
- Si contratas un Amazon Web Services con capacidad masiva y acoplas el complemento Redis `socket.io-redis`, el Sistema Operativo 1 emparejará felizmente a alguien navegando en el Sistema Operativo 2 sin congelar transacciones gracias a la programación genérica agnóstica a la RAM. 

---

## 4. Seguridad de Red y Rate-Limiting Anti-DDoS

La seguridad (`server/src/index.ts` y `server/src/rateLimiter.ts`) se opera en 3 capas de defensa:

- **CORS Estricto por `.env`**: El flujo se niega en rotundo a servir a dominios inyectados que no estén estipulados en `ALLOWED_ORIGINS`.
- **Sliding Window Distribuida**: Protegiendo contra Ráfagas Spam al WebSocket, el ZSET de Redis monitoriza los rangos por segundo. Si un bot entra a lanzar eventos continuos, nodejs dispara errores y cierra la llave en el front-end con tiempo castigo (`retryAfter`).
- **Protección Anti IP-Spoofing Integrada**: La función `getClientIp` está educada para desenmascarar el TCP real saltándose el fraude muy común en donde herramientas inyectan `X-Forwarded-For` falsos a menos que se halle validado por entorno confiable (`TRUST_PROXY`).

---

## 5. Estabilidad y Limpiador de Memoria (Async HSCAN Zombies)

A medida que suceden desconexiones repentinas o intermitencias en la red, salas enteras en el ecosistema virtual podrían quedar "Huérfanas" colgando para siempre.
- La rutina de mantenimiento en Node.js delega a `redisState.ts` y la magia se recuesta sobre cursores **(`HSCAN`)**. 
- Cada 30 segundos, extrayendo de cien en 100, este bucle silente de bajo-consumo depura conexiones obsoletas o estancadas con más de un minuto en inactividad, erradicando los "Memory Leaks" y evitando paralizar por completo los miles de micro-ticks del *Event-Loop* de C++ nativo de V8/Node.
