import { v4 as uuidv4 } from 'uuid';
import type { Server, Socket } from 'socket.io';
import type { Room, PeerRole, PeerInfo, GetTypesResult } from './types';
import { redisState } from './redisState';
import { isRedisConnected } from './redis';
import { logger, LogChannel } from './logger';

const useRedis = (): boolean => isRedisConnected();

const rooms = new Map<string, Room>();
const socketToRoom = new Map<string, string>();
const waitingQueue: string[] = [];

function isSocketAlive(io: Server, socketId: string): boolean {
  return io.sockets.sockets.has(socketId);
}

function pruneWaitingQueue(io: Server): void {
  for (let i = waitingQueue.length - 1; i >= 0; i--) {
    if (!isSocketAlive(io, waitingQueue[i])) {
      const removed = waitingQueue[i];
      waitingQueue.splice(i, 1);
      logger.info(LogChannel.QUEUE, 'Pruned dead socket from waiting queue', { socketId: removed });
      
      if (useRedis()) {
        redisState.removeFromWaitingQueue(removed);
      }
    }
  }
}

function addToWaitingQueue(socketId: string): void {
  if (!waitingQueue.includes(socketId)) {
    waitingQueue.push(socketId);
    logger.info(LogChannel.QUEUE, `Added ${socketId} to waiting queue`, { queueSize: waitingQueue.length });
    
    if (useRedis()) {
      redisState.addToWaitingQueue(socketId);
    }
  }
}

export function removeFromWaitingQueue(socketId: string): void {
  const idx = waitingQueue.indexOf(socketId);
  if (idx !== -1) {
    waitingQueue.splice(idx, 1);
    logger.info(LogChannel.QUEUE, `Removed ${socketId} from waiting queue`, { queueSize: waitingQueue.length });
  }
  
  if (useRedis()) {
    redisState.removeFromWaitingQueue(socketId);
  }
}

async function takeFromWaitingQueueAsync(io: Server, excludeId?: string): Promise<string | null> {
  if (useRedis()) {
    const taken = await redisState.takeFromWaitingQueue(excludeId);
    if (taken) {
      logger.info(LogChannel.QUEUE, 'Took socket from Redis queue', { taken, excluded: excludeId });
    }
    return taken;
  }
  
  pruneWaitingQueue(io);
  for (let i = 0; i < waitingQueue.length; i++) {
    const id = waitingQueue[i];
    if (id !== excludeId && isSocketAlive(io, id)) {
      waitingQueue.splice(i, 1);
      logger.info(LogChannel.QUEUE, 'Took socket from memory queue', { taken: id, excluded: excludeId });
      return id;
    }
  }
  return null;
}

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
  
  logger.info(LogChannel.ROOM, `Created room ${roomId}`, { 
    p1: socketId, 
    clientId,
    totalRooms: rooms.size 
  });
  
  if (useRedis()) {
    redisState.createRoom(roomId, socketId, clientId);
  }
  
  return room;
}

async function destroyRoomAsync(roomId: string): Promise<void> {
  const room = rooms.get(roomId);
  if (!room) {
    logger.warn(LogChannel.ROOM, 'Room not found for destruction', { roomId });
    return;
  }

  if (room.p1) {
    socketToRoom.delete(room.p1.socketId);
    logger.debug(LogChannel.ROOM, 'Removed socket mapping', { socketId: room.p1.socketId, role: 'p1' });
  }
  if (room.p2) {
    socketToRoom.delete(room.p2.socketId);
    logger.debug(LogChannel.ROOM, 'Removed socket mapping', { socketId: room.p2.socketId, role: 'p2' });
  }
  rooms.delete(roomId);
  
  logger.info(LogChannel.ROOM, `Destroyed room ${roomId}`, { 
    hadP1: !!room.p1, 
    hadP2: !!room.p2,
    totalRooms: rooms.size 
  });
  
  if (useRedis()) {
    await redisState.destroyRoom(roomId);
  }
}

