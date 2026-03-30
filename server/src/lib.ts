import { v4 as uuidv4 } from 'uuid';
import type { Server, Socket } from 'socket.io';
import type { Room, PeerRole, PeerInfo, GetTypesResult } from './types';

// ============================================
// ROOM MANAGER — Gestión centralizada de salas
// ============================================

/** Map<roomId, Room> — O(1) lookup */
const rooms = new Map<string, Room>();

/** Map<socketId, roomId> — reverse index para encontrar la room de un socket en O(1) */
const socketToRoom = new Map<string, string>();

/** Cola de sockets buscando pareja — FIFO estricta */
const waitingQueue: string[] = [];

// ============================================
// HELPERS
// ============================================

function log(tag: string, msg: string, data?: any) {
  console.log(`[${tag}] ${msg}`, data !== undefined ? data : '');
}

/** Verifica si un socket sigue conectado al server */
function isSocketAlive(io: Server, socketId: string): boolean {
  return io.sockets.sockets.has(socketId);
}

/** Limpia sockets muertos de la waitingQueue */
function pruneWaitingQueue(io: Server): void {
  for (let i = waitingQueue.length - 1; i >= 0; i--) {
    if (!isSocketAlive(io, waitingQueue[i])) {
      log('QUEUE', 'Pruned dead socket from waiting queue', waitingQueue[i]);
      waitingQueue.splice(i, 1);
    }
  }
}

/** Agrega un socket a la cola de espera (si no está ya) */
function addToWaitingQueue(socketId: string): void {
  if (!waitingQueue.includes(socketId)) {
    waitingQueue.push(socketId);
    log('QUEUE', `Added ${socketId}. Queue size: ${waitingQueue.length}`);
  }
}

/** Elimina un socket de la cola de espera */
export function removeFromWaitingQueue(socketId: string): void {
  const idx = waitingQueue.indexOf(socketId);
  if (idx !== -1) {
    waitingQueue.splice(idx, 1);
    log('QUEUE', `Removed ${socketId}. Queue size: ${waitingQueue.length}`);
  }
}

/** Toma el primer socket válido de la cola */
function takeFromWaitingQueue(io: Server, excludeId?: string): string | null {
  pruneWaitingQueue(io);
  for (let i = 0; i < waitingQueue.length; i++) {
    const id = waitingQueue[i];
    if (id !== excludeId && isSocketAlive(io, id)) {
      waitingQueue.splice(i, 1);
      return id;
    }
  }
  return null;
}

// ============================================
// ROOM OPERATIONS
// ============================================

function createRoom(socketId: string, clientId: string | null): Room {
  const roomId = uuidv4();
  const room: Room = {
    roomId,
    p1: { socketId, clientId },
    p2: null,
    createdAt: Date.now(),
  };
  rooms.set(roomId, room);
  socketToRoom.set(socketId, roomId);
  log('ROOM', `Created room ${roomId} with p1=${socketId}`);
  return room;
}

function destroyRoom(roomId: string): void {
  const room = rooms.get(roomId);
  if (!room) return;

  if (room.p1) socketToRoom.delete(room.p1.socketId);
  if (room.p2) socketToRoom.delete(room.p2.socketId);
  rooms.delete(roomId);
  log('ROOM', `Destroyed room ${roomId}`);
}

function getRoomBySocket(socketId: string): Room | null {
  const roomId = socketToRoom.get(socketId);
  if (!roomId) return null;
  return rooms.get(roomId) || null;
}

function getRoleInRoom(socketId: string, room: Room): PeerRole | null {
  if (room.p1?.socketId === socketId) return 'p1';
  if (room.p2?.socketId === socketId) return 'p2';
  return null;
}

function getPartnerInRoom(socketId: string, room: Room): string | null {
  if (room.p1?.socketId === socketId) return room.p2?.socketId || null;
  if (room.p2?.socketId === socketId) return room.p1?.socketId || null;
  return null;
}

// ============================================
// MATCHMAKING
// ============================================

function matchPeers(io: Server, p1Socket: Socket, p2Socket: Socket, p1ClientId: string | null, p2ClientId: string | null): Room {
  // Buscar room existente de p1 (creada cuando p1 entró a la cola)
  let room = getRoomBySocket(p1Socket.id);

  if (!room) {
    // Fallback: crear room nueva si p1 no tenía (no debería pasar)
    room = createRoom(p1Socket.id, p1ClientId);
    p1Socket.join(room.roomId);
  }

  // Asignar p2 a la room existente de p1
  room.p2 = { socketId: p2Socket.id, clientId: p2ClientId };
  socketToRoom.set(p2Socket.id, room.roomId);

  // p2 se une a la room de Socket.IO (p1 ya está unido desde createRoom)
  p2Socket.join(room.roomId);

  // Enviar roomid a AMBOS peers
  p1Socket.emit('roomid', room.roomId);
  p2Socket.emit('roomid', room.roomId);

  // Enviar remote-socket a ambos para que creen peer connection
  p1Socket.emit('remote-socket', p2Socket.id);
  p2Socket.emit('remote-socket', p1Socket.id);

  // Confirmar tipo a p1 (por si viene de NEXT y necesita actualización)
  p1Socket.emit('start', 'p1');

  log('MATCH', `Paired ${p1Socket.id} (p1) <-> ${p2Socket.id} (p2) in room ${room.roomId}`);
  return room;
}

