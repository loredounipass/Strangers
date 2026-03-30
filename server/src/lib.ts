import { v4 as uuidv4 } from 'uuid';
import { GetTypesResult, room } from './types';

// Grace timers for disconnected clients (roomid -> timeout)
const cleanupTimers: Map<string, NodeJS.Timeout> = new Map();

// Cola de espera de sockets que buscan pareja
const waitingQueue: Set<string> = new Set();

export function addToWaitingQueue(socketId: string): void {
  waitingQueue.add(socketId);
  console.log('[SERVER] Añadido a waitingQueue:', socketId, 'Total:', waitingQueue.size);
}

export function removeFromWaitingQueue(socketId: string): void {
  waitingQueue.delete(socketId);
  console.log('[SERVER] Eliminado de waitingQueue:', socketId, 'Total:', waitingQueue.size);
}

export function getFirstInWaitingQueue(): string | null {
  for (const socketId of waitingQueue) {
    return socketId;
  }
  return null;
}

export function getWaitingQueueSize(): number {
  return waitingQueue.size;
}

export function markRoomAsWaiting(roomArr: Array<room>, socketId: string): void {
  for (const r of roomArr) {
    if (r.p1.id === socketId || r.p2.id === socketId) {
      if (!r.hasWaiting) {
        r.hasWaiting = true;
        const waitingId = r.p1.id === socketId ? r.p2.id : r.p1.id;
        if (waitingId) {
          addToWaitingQueue(waitingId);
        }
      }
      break;
    }
  }
}

