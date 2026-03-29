# Explicación Técnica del Sistema Strangers

## 1. Arquitectura General del Sistema

### 1.1 Visión de Conjunto

El sistema "Strangers" es una aplicación de chat de video aleatorio similar a Omegle. La arquitectura se divide en tres componentes principales:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ARQUITECTURA DEL SISTEMA                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────┐         ┌─────────────────────┐         ┌───────────┐ │
│   │  Cliente 1  │◄───────►│                     │◄───────►│ Cliente 2 │ │
│   │  (P1)       │  P2P    │   SERVIDOR (Port   │  P2P    │  (P2)     │ │
│   │  WebRTC     │         │   8000 - Socket.io) │         │  WebRTC   │ │
│   └─────────────┘         │                     │         └───────────┘ │
│                           │  - Señalización    │                      │
│                           │  - Matchmaking     │                      │
│                           │  - Chat relay      │                      │
│                           └─────────────────────┘                      │
│                                                                         │
│   WebRTC: Conexión directa entre clientes                               │
│   Socket.io: Canal de señalización y datos pequeños                    │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Stack Tecnológico

- **Backend**: Node.js + Express + Socket.io
- **Frontend**: Vanilla JavaScript + Vite
- **Comunicación en tiempo real**: WebRTC (P2P) + Socket.io (señalización)
- **Protocolo de transporte**: WebSocket con fallback a HTTP long-polling

---

## 2. El Servidor: Socket.io y Señalización

### 2.1 Propósito del Servidor

El servidor en este sistema **NO transmite video ni audio**. Su función es:

1. **Matchmaking**: Emparejar usuarios aleatorios
2. **Señalización**: Facilitar el intercambio de información WebRTC (SDP e ICE candidates)
3. **Gestión de salas**: Mantener el estado de las conexiones
4. **Chat relay**: Reenviar mensajes de texto cuando sea necesario
5. **Estadísticas**: Contar usuarios online

### 2.2 Estructura del Servidor (index.ts)

```typescript
// Inicialización del servidor Express y Socket.io
const app = express();
const server = app.listen(8000, () => console.log('Server is up, 8000'));
const io = new Server(server, {
  pingTimeout: 10000,    // Tiempo para detectar desconexión
  pingInterval: 5000,   // Intervalo de ping
});
```

**Configuración de Socket.io:**
- `pingTimeout`: 10000ms - Tiempo máximo de espera para respuesta de ping
- `pingInterval`: 5000ms - Frecuencia de verificación de conexión
- CORS configurado para permitir conexiones desde cualquier origen

### 2.3 Eventos del Socket

#### Eventos recibidos del cliente:

| Evento | Descripción | Datos |
|--------|-------------|-------|
| `start` | Inicia búsqueda de pareja | Callback con tipo (p1/p2) |
| `next` | Busca nueva pareja | - |
| `leave` | Abandona la sala actual | - |
| `disconnect-me` | Desconexión manual | - |
| `sdp:send` | Envía Session Description Protocol | `{ sdp: {...} }` |
| `ice:send` | Envía ICE candidates | `{ candidate: {...} }` |
| `send-message` | Envía mensaje de chat | `(message, userType, roomid)` |
| `typing` | Indicador de escritura | `{ roomid, isTyping }` |

#### Eventos enviados al cliente:

| Evento | Descripción |
|--------|-------------|
| `online` | Cantidad de usuarios conectados |
| `start` | Tipo de usuario asignado (p1/p2) |
| `roomid` | ID de la sala asignada |
| `remote-socket` | ID del socket del compañero |
| `disconnected` | El compañero se desconectó |
| `sdp:reply` | Respuesta SDP del compañero |
| `ice:reply` | ICE candidate del compañero |
| `get-message` | Mensaje de chat recibido |
| `typing` | El compañero está escribiendo |

### 2.4 Flujo de Matchmaking

