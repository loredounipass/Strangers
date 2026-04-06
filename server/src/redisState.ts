import { redis, isRedisConnected, logRedisOperation } from './redis';
import { logger, LogChannel } from './logger';
import type { Room, Peer, PeerRole } from './types';

const ROOMS_KEY = 'strangers:rooms';
const SOCKET_TO_ROOM_KEY = 'strangers:socket_to_room';
const WAITING_QUEUE_KEY = 'strangers:waiting_queue';
const ACTIVE_SOCKETS_KEY = 'strangers:active_sockets';

const ROOM_TTL = 300;
const SOCKET_TTL = 3600;

export const redisState = {
  async addToWaitingQueue(socketId: string): Promise<number> {
    if (!isRedisConnected()) return -1;
    
    try {
      await redis.lrem(WAITING_QUEUE_KEY, 0, socketId);
      await redis.rpush(WAITING_QUEUE_KEY, socketId);
      await redis.expire(WAITING_QUEUE_KEY, ROOM_TTL);
      const size = await redis.llen(WAITING_QUEUE_KEY);
      
      logRedisOperation('addToWaitingQueue', WAITING_QUEUE_KEY, true, { socketId, queueSize: size });
      logger.info(LogChannel.QUEUE, `Added ${socketId} to waiting queue`, { queueSize: size });
      
      return size;
    } catch (error) {
      logger.logError(LogChannel.QUEUE, 'Error adding to waiting queue', error, { socketId });
      logRedisOperation('addToWaitingQueue', WAITING_QUEUE_KEY, false, { socketId, error: String(error) });
      return -1;
    }
  },

  async removeFromWaitingQueue(socketId: string): Promise<number> {
    if (!isRedisConnected()) return -1;
    
    try {
      await redis.lrem(WAITING_QUEUE_KEY, 0, socketId);
      const size = await redis.llen(WAITING_QUEUE_KEY);
      
      logRedisOperation('removeFromWaitingQueue', WAITING_QUEUE_KEY, true, { socketId, queueSize: size });
      logger.info(LogChannel.QUEUE, `Removed ${socketId} from waiting queue`, { queueSize: size });
      
      return size;
    } catch (error) {
      logger.logError(LogChannel.QUEUE, 'Error removing from waiting queue', error, { socketId });
      logRedisOperation('removeFromWaitingQueue', WAITING_QUEUE_KEY, false, { socketId, error: String(error) });
      return -1;
    }
  },

  async getWaitingQueue(): Promise<string[]> {
    if (!isRedisConnected()) return [];
    
    try {
      const queue = await redis.lrange(WAITING_QUEUE_KEY, 0, -1);
      logger.debug(LogChannel.QUEUE, 'Get waiting queue', { size: queue.length });
      return queue;
    } catch (error) {
      logger.logError(LogChannel.QUEUE, 'Error getting waiting queue', error);
      return [];
    }
  },

  async getWaitingQueueSize(): Promise<number> {
    if (!isRedisConnected()) return 0;
    
    try {
      const size = await redis.llen(WAITING_QUEUE_KEY);
      logger.debug(LogChannel.QUEUE, 'Get waiting queue size', { size });
      return size;
    } catch (error) {
      logger.logError(LogChannel.QUEUE, 'Error getting queue size', error);
      return 0;
    }
  },

  async takeFromWaitingQueue(excludeId?: string): Promise<string | null> {
    if (!isRedisConnected()) return null;
    
    try {
      const list = await redis.lrange(WAITING_QUEUE_KEY, 0, -1);
      
      for (let i = 0; i < list.length; i++) {
        const id = list[i];
        if (id !== excludeId) {
          await redis.lrem(WAITING_QUEUE_KEY, 1, id);
          logger.info(LogChannel.QUEUE, `Took ${id} from waiting queue`, { excluded: excludeId });
          logRedisOperation('takeFromWaitingQueue', WAITING_QUEUE_KEY, true, { taken: id, excluded: excludeId });
          return id;
        }
      }
      return null;
    } catch (error) {
      logger.logError(LogChannel.QUEUE, 'Error taking from queue', error, { excludeId });
      logRedisOperation('takeFromWaitingQueue', WAITING_QUEUE_KEY, false, { excludeId, error: String(error) });
      return null;
    }
  },

  async createRoom(roomId: string, socketId: string, clientId: string | null): Promise<void> {
    if (!isRedisConnected()) return;
    
    try {
      const room: Room = {
        roomId,
        p1: { socketId, clientId },
        p2: null,
        createdAt: Date.now(),
      };
      
      await redis.hset(ROOMS_KEY, roomId, JSON.stringify(room));
      await redis.hset(SOCKET_TO_ROOM_KEY, socketId, roomId);
      await redis.expire(ROOMS_KEY, ROOM_TTL);
      await redis.expire(SOCKET_TO_ROOM_KEY, SOCKET_TTL);
      
      logRedisOperation('createRoom', ROOMS_KEY, true, { roomId, socketId });
      logger.info(LogChannel.ROOM, `Created room ${roomId}`, { p1: socketId, clientId });
    } catch (error) {
      logger.logError(LogChannel.ROOM, 'Error creating room', error, { roomId, socketId });
      logRedisOperation('createRoom', ROOMS_KEY, false, { roomId, socketId, error: String(error) });
    }
  },

  async addPeerToRoom(roomId: string, socketId: string, clientId: string | null, role: PeerRole): Promise<void> {
    if (!isRedisConnected()) return;
    
    try {
      const roomJson = await redis.hget(ROOMS_KEY, roomId);
      if (!roomJson) {
        logger.warn(LogChannel.ROOM, 'Room not found when adding peer', { roomId, socketId });
        return;
      }
      
      const room: Room = JSON.parse(roomJson);
      room.p2 = { socketId, clientId };
      
      await redis.hset(ROOMS_KEY, roomId, JSON.stringify(room));
      await redis.hset(SOCKET_TO_ROOM_KEY, socketId, roomId);
      await redis.expire(ROOMS_KEY, ROOM_TTL);
      await redis.expire(SOCKET_TO_ROOM_KEY, SOCKET_TTL);
      
      logRedisOperation('addPeerToRoom', ROOMS_KEY, true, { roomId, socketId, role });
      logger.info(LogChannel.ROOM, `Added ${socketId} to room ${roomId} as ${role}`, { role });
    } catch (error) {
      logger.logError(LogChannel.ROOM, 'Error adding peer to room', error, { roomId, socketId, role });
      logRedisOperation('addPeerToRoom', ROOMS_KEY, false, { roomId, socketId, role, error: String(error) });
    }
  },

  async getRoom(roomId: string): Promise<Room | null> {
    if (!isRedisConnected()) return null;
    
    try {
      const roomJson = await redis.hget(ROOMS_KEY, roomId);
      const room = roomJson ? JSON.parse(roomJson) : null;
      
      logger.debug(LogChannel.ROOM, 'Get room', { roomId, found: !!room });
      return room;
    } catch (error) {
      logger.logError(LogChannel.ROOM, 'Error getting room', error, { roomId });
      return null;
    }
  },

  async getRoomBySocket(socketId: string): Promise<Room | null> {
    if (!isRedisConnected()) return null;
    
    try {
      const roomId = await redis.hget(SOCKET_TO_ROOM_KEY, socketId);
      if (!roomId) {
        logger.debug(LogChannel.ROOM, 'No room found for socket', { socketId });
        return null;
      }
      
      const room = await this.getRoom(roomId);
      logger.debug(LogChannel.ROOM, 'Get room by socket', { socketId, roomId, found: !!room });
      return room;
    } catch (error) {
      logger.logError(LogChannel.ROOM, 'Error getting room by socket', error, { socketId });
      return null;
    }
  },

  async destroyRoom(roomId: string): Promise<void> {
    if (!isRedisConnected()) return;
    
    try {
      const room = await this.getRoom(roomId);
      if (room) {
        if (room.p1) {
          await redis.hdel(SOCKET_TO_ROOM_KEY, room.p1.socketId);
          logger.debug(LogChannel.ROOM, 'Removed socket mapping', { socketId: room.p1.socketId });
        }
        if (room.p2) {
          await redis.hdel(SOCKET_TO_ROOM_KEY, room.p2.socketId);
          logger.debug(LogChannel.ROOM, 'Removed socket mapping', { socketId: room.p2.socketId });
        }
      }
      
      await redis.hdel(ROOMS_KEY, roomId);
      
      logRedisOperation('destroyRoom', ROOMS_KEY, true, { roomId });
      logger.info(LogChannel.ROOM, `Destroyed room ${roomId}`);
    } catch (error) {
      logger.logError(LogChannel.ROOM, 'Error destroying room', error, { roomId });
      logRedisOperation('destroyRoom', ROOMS_KEY, false, { roomId, error: String(error) });
    }
  },

  async getAllRooms(): Promise<Map<string, Room>> {
    const roomsMap = new Map<string, Room>();
    
    if (!isRedisConnected()) return roomsMap;
    
    try {
      const roomsData = await redis.hgetall(ROOMS_KEY);
      
      for (const [roomId, roomJson] of Object.entries(roomsData)) {
        try {
          roomsMap.set(roomId, JSON.parse(roomJson as string));
        } catch (e) {
          logger.logError(LogChannel.ROOM, 'Error parsing room JSON', e as Error, { roomId });
        }
      }
      
      logger.debug(LogChannel.ROOM, 'Get all rooms', { count: roomsMap.size });
    } catch (error) {
      logger.logError(LogChannel.ROOM, 'Error getting all rooms', error);
    }
    
    return roomsMap;
  },

  async addActiveSocket(socketId: string): Promise<number> {
    if (!isRedisConnected()) return 0;
    
    try {
      await redis.sadd(ACTIVE_SOCKETS_KEY, socketId);
      await redis.expire(ACTIVE_SOCKETS_KEY, SOCKET_TTL);
      const count = await redis.scard(ACTIVE_SOCKETS_KEY);
      
      logRedisOperation('addActiveSocket', ACTIVE_SOCKETS_KEY, true, { socketId, total: count });
      logger.debug(LogChannel.SOCKET, `Socket ${socketId} added to active sockets`, { total: count });
      
      return count;
    } catch (error) {
      logger.logError(LogChannel.SOCKET, 'Error adding active socket', error, { socketId });
      return 0;
    }
  },

  async removeActiveSocket(socketId: string): Promise<number> {
    if (!isRedisConnected()) return 0;
    
    try {
      await redis.srem(ACTIVE_SOCKETS_KEY, socketId);
      const count = await redis.scard(ACTIVE_SOCKETS_KEY);
      
      logRedisOperation('removeActiveSocket', ACTIVE_SOCKETS_KEY, true, { socketId, total: count });
      logger.debug(LogChannel.SOCKET, `Socket ${socketId} removed from active sockets`, { total: count });
      
      return count;
    } catch (error) {
      logger.logError(LogChannel.SOCKET, 'Error removing active socket', error, { socketId });
      return 0;
    }
  },

  async getActiveSocketCount(): Promise<number> {
    if (!isRedisConnected()) return 0;
    
    try {
      const count = await redis.scard(ACTIVE_SOCKETS_KEY);
      logger.debug(LogChannel.SOCKET, 'Get active socket count', { count });
      return count;
    } catch (error) {
      logger.logError(LogChannel.SOCKET, 'Error getting active socket count', error);
      return 0;
    }
  },

  async getActiveSockets(): Promise<string[]> {
    if (!isRedisConnected()) return [];
    
    try {
      const sockets = await redis.smembers(ACTIVE_SOCKETS_KEY);
      logger.debug(LogChannel.SOCKET, 'Get active sockets', { count: sockets.length });
      return sockets;
    } catch (error) {
      logger.logError(LogChannel.SOCKET, 'Error getting active sockets', error);
      return [];
    }
  },

  async pruneDeadSockets(aliveSocketIds: Set<string>): Promise<void> {
    if (!isRedisConnected()) return;
    
    try {
      const allSockets = await this.getActiveSockets();
      let pruned = 0;
      
      for (const socketId of allSockets) {
        if (!aliveSocketIds.has(socketId)) {
          await this.removeActiveSocket(socketId);
          
          const roomId = await redis.hget(SOCKET_TO_ROOM_KEY, socketId);
          if (roomId) {
            await this.destroyRoom(roomId);
          }
          
          await this.removeFromWaitingQueue(socketId);
          pruned++;
        }
      }
      
      if (pruned > 0) {
        logger.info(LogChannel.SOCKET, `Pruned ${pruned} dead sockets`);
      }
    } catch (error) {
      logger.logError(LogChannel.SOCKET, 'Error pruning dead sockets', error);
    }
  },
};