export function handelStart(roomArr: Array<room>, socket: any, clientId: string | undefined, cb: Function, io: any): void {
  console.log('[SERVER] Nueva conexión start:', socket.id, 'clientId:', clientId);
  
  // Primero intentar recuperar sala previa
  const recovered = tryRecoverRoom(clientId);
  if (recovered) {
    removeFromWaitingQueue(socket.id);
    cb(recovered.role);
    if (recovered.partnerId) {
      console.log('[SERVER] emit remote-socket -> to', recovered.partnerId, 'with', socket.id);
      io.to(recovered.partnerId).emit('remote-socket', socket.id);
      console.log('[SERVER] emit remote-socket -> to', socket.id, 'with', recovered.partnerId);
      socket.emit('remote-socket', recovered.partnerId);
    }
    return;
  }

  // Verificar si hay una sala con alguien esperando (hasWaiting)
  const roomWithWaiting = findRoomWithWaiting();
  
  if (roomWithWaiting) {
    // Emparejar con la sala que tiene alguien esperando
    const waitingSocket = io.sockets.sockets.get(roomWithWaiting.waitingSocketId);
    if (waitingSocket) {
      removeFromWaitingQueue(roomWithWaiting.waitingSocketId);
      roomWithWaiting.room.hasWaiting = false;
      
      socket.join(roomWithWaiting.room.roomid);
      waitingSocket.join(roomWithWaiting.room.roomid);
      
      roomWithWaiting.room.p2.id = socket.id;
      roomWithWaiting.room.p2.clientId = clientId || null;
      roomWithWaiting.room.isAvailable = false;
      roomWithWaiting.room.lastSeen = Date.now();
      
      cb('p2');
      waitingSocket.emit('start', 'p1');
      
      console.log('[SERVER] emit remote-socket -> to', roomWithWaiting.waitingSocketId, socket.id);
      io.to(roomWithWaiting.waitingSocketId).emit('remote-socket', socket.id);
      console.log('[SERVER] emit remote-socket -> to', socket.id, roomWithWaiting.waitingSocketId);
      socket.emit('remote-socket', roomWithWaiting.waitingSocketId);
      
      console.log('[SERVER] emit roomid -> to', socket.id, roomWithWaiting.room.roomid);
      socket.emit('roomid', roomWithWaiting.room.roomid);
      
      console.log('[SERVER] Emparejados:', roomWithWaiting.waitingSocketId, '<->', socket.id);
      return;
    }
  }

  // Buscar sala disponible (sin waiting)
  const availableroom = checkAvailableRoom();
  if (availableroom.is) {
    console.log('[SERVER] Sala disponible:', availableroom.roomid);
    socket.join(availableroom.roomid);
    cb('p2');
    closeRoom(availableroom.roomid);
    if (availableroom?.room) {
      console.log('[SERVER] Enviando remote-socket a p1:', availableroom.room.p1.id, 'nuevo p2:', socket.id);
      console.log('[SERVER] emit remote-socket -> to', availableroom.room.p1.id, socket.id);
      io.to(availableroom.room.p1.id).emit('remote-socket', socket.id);
      console.log('[SERVER] emit remote-socket -> to', socket.id, availableroom.room.p1.id);
      socket.emit('remote-socket', availableroom.room.p1.id);
      console.log('[SERVER] emit roomid -> to', socket.id, availableroom.room.roomid);
      socket.emit('roomid', availableroom.room.roomid);
    }
  } else {
    // Crear nueva sala sin waiting (el primer usuario espera hasta que alguien se una)
    createNewRoom(false);
  }

  function createNewRoom(withWaiting: boolean = false): void {
    let roomid = uuidv4();
    socket.join(roomid);
    roomArr.push({
      roomid,
      isAvailable: true,
      hasWaiting: withWaiting,
      p1: { id: socket.id, clientId: clientId || null },
      p2: { id: null, clientId: null },
      lastSeen: Date.now()
    });
    if (withWaiting) {
      addToWaitingQueue(socket.id);
    }
    cb('p1');
    socket.emit('roomid', roomid);
  }

  function findRoomWithWaiting(): { room: room, waitingSocketId: string } | null {
    for (const waitingSocketId of waitingQueue) {
      for (const r of roomArr) {
        if (r.hasWaiting && r.p1.id === waitingSocketId) {
          return { room: r, waitingSocketId };
        }
      }
    }
    return null;
  }

  function closeRoom(roomid: string): void {
    for (let i = 0; i < roomArr.length; i++) {
      if (roomArr[i].roomid == roomid) {
        roomArr[i].isAvailable = false;
        roomArr[i].p2.id = socket.id;
        roomArr[i].p2.clientId = clientId || null;
        break;
      }
    }
  }

  function checkAvailableRoom(): { is: boolean, roomid: string, room: room | null } {
    for (let i = 0; i < roomArr.length; i++) {
      const currentRoom = roomArr[i];
      if (currentRoom.isAvailable && currentRoom.p1.id !== socket.id) {
        return { is: true, roomid: currentRoom.roomid, room: currentRoom };
      }
    }
    return { is: false, roomid: '', room: null };
  }

  function tryRecoverRoom(clientId: string | undefined): { role: string, partnerId?: string | null } | false {
    if (!clientId) return false;
    for (let i = 0; i < roomArr.length; i++) {
      const r = roomArr[i];
      if (r.p1.clientId === clientId) {
        r.p1.id = socket.id;
        r.lastSeen = undefined;
        if (cleanupTimers.has(r.roomid)) {
          clearTimeout(cleanupTimers.get(r.roomid)!);
          cleanupTimers.delete(r.roomid);
        }
        socket.join(r.roomid);
        return { role: 'p1', partnerId: r.p2.id };
      }
      if (r.p2.clientId === clientId) {
        r.p2.id = socket.id;
        r.lastSeen = undefined;
        if (cleanupTimers.has(r.roomid)) {
          clearTimeout(cleanupTimers.get(r.roomid)!);
          cleanupTimers.delete(r.roomid);
        }
        socket.join(r.roomid);
        return { role: 'p2', partnerId: r.p1.id };
      }
    }
    return false;
  }
}