```
┌──────────────────────────────────────────────────────────────────┐
│                    FLUJO DE MATCHMAKING                          │
└──────────────────────────────────────────────────────────────────┘

1. Usuario conecta al servidor
   │
   ▼
2. Usuario envía evento 'start'
   │
   ▼
3. Servidor busca sala disponible:
   │
   ├──► ¿Hay sala disponible?
   │    │
   │    ├── SÍ: Unir usuario a sala existente
   │    │         │
   │    │         ▼
   │    │    Notificar a ambos usuarios (p1, p2)
   │    │    Intercambiar IDs de socket
   │    │         │
   │    │         ▼
   │    │    Iniciar negociación WebRTC
   │    │
   │    └── NO: Crear nueva sala
   │              │
   │              ▼
   │         Asignar como p1 (esperando p2)
   │         Esperar próximo usuario
   │
   ▼
4. Ambos usuarios ahora tienen conexión P2P
```

### 2.5 Gestión de Salas (lib.ts)

```typescript
// Estructura de una sala
interface room {
  roomid: string,           // Identificador único (UUID)
  isAvailable: boolean,     // Si acepta nuevos usuarios
  p1: { id: string | null }, // Jugador 1
  p2: { id: string | null }  // Jugador 2
}
```

**Algoritmo de búsqueda de sala:**
1. Itera sobre el array `roomArr`
2. Busca salas donde `isAvailable === true` y el usuario no sea p1
3. Si encuentra, asigna como p2 y marca la sala como no disponible
4. Si no encuentra, crea nueva sala y asigna como p1

### 2.6 Señalización WebRTC

El servidor actúa como "relé" para la señalización WebRTC:

```typescript
// Reenvío de SDP (Session Description Protocol)
socket.on('sdp:send', (data) => {
  const type = getType(socket.id, roomArr);
  if (type && 'type' in type) {
    const target = type.type === 'p1' ? type.p2id : type.p1id;
    if (target) {
      io.to(target).emit('sdp:reply', { sdp: data.sdp, from: socket.id });
    }
  }
});

// Reenvío de ICE Candidates
socket.on('ice:send', (data) => {
  const type = getType(socket.id, roomArr);
  if (type && 'type' in type) {
    const target = type.type === 'p1' ? type.p2id : type.p1id;
    if (target) {
      io.to(target).emit('ice:reply', { candidate: data.candidate, from: socket.id });
    }
  }
});
```

---

## 3. El Cliente: WebRTC y Lógica de Conexión

### 3.1 Inicialización del Cliente

```javascript
// Conexión al servidor de señalización
socket = io('https://urban-capybara-jv4j5754gpw3qpv6-8000.app.github.dev');

// Obtener acceso a cámara y micrófono
localStream = await navigator.mediaDevices.getUserMedia({
  audio: { echoCancellation: true, noiseSuppression: true },
  video: { width: 1280, height: 720, frameRate: 30 }
});
```

### 3.2 Configuración WebRTC

```javascript
// Crear RTCPeerConnection con servidores STUN
peer = new RTCPeerConnection({
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' }
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',   // Unir audio y video en un flujo
  rtcpMuxPolicy: 'require'       // Multiplexación RTCP obligatoria
});
```

**Sistemas STUN utilizados:**
- `stun.l.google.com:19302` - Servidor STUN público de Google
- Permiten a los clientes descubrir su IP pública y puerto

### 3.3 Negociación WebRTC