// ============================================
// PUBLIC API
// ============================================

/**
 * handelStart — Maneja el evento `start` de un cliente.
 * 
 * Flujo:
 * 1. Limpiar rooms previas del socket (si refresh)
 * 2. Buscar alguien en la waitingQueue
 * 3. Si hay match → emparejar inmediatamente
 * 4. Si no → crear room y esperar en la cola
 */
export function handelStart(
  _roomArr: Room[], // deprecated — usamos el Map interno
  socket: Socket,
  clientId: string | undefined,
  cb: (role: PeerRole) => void,
  io: Server
): void {
  const cid = clientId || null;
  log('START', `Socket ${socket.id} requesting start, clientId=${cid}`);

  // 1. Limpiar cualquier room previa de este socket (por si recargó la página)
  cleanupSocket(socket.id, io, true);

  // 2. Buscar alguien esperando en la cola
  const waitingId = takeFromWaitingQueue(io, socket.id);

  if (waitingId) {
    // 3a. HAY alguien esperando → match inmediato
    const waitingSocket = io.sockets.sockets.get(waitingId);
    if (!waitingSocket) {
      // Socket murió entre el queue y ahora — volver a intentar
      log('START', `Waiting socket ${waitingId} died, retrying...`);
      return handelStart(_roomArr, socket, clientId, cb, io);
    }

    const room = matchPeers(io, waitingSocket, socket, null, cid);

    // p1 (el que esperaba) ya tiene su callback ejecutado cuando entró a la cola
    // p2 (el nuevo) recibe su rol ahora
    cb('p2');

    log('START', `Matched ${waitingId} (p1) with ${socket.id} (p2)`);
  } else {
    // 3b. Nadie esperando → crear room y entrar a la cola
    const room = createRoom(socket.id, cid);
    socket.join(room.roomId);
    socket.emit('roomid', room.roomId);

    cb('p1');
    addToWaitingQueue(socket.id);

    log('START', `${socket.id} waiting as p1 in room ${room.roomId}`);
  }
}

/**
 * handelDisconnect — Maneja desconexión de un peer.
 * 
 * 1. Notifica al partner
 * 2. Limpia la room
 * 3. El partner se mete en waitingQueue para ser re-emparejado
 */
export function handelDisconnect(
  disconnectedId: string,
  _roomArr: Room[], // deprecated
  io: Server,
  forceCleanup: boolean = false
): void {
  cleanupSocket(disconnectedId, io, forceCleanup);
}

/**
 * cleanupSocket — Limpia todas las rooms y colas asociadas a un socket.
 */
function cleanupSocket(socketId: string, io: Server, notifyPartner: boolean = true): void {
  removeFromWaitingQueue(socketId);

  const room = getRoomBySocket(socketId);
  if (!room) return;

  const partnerId = getPartnerInRoom(socketId, room);

  // Notificar al partner si corresponde
  if (notifyPartner && partnerId && isSocketAlive(io, partnerId)) {
    io.to(partnerId).emit('disconnected');
    log('CLEANUP', `Notified partner ${partnerId} about ${socketId} leaving`);
  }

  // Limpiar reverse index del partner
  if (partnerId) {
    socketToRoom.delete(partnerId);
    // NO poner al partner en waitingQueue aquí.
    // El client recibirá 'disconnected' y emitirá 'start' de nuevo,
    // que llamará a handelStart() y lo pondrá en la cola correctamente.
  }

  // Destruir la room completa
  destroyRoom(room.roomId);
}

/**
 * getType — Retorna el tipo (p1/p2) y el partnerId de un socket.
 * Usado para routear SDP/ICE al peer correcto.
 */
export function getType(socketId: string, _roomArr: Room[]): GetTypesResult {
  const room = getRoomBySocket(socketId);
  if (!room) return false;

  const role = getRoleInRoom(socketId, room);
  if (!role) return false;

  const partnerId = getPartnerInRoom(socketId, room);
  return { type: role, partnerId, roomId: room.roomId };
}

/**
 * markRoomAsWaiting — Ya no necesario con la nueva arquitectura.
 * Se mantiene como stub para compatibilidad.
 */
export function markRoomAsWaiting(_roomArr: Room[], socketId: string): void {
  // No-op: la nueva lógica maneja waiting automáticamente
}

// ============================================
// PERIODIC CLEANUP — Limpieza de rooms zombie
// ============================================

const ZOMBIE_ROOM_TIMEOUT = 60_000; // 60 segundos

setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms) {
    const hasP1 = room.p1 !== null;
    const hasP2 = room.p2 !== null;

    // Room vacía = zombie
    if (!hasP1 && !hasP2) {
      destroyRoom(roomId);
      continue;
    }

    // Room vieja con solo un peer que ya no está en la cola = zombie
    if (now - room.createdAt > ZOMBIE_ROOM_TIMEOUT) {
      if (hasP1 && !hasP2 && !waitingQueue.includes(room.p1!.socketId)) {
        destroyRoom(roomId);
      }
    }
  }
}, 30_000);

// ============================================
// DEBUG — Logs de estado cada 30 segundos
// ============================================

setInterval(() => {
  log('STATE', `Rooms: ${rooms.size}, WaitingQueue: ${waitingQueue.length}, SocketMap: ${socketToRoom.size}`);
}, 30_000);