export function handelDisconnect(disconnectedId: string, roomArr: Array<room>, io: any, forceCleanup: boolean = false) {
  // If forceCleanup is true, immediately remove the room entries for this socket.
  for (let i = 0; i < roomArr.length; i++) {
    const room = roomArr[i];

    if (room.p1.id === disconnectedId || room.p2?.id === disconnectedId) {
      const isP1 = room.p1.id === disconnectedId;
      const partner = isP1 ? room.p2?.id : room.p1?.id;
      if (partner) io.to(partner).emit('disconnected');

      // Verificar si hay alguien en la cola de espera para reconectar automáticamente
      if (!forceCleanup && waitingQueue.size > 0) {
        const waitingId = getFirstInWaitingQueue();
        if (waitingId && waitingId !== partner) {
          const waitingSocket = io.sockets.sockets.get(waitingId);
          if (waitingSocket) {
            removeFromWaitingQueue(waitingId);
            
            // El usuario que queda (partner) se convierte en p1
            room.p1.id = partner;
            room.p2.id = waitingId;
            room.p2.clientId = waitingSocket.clientId || null;
            room.isAvailable = false;
            room.lastSeen = Date.now();
            
            waitingSocket.join(room.roomid);
            waitingSocket.emit('start', 'p2');
            io.to(waitingId).emit('remote-socket', partner);
            io.to(partner).emit('remote-socket', waitingId);
            waitingSocket.emit('roomid', room.roomid);
            
            console.log('[SERVER] Reconectado automáticamente:', partner, '<->', waitingId);
            return;
          }
        }
      }

      if (forceCleanup) {
        // Remove the socket id and cleanup the room immediately.
        if (isP1) {
          room.p1.id = null;
        } else {
          room.p2.id = null;
        }

        // Clear any pending cleanup timer for this room
        if (cleanupTimers.has(room.roomid)) {
          clearTimeout(cleanupTimers.get(room.roomid)!);
          cleanupTimers.delete(room.roomid);
        }

        // If both sides are gone or nobody has clientId, remove room
        if ((!room.p1.id && !room.p2?.id) || (room.p1.id === null && !room.p1.clientId && !room.p2?.id)) {
          roomArr.splice(i, 1);
          i--; // adjust index after removal
        } else {
          room.isAvailable = true;
          room.hasWaiting = false;
        }

        continue;
      }

      // Non-forced path: keep the room for a grace period so client can reconnect
      // set id to null but preserve clientId and mark lastSeen
      if (isP1) {
        room.p1.id = null;
        room.lastSeen = Date.now();
        // El que queda (partner) queda esperando
        if (partner) {
          room.hasWaiting = true;
          addToWaitingQueue(partner);
        }
      } else {
        room.p2.id = null;
        room.lastSeen = Date.now();
        // El que queda (p1) queda esperando
        if (room.p1.id) {
          room.hasWaiting = true;
          addToWaitingQueue(room.p1.id);
        }
      }

      // schedule actual cleanup after 30 seconds
      if (!cleanupTimers.has(room.roomid)) {
        const t = setTimeout(() => {
          // remove room if still empty or only one without clientId
          const idx = roomArr.findIndex(r => r.roomid === room.roomid);
          if (idx !== -1) {
            const rcur = roomArr[idx];
            if ((!rcur.p1.id && !rcur.p2?.id) || (rcur.p1.id === null && !rcur.p1.clientId && !rcur.p2?.id)) {
              roomArr.splice(idx, 1);
            } else {
              // make available if partner remains
              rcur.isAvailable = true;
              rcur.hasWaiting = false;
            }
          }
          cleanupTimers.delete(room.roomid);
        }, 30000);
        cleanupTimers.set(room.roomid, t);
      }
    }
  }
}

export function getType(id: string, roomArr: Array<room>): GetTypesResult {
  for (let i = 0; i < roomArr.length; i++) {
    if (roomArr[i].p1.id == id) {
      return { type: 'p1', p2id: roomArr[i].p2.id };
    } else if (roomArr[i].p2.id == id) {
      return { type: 'p2', p1id: roomArr[i].p1.id };
    }
  }
  return false;
}