```
┌─────────────────────────────────────────────────────────────────────┐
│              NEGOCIACIÓN WEBRTC (OFERTA/RESPUESTA)                │
└─────────────────────────────────────────────────────────────────────┘

  CLIENTE A (p1)                           CLIENTE B (p2)
       │                                          │
       │  1. createOffer()                        │
       │     (crea SDP oferta)                    │
       │         │                                 │
       │         ▼                                 │
       │  2. setLocalDescription(offer)            │
       │         │                                 │
       │         ▼                                 │
       │  3. ───────── sdp:send ──────────────►   │
       │     (envía oferta vía servidor)           │
       │         │                                 │
       │         ▼                                 │
       │                                      4. setRemoteDescription(offer)
       │         │                                 │
       │         ▼                                 │
       │                                 5. createAnswer()
       │                                 │         │
       │                                 ▼         │
       │                            6. setLocalDescription(answer)
       │                                 │         │
       │                                 ▼         │
       │  7. ◄───────── sdp:reply ──────────    (envía respuesta)
       │         │                                 │
       │         ▼                                 │
       │  8. setRemoteDescription(answer)            │
       │         │                                 │
       │         ▼                                 │
       │  9. ──── ice:send (candidates) ──────►   │
       │     (intercambio de candidatos ICE)       │
       │         │                                 │
       │         ▼                                 │
       │                                    10. addIceCandidate()
       │         │                                 │
       │         ▼                                 │
       │  11. ◄──── ice:reply (candidates) ────    │
       │         │                                 │
       │         ▼                                 │
       │  12. addIceCandidate()                     │
       │         │                                 │
       │         ▼                                 │
       │  13. Conexión P2P establecida!            │
       │         │                                 │
       │         ▼                                 │
       │  14. ontrack() → Reproducir video         │
       │                                          │
       ▼                                          ▼
```

### 3.4 Calidad de Video/Audio Configurada

```javascript
// Configuración de bitrate para video
params.encodings[0] = {
  maxBitrate: 2500000,    // 2.5 Mbps máximo
  minBitrate: 500000,     // 500 Kbps mínimo
  scalabilityMode: 'L1T3'
};

// Configuración de audio
params.encodings[0] = {
  maxBitrate: 128000,     // 128 Kbps
  priority: 'high',
  networkPriority: 'high'
};
```

### 3.5 Manejo de Desconexiones

```javascript
socket.on('disconnected', () => {
  fullCleanup();          // Limpiar recursos
  restartConnection();    // Buscar nueva pareja
});
```

---

## 4. Rendimiento y Escalabilidad

### 4.1 Análisis de Recursos

#### Costos por conexión:

| Recurso | Cantidad | Notas |
|---------|----------|-------|
| Socket TCP | 1 | Conexión persistente al servidor |
| Memoria RAM | ~50-100 KB | Estado de sala y socket |
| CPU | Mínimo | Solo relé de mensajes |
| Ancho de banda servidor | ~1-5 KB/s | Solo señalización, no video |

**El servidor NO usa recursos significativos para video/audio** porque la conexión es P2P entre clientes.

### 4.2 Límites Prácticos por Servidor

Considerando una sola instancia de Node.js:

| Métrica | Límite estimado | Notas |
|---------|----------------|-------|
| Conexiones simultáneas | 5,000 - 10,000 | Depende del hardware |
| Salas activas | ~2,500 - 5,000 | Cada sala = 2 usuarios |
| Mensajes/segundo | 10,000+ | Socket.io es muy eficiente |
| Memoria RAM | 1-2 GB | Con 5000 conexiones |

### 4.3 Escalabilidad Horizontal

Para escalar a millones de usuarios, se necesita:

```
┌─────────────────────────────────────────────────────────────────────┐
│                  ARQUITECTURA ESCALABLE (ALTA CAPACIDAD)            │
└─────────────────────────────────────────────────────────────────────┘

                              ┌─────────────────┐
                              │   Load Balancer │
                              │   (Nginx/HAProxy)│
                              └────────┬────────┘
                                       │
          ┌────────────────────────────┼────────────────────────────┐
          │                            │                            │
          ▼                            ▼                            ▼
   ┌──────────────┐           ┌──────────────┐           ┌──────────────┐
   │  Servidor 1  │           │  Servidor 2  │           │  Servidor N  │
   │  Socket.io   │           │  Socket.io   │           │  Socket.io   │
   └──────┬───────┘           └──────┬───────┘           └──────┬───────┘
          │                            │                            │
          └────────────────────────────┼────────────────────────────┘
                                       │
                              ┌────────▼────────┐
                              │   Redis Pub/Sub │
                              │   (Mensajes     │
                              │   entre servers)│
                              └─────────────────┘
                                       │
                              ┌────────▼────────┐
                              │  Redis Cluster  │
                              │  (Sesiones y    │
                              │   estado)        │
                              └─────────────────┘
```