async function getRoomBySocketAsync(socketId: string): Promise<Room | null> {
  if (useRedis()) {
    const room = await redisState.getRoomBySocket(socketId);
    if (room) {
      logger.debug(LogChannel.ROOM, 'Found room in Redis', { socketId, roomId: room.roomId });
    }
    return room;
  }
  
  const roomId = socketToRoom.get(socketId);
  if (!roomId) {
    logger.debug(LogChannel.ROOM, 'No room mapping for socket', { socketId });
    return null;
  }
  
  const room = rooms.get(roomId) || null;
  logger.debug(LogChannel.ROOM, 'Found room in memory', { socketId, roomId, found: !!room });
  return room;
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

async function matchPeersAsync(
  io: Server,
  p1Socket: Socket,
  p2Socket: Socket,
  p1ClientId: string | null,
  p2ClientId: string | null
): Promise<Room> {
  let room = await getRoomBySocketAsync(p1Socket.id);

  if (!room) {
    logger.warn(LogChannel.MATCH, 'No existing room for p1, creating new', { p1: p1Socket.id });
    room = createRoom(p1Socket.id, p1ClientId);
    p1Socket.join(room.roomId);
  }

  room.p2 = { socketId: p2Socket.id, clientId: p2ClientId };
  socketToRoom.set(p2Socket.id, room.roomId);
  rooms.set(room.roomId, room);
  
  logger.info(LogChannel.MATCH, `Matched peers in room ${room.roomId}`, {
    p1: p1Socket.id,
    p2: p2Socket.id,
    p1ClientId,
    p2ClientId
  });

  if (useRedis()) {
    await redisState.addPeerToRoom(room.roomId, p2Socket.id, p2ClientId, 'p2');
  }

  p2Socket.join(room.roomId);

  p1Socket.emit('roomid', room.roomId);
  p2Socket.emit('roomid', room.roomId);

  p1Socket.emit('remote-socket', p2Socket.id);
  p2Socket.emit('remote-socket', p1Socket.id);

  p1Socket.emit('start', 'p1');

  logger.info(LogChannel.MATCH, `Paired ${p1Socket.id} (p1) <-> ${p2Socket.id} (p2)`, { roomId: room.roomId });
  
  return room;
}

export async function handelStart(
  _roomArr: Room[],
  socket: Socket,
  clientId: string | undefined,
  cb: (role: PeerRole) => void,
  io: Server
): Promise<void> {
  const cid = clientId || null;
  
  logger.info(LogChannel.SOCKET, 'Received start event', { 
    socketId: socket.id, 
    clientId: cid,
    hasRoom: !!socketToRoom.get(socket.id)
  });

  await cleanupSocketAsync(socket.id, io, true);

  const waitingId = await takeFromWaitingQueueAsync(io, socket.id);

  if (waitingId) {
    logger.info(LogChannel.MATCH, 'Found match in queue', { 
      waitingSocket: waitingId, 
      newSocket: socket.id 
    });
    
    const waitingSocket = io.sockets.sockets.get(waitingId);
    if (!waitingSocket) {
      logger.warn(LogChannel.MATCH, 'Waiting socket disconnected, retrying', { waitingSocket: waitingId });
      return handelStart(_roomArr, socket, clientId, cb, io);
    }

    await matchPeersAsync(io, waitingSocket, socket, null, cid);

    cb('p2');

    logger.info(LogChannel.MATCH, 'Match completed', { 
      p1: waitingId, 
      p2: socket.id,
      role: 'p2'
    });
  } else {
    const room = createRoom(socket.id, cid);
    socket.join(room.roomId);
    socket.emit('roomid', room.roomId);

    cb('p1');
    addToWaitingQueue(socket.id);

    logger.info(LogChannel.MATCH, 'Socket waiting for match', { 
      socketId: socket.id,
      roomId: room.roomId,
      role: 'p1',
      queueSize: waitingQueue.length
    });
  }
}

export async function handelDisconnect(
  disconnectedId: string,
  _roomArr: Room[],
  io: Server,
  forceCleanup: boolean = false
): Promise<void> {
  logger.info(LogChannel.SOCKET, 'Processing disconnect', { 
    socketId: disconnectedId,
    forceCleanup 
  });
  
  await cleanupSocketAsync(disconnectedId, io, forceCleanup);
}

async function cleanupSocketAsync(socketId: string, io: Server, notifyPartner: boolean = true): Promise<void> {
  removeFromWaitingQueue(socketId);

  const room = await getRoomBySocketAsync(socketId);
  if (!room) {
    logger.debug(LogChannel.ROOM, 'No room found for disconnecting socket', { socketId });
    return;
  }

  const partnerId = getPartnerInRoom(socketId, room);

  if (notifyPartner && partnerId && isSocketAlive(io, partnerId)) {
    io.to(partnerId).emit('disconnected');
    logger.info(LogChannel.SOCKET, 'Notified partner of disconnect', { 
      disconnected: socketId,
      partner: partnerId 
    });
  }

  if (partnerId) {
    socketToRoom.delete(partnerId);
    logger.debug(LogChannel.ROOM, 'Cleared partner socket mapping', { partnerId });
  }

  await destroyRoomAsync(room.roomId);
}

export async function getType(socketId: string, _roomArr: Room[]): Promise<GetTypesResult> {
  const room = await getRoomBySocketAsync(socketId);
  if (!room) {
    logger.debug(LogChannel.ROOM, 'getType: No room found', { socketId });
    return false;
  }

  const role = getRoleInRoom(socketId, room);
  if (!role) {
    logger.warn(LogChannel.ROOM, 'getType: Socket not in room', { socketId, roomId: room.roomId });
    return false;
  }

  const partnerId = getPartnerInRoom(socketId, room);
  
  logger.debug(LogChannel.ROOM, 'getType result', { 
    socketId, 
    roomId: room.roomId, 
    role, 
    partnerId 
  });
  
  return { type: role, partnerId, roomId: room.roomId };
}

export function markRoomAsWaiting(_roomArr: Room[], socketId: string): void {
  addToWaitingQueue(socketId);
}

setInterval(async () => {
  const now = Date.now();
  let roomsChecked = 0;
  let roomsDestroyed = 0;
  
  if (useRedis()) {
    const redisRooms = await redisState.getAllRooms();
    for (const [roomId, room] of redisRooms) {
      roomsChecked++;
      const hasP1 = room.p1 !== null;
      const hasP2 = room.p2 !== null;

      if (!hasP1 && !hasP2) {
        await redisState.destroyRoom(roomId);
        roomsDestroyed++;
        continue;
      }

      if (now - room.createdAt > 60_000) {
        if (hasP1 && !hasP2) {
          const queue = await redisState.getWaitingQueue();
          if (!queue.includes(room.p1!.socketId)) {
            await redisState.destroyRoom(roomId);
            roomsDestroyed++;
          }
        }
      }
    }
  } else {
    for (const [roomId, room] of rooms) {
      roomsChecked++;
      const hasP1 = room.p1 !== null;
      const hasP2 = room.p2 !== null;

      if (!hasP1 && !hasP2) {
        destroyRoomAsync(roomId);
        roomsDestroyed++;
        continue;
      }

      if (now - room.createdAt > 60_000) {
        if (hasP1 && !hasP2 && !waitingQueue.includes(room.p1!.socketId)) {
          destroyRoomAsync(roomId);
          roomsDestroyed++;
        }
      }
    }
  }
  
  if (roomsDestroyed > 0) {
    logger.info(LogChannel.ROOM, 'Zombie cleanup completed', { roomsChecked, roomsDestroyed });
  }
}, 30_000);

setInterval(() => {
  if (useRedis()) {
    redisState.getWaitingQueueSize().then(size => {
      logger.debug(LogChannel.STATE, 'State report (Redis)', { 
        waitingQueue: size,
        inMemoryRooms: rooms.size
      });
    });
  } else {
    logger.debug(LogChannel.STATE, 'State report (Memory)', { 
      rooms: rooms.size,
      waitingQueue: waitingQueue.length,
      socketMap: socketToRoom.size
    });
  }
}, 30_000);