### 4.4 Cantidad de Servidores Estimada

| UsuariosConcurrentes | Servidores needed | Notas |
|---------------------|-------------------|-------|
| 10,000 | 1-2 | Un servidor puede manejar esto |
| 100,000 | 10-20 | Requiere Redis para pub/sub |
| 1,000,000 | 100-200 | Clusters distribuidos, múltiples regiones |
| 10,000,000 | 1000+ | Geodistribución, edge computing |

### 4.5 Consideraciones de Red

**Latencia aceptable para chat de video:**
- < 100ms: Excelente
- 100-200ms: Aceptable
- > 300ms: Problemas de sincronización

**Estrategias para reducir latencia:**
1. **Ubicación de servidores**: Instalar en múltiples regiones (US, EU, Asia)
2. **Edge computing**: Usar Cloudflare Workers o similares para señalización
3. **STUN/TURN servers**: Implementar servidores TURN para conexiones problemáticas

---

## 5. Redes P2P Profesionales

### 5.1 Diferencia entre este sistema y P2P puro

**Lo que tiene tu sistema:**
- ✓ Conexiones directas P2P para audio/video (WebRTC)
- ✓ Servidor central para señalización
- ✓ Matchmaking centralizado

**Lo que tendría un sistema P2P profesional:**

### 5.2 Arquitecturas P2P Avanzadas

#### A) Pure P2P (Sin servidor central)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ARQUITECTURA P2P PURA                           │
└─────────────────────────────────────────────────────────────────────┘

   ┌──────┐      ┌──────┐      ┌──────┐      ┌──────┐
   │Peer A│◄────►│Peer B│◄────►│Peer C│◄────►│Peer D│
   └──────┘      └──────┘      └──────┘      └──────┘
       │            │            │            │
       └────────────┴────────────┴────────────┘
                    │
            ┌───────▼───────┐
            │  DHT (Kademlia)│
            │  - Bootnodes   │
            │  - Peer ID     │
            │  - Discovery   │
            └────────────────┘

Problemas: 
- Dificultad de NAT traversal
- No hay forma de "emparejar" usuarios
- Complejidad de implementación
```

#### B) Hybrid P2P (Como tu sistema actual)

```
┌─────────────────────────────────────────────────────────────────────┐
│                   ARQUITECTURA HÍBRIDA P2P                          │
└─────────────────────────────────────────────────────────────────────┘

   SEÑALIZACIÓN (Servidor)          DATOS (P2P Directo)
   ┌─────────────────────┐           ┌─────────────────────────────┐
   │ • Matchmaking       │           │ • Audio (WebRTC)           │
   │ • ICE Discovery    │           │ • Video (WebRTC)           │
   │ • Estado de sesión  │           │ • Chat P2P (opcional)      │
   │ • Fallback TURN     │           │                             │
   └─────────────────────┘           └─────────────────────────────┘
```

### 5.3 Servidores TURN (Necesarios para producción)

Los servidores STUN no son suficientes cuando hay:
- NAT simétrico
- Firewalls corporativos
- Conexiones IPv4 a IPv6

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ESCALERA TURN (STUN/TURN)                        │
└─────────────────────────────────────────────────────────────────────┘

   Peer A                              Peer B
      │                                    │
      │  1. Pedir candidatos ICE           │
      │─────────────────────────────────► │
      │                                    │
      │  2. STUN: "Tu IP pública es X"    │
      │◄────────────────────────────────── │
      │                                    │
      │  3. Intentar conexión directa     │
      │     (falla si NAT bloquea)        │
      │─────── ✗ (bloqueado) ─────────────►│
      │                                    │
      │  4. Usar TURN como relay          │
      │───────► [TURN Server] ────────►    │
      │         (tráfico reenviado)        │
      │                                    │
      ▼                                    ▼

Costos de TURN:
- Ancho de banda del servidor aumenta DRAMÁTICAMENTE
- Cada conexión TURN = ~1-5 Mbps (video)
- Costo en nube:~$0.005/GB aproximado
```

### 5.4 Comparación de arquitecturas

| Característica | Tu Sistema | P2P Puro | Servidor Central |
|----------------|-------------|----------|------------------|
| Complejidad | Media | Muy alta | Media |
| Costo servidor | Bajo | Muy bajo | Alto |
| Escalabilidad | Alta | Muy alta | Media |
| Latencia video | Baja (P2P) | Variable | Alta |
| Privacidad | Media | Alta | Baja |
| Firewall/NAT | STUN básico | Problemático | Sin problemas |

### 5.5 Mejoras profesionales recomendadas

#### 1. Instalar servidor TURN

```bash
# Usar coturn (open source)
# Configurar en /etc/turnserver.conf

realm=your-domain.com
external-ip=YOUR_PUBLIC_IP
 listening-port=3478
 tls-listening-port=5349
 user=testuser:password
```

#### 2. Agregar más servidores STUN/TURN

```javascript
// Configuración mejorada de ICE
peer = new RTCPeerConnection({
  iceServers: [
    // STUN públicos
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    
    // Tu servidor TURN (producción)
    { 
      urls: 'turn:your-turn-server.com:3478',
      username: 'user',
      credential: 'password'
    },
    
    // Servidores TURN de terceros (Twilio, Metered)
    {
      urls: 'turn:global.turn.twilio.com:3478',
      username: 'xxx',
      credential: 'xxx'
    }
  ]
});
```

#### 3. Balanceador de carga con Redis

```javascript
// server/index.js - Adaptación para múltiples instancias
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');

const pubClient = createClient({ url: 'redis://localhost:6379' });
const subClient = pubClient.duplicate();

io.adapter(createAdapter(pubClient, subClient));
```

#### 4. Métricas y monitoreo

```javascript
// Métricas a monitorear
const metrics = {
  onlineUsers: 0,
  activeRooms: 0,
  connectionsPerMinute: 0,
  avgConnectionTime: 0,
  failedConnections: 0,
  webrtcConnectionFailures: 0
};
```

---

## 6. Seguridad

### 6.1 Vulnerabilidades actuales y mitigaciones

| Vulnerabilidad | Riesgo | Mitigación |
|----------------|--------|------------|
| Sin autenticación | Bajo | No necesaria para chat anónimo |
| XSS en chat | Medio | Sanitizar mensajes HTML |
| Denegación de servicio | Alto | Rate limiting |
| ICE injection | Bajo | Validar candidatos |

### 6.2 Recomendaciones de seguridad

```javascript
// Rate limiting para eventos
const rateLimit = new Map();

socket.on('send-message', (input) => {
  const userId = socket.id;
  const now = Date.now();
  
  // Limitar a 1 mensaje por segundo
  if (rateLimit.has(userId)) {
    const lastTime = rateLimit.get(userId);
    if (now - lastTime < 1000) return;
  }
  rateLimit.set(userId, now);
  
  // Sanitizar input
  const sanitized = input.replace(/</g, "&lt;").replace(/>/g, "&gt;");
});
```

---

## 7. Conclusión

### 7.1 Lo que tienes actualmente

Tu sistema implementa correctamente:

- ✅ Matchmaking aleatorio funcional
- ✅ Conexiones P2P reales con WebRTC
- ✅ Señalización eficiente con Socket.io
- ✅ Chat de texto en tiempo real
- ✅ Manejo de desconexiones

### 7.2 Para producción a gran escala

1. **Inmediato**: Agregar servidores TURN
2. **Corto plazo**: Implementar Redis para múltiples instancias
3. **Medio plazo**: Distribución geográfica de servidores
4. **Largo plazo**: Sistema de métricas y auto-scaling

### 7.3 Recursos necesarios para 100K usuarios

- **Servidores de señalización**: 10-15 instancias
- **Servidores TURN**: 20-30 instancias (alto ancho de banda)
- **Redis cluster**: 3-6 nodos
- **CDN para archivos estáticos**: CloudFlare o similar
- **Costos estimados**: $2,000-5,000/mes

---

*Documento generado automáticamente basado en el código fuente del proyecto Strangers*
