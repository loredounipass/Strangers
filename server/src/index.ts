import express from 'express';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import cors from 'cors';
import { Server, Socket } from 'socket.io';
import {
  handelStart,
  handelDisconnect,
  getType,
  removeFromWaitingQueue,
  markRoomAsWaiting,
} from './lib';
import type { Room } from './types';
import { redis, isRedisConnected, waitForRedis } from './redis';
import { checkRateLimit } from './rateLimiter';
import { redisState } from './redisState';
import { logger, LogChannel, LogLevel } from './logger';

const app = express();

const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean) || [];
const NODE_ENV = process.env.NODE_ENV || 'development';

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      logger.debug(LogChannel.CORS, 'Request without origin, allowing', { origin });
      return callback(null, true);
    }
    
    if (allowedOrigins.includes(origin)) {
      logger.info(LogChannel.CORS, 'Origin allowed (configured)', { origin });
      return callback(null, true);
    }
    
    if (origin.endsWith('.app.github.dev') || origin.endsWith('.devtunnels.ms')) {
      logger.info(LogChannel.CORS, 'Origin allowed (codespaces)', { origin });
      return callback(null, true);
    }
    
    if (origin.endsWith('.ngrok-free.app') || origin.endsWith('.ngrok.io')) {
      logger.info(LogChannel.CORS, 'Origin allowed (ngrok)', { origin });
      return callback(null, true);
    }
    
    if (NODE_ENV === 'development') {
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        const port = origin.match(/:(\d+)$/)?.[1];
        if (port && parseInt(port) >= 3000 && parseInt(port) <= 9999) {
          logger.info(LogChannel.CORS, 'Origin allowed (localhost dev)', { origin, port });
          return callback(null, true);
        }
      }
    }

    logger.warn(LogChannel.CORS, 'Origin blocked', { origin });
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST'],
}));

app.get('/ice', (_req, res) => {
  logger.debug(LogChannel.SERVER, 'ICE servers endpoint called');
  
  const servers: any[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  const turnUrl  = process.env.TURN_URL;
  const turnUser = process.env.TURN_USERNAME;
  const turnCred = process.env.TURN_CREDENTIAL;

  if (turnUrl && turnUser && turnCred) {
    const hostMatch = turnUrl.match(/turn:([^:]+)/);
    const host = hostMatch ? hostMatch[1] : null;

    if (host) {
      servers.push({ urls: `turn:${host}:80`,                    username: turnUser, credential: turnCred });
      servers.push({ urls: `turn:${host}:443`,                   username: turnUser, credential: turnCred });
      servers.push({ urls: `turn:${host}:443?transport=tcp`,     username: turnUser, credential: turnCred });
    } else {
      servers.push({ urls: turnUrl, username: turnUser, credential: turnCred });
    }
    
    logger.debug(LogChannel.SERVER, 'TURN servers configured', { count: servers.length });
  }

  res.json({ servers });
});

app.get('/health', async (_req, res) => {
  const redisStatus = isRedisConnected();
  let onlineCount = activeSockets.size;
  
  if (redisStatus) {
    onlineCount = await redisState.getActiveSocketCount() || onlineCount;
  }
  
  logger.debug(LogChannel.SERVER, 'Health check', { 
    uptime: process.uptime(),
    redis: redisStatus ? 'connected' : 'disconnected',
    online: onlineCount
  });
  
  res.json({ 
    status: 'ok', 
    uptime: process.uptime(),
    redis: redisStatus ? 'connected' : 'disconnected',
    online: onlineCount
  });
});

const PORT = parseInt(process.env.PORT || '8000');
const server = app.listen(PORT, () => {
  logger.info(LogChannel.SERVER, `Server listening on port ${PORT}`, { 
    port: PORT,
    nodeEnv: NODE_ENV
  });
});

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 15000,
  pingInterval: 5000,
});

const activeSockets = new Set<string>();
const roomArr: Room[] = [];

async function broadcastOnline() {
  let count = activeSockets.size;
  
  if (isRedisConnected()) {
    count = await redisState.getActiveSocketCount() || count;
  }
  
  io.emit('online', count);
  logger.debug(LogChannel.SERVER, 'Broadcast online count', { count });
}

async function initializeRedis() {
  try {
    logger.info(LogChannel.REDIS, 'Attempting Redis connection', {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379
    });
    await redis.connect();
    await waitForRedis(5000);
    logger.info(LogChannel.REDIS, 'Redis connection established');
  } catch (error) {
    logger.warn(LogChannel.REDIS, 'Redis connection failed, running in-memory mode', {
      error: error instanceof Error ? error.message : error
    });
  }
}

initializeRedis();

io.on('connection', (socket: Socket) => {
  activeSockets.add(socket.id);
  
  logger.info(LogChannel.SOCKET, 'Client connected', {
    socketId: socket.id,
    totalConnections: activeSockets.size,
    ip: socket.handshake.address
  });
  
  if (isRedisConnected()) {
    redisState.addActiveSocket(socket.id);
  }
  
  broadcastOnline();

  socket.on('start', async (clientIdOrCb?: any, cb?: (person: string) => void) => {
    try {
      const rateLimit = await checkRateLimit(socket.id, 'start');
      
      if (!rateLimit.allowed) {
        logger.warn(LogChannel.RATE, 'Rate limit exceeded for start', {
          socketId: socket.id,
          retryAfter: rateLimit.retryAfter
        });
        socket.emit('error', { message: 'Rate limit exceeded', retryAfter: rateLimit.retryAfter });
        return;
      }

      const actualCb = typeof clientIdOrCb === 'function' ? clientIdOrCb : cb;
      const clientId = typeof clientIdOrCb === 'string' ? clientIdOrCb : undefined;

      if (typeof actualCb !== 'function') {
        logger.warn(LogChannel.SOCKET, 'Start event without callback', { socketId: socket.id });
        socket.emit('error', { message: 'Missing callback for start event' });
        return;
      }

      logger.info(LogChannel.SOCKET, 'Start event received', {
        socketId: socket.id,
        clientId,
        hasCallback: true
      });

      await handelStart(roomArr, socket, clientId, actualCb, io);
    } catch (error) {
      logger.logError(LogChannel.SERVER, 'Error in start handler', error, { socketId: socket.id });
    }
  });

  socket.on('next', async () => {
    try {
      const rateLimit = await checkRateLimit(socket.id, 'next');
      
      if (!rateLimit.allowed) {
        logger.warn(LogChannel.RATE, 'Rate limit exceeded for next', {
          socketId: socket.id,
          retryAfter: rateLimit.retryAfter
        });
        socket.emit('error', { message: 'Rate limit exceeded', retryAfter: rateLimit.retryAfter });
        return;
      }

      logger.info(LogChannel.SOCKET, 'Next event received', { socketId: socket.id });

      await handelDisconnect(socket.id, roomArr, io, true);

      await handelStart(roomArr, socket, undefined, (person: string) => {
        socket.emit('start', person);
        logger.info(LogChannel.SOCKET, 'Next -> assigned role', { socketId: socket.id, role: person });
      }, io);
    } catch (error) {
      logger.logError(LogChannel.SERVER, 'Error in next handler', error, { socketId: socket.id });
    }
  });

  socket.on('disconnect', async (reason) => {
    logger.info(LogChannel.SOCKET, 'Client disconnected', {
      socketId: socket.id,
      reason,
      totalConnections: activeSockets.size
    });
    
    await handelDisconnect(socket.id, roomArr, io, false);
    removeFromWaitingQueue(socket.id);
    activeSockets.delete(socket.id);
    
    if (isRedisConnected()) {
      await redisState.removeActiveSocket(socket.id);
    }
    
    broadcastOnline();
  });

  socket.on('disconnect-me', async (cb?: Function) => {
    try {
      logger.info(LogChannel.SOCKET, 'Explicit disconnect requested', { socketId: socket.id });
      
      await handelDisconnect(socket.id, roomArr, io, true);
      removeFromWaitingQueue(socket.id);
      activeSockets.delete(socket.id);
      
      if (isRedisConnected()) {
        await redisState.removeActiveSocket(socket.id);
      }
      
      broadcastOnline();

      if (typeof cb === 'function') {
        try { cb(); } catch (e) { }
      }
      try { socket.emit('disconnect-confirm'); } catch (e) { }
    } catch (err) {
      logger.logError(LogChannel.SERVER, 'Error in disconnect-me handler', err, { socketId: socket.id });
      if (typeof cb === 'function') try { cb(err); } catch (e) { }
    }
  });

  socket.on('sdp:send', async (data: { sdp: any }) => {
    try {
      const rateLimit = await checkRateLimit(socket.id, 'sdp:send');
      
      if (!rateLimit.allowed) {
        logger.warn(LogChannel.RATE, 'Rate limit exceeded for sdp:send', { socketId: socket.id });
        socket.emit('error', { message: 'Rate limit exceeded' });
        return;
      }

      if (!data?.sdp?.type || typeof data.sdp.type !== 'string') {
        logger.warn(LogChannel.SDP, 'Invalid SDP data received', {
          socketId: socket.id,
          hasSdp: !!data?.sdp,
          hasType: !!data?.sdp?.type
        });
        socket.emit('error', { message: 'Invalid SDP data' });
        return;
      }

      const info = await getType(socket.id, roomArr);
      if (!info) {
        logger.warn(LogChannel.SDP, 'No room found for SDP', { socketId: socket.id });
        return;
      }

      const targetId = info.partnerId;
      if (!targetId) {
        logger.warn(LogChannel.SDP, 'No partner for SDP', { socketId: socket.id });
        return;
      }

      logger.info(LogChannel.SDP, `SDP ${data.sdp.type} forwarded`, {
        socketId: socket.id,
        targetId,
        type: data.sdp.type
      });
      
      io.to(targetId).emit('sdp:reply', { sdp: data.sdp, from: socket.id });
    } catch (error) {
      logger.logError(LogChannel.SERVER, 'Error in sdp:send handler', error, { socketId: socket.id });
    }
  });

  socket.on('ice:send', async (data: { candidate: any }) => {
    try {
      const rateLimit = await checkRateLimit(socket.id, 'ice:send');
      
      if (!rateLimit.allowed) {
        logger.warn(LogChannel.RATE, 'Rate limit exceeded for ice:send', { socketId: socket.id });
        return;
      }

      if (!data?.candidate || typeof data.candidate !== 'object') {
        logger.warn(LogChannel.ICE, 'Invalid ICE candidate received', { socketId: socket.id });
        socket.emit('error', { message: 'Invalid ICE candidate data' });
        return;
      }

      const info = await getType(socket.id, roomArr);
      if (!info) {
        logger.debug(LogChannel.ICE, 'No room for ICE candidate', { socketId: socket.id });
        return;
      }

      const targetId = info.partnerId;
      if (!targetId) return;

      logger.debug(LogChannel.ICE, 'ICE candidate forwarded', { socketId: socket.id, targetId });
      io.to(targetId).emit('ice:reply', { candidate: data.candidate, from: socket.id });
    } catch (error) {
      logger.logError(LogChannel.SERVER, 'Error in ice:send handler', error, { socketId: socket.id });
    }
  });

  socket.on('renegotiate', async () => {
    try {
      const info = await getType(socket.id, roomArr);
      if (!info) return;

      const targetId = info.partnerId;
      if (targetId) {
        logger.info(LogChannel.SDP, 'Renegotiation requested', { socketId: socket.id, targetId });
        io.to(targetId).emit('renegotiate', { from: socket.id });
      }
    } catch (error) {
      logger.logError(LogChannel.SERVER, 'Error in renegotiate handler', error, { socketId: socket.id });
    }
  });

  socket.on('media:state', async (data: { cameraOff: boolean; muted: boolean; roomid: string; type: string }) => {
    try {
      const rateLimit = await checkRateLimit(socket.id, 'media:state');
      if (!rateLimit.allowed) return;

      if (!data?.roomid) {
        logger.warn(LogChannel.MEDIA, 'Media state without roomid', { socketId: socket.id });
        return;
      }
      
      const info = await getType(socket.id, roomArr);
      if (!info || info.roomId !== data.roomid) {
        const actualRoomId = info && typeof info === 'object' ? info.roomId : null;
        logger.warn(LogChannel.MEDIA, 'Invalid roomid for media state', {
          socketId: socket.id,
          providedRoomId: data.roomid,
          actualRoomId
        });
        return;
      }

      logger.debug(LogChannel.MEDIA, 'Media state update', {
        socketId: socket.id,
        roomId: data.roomid,
        cameraOff: data.cameraOff,
        muted: data.muted
      });
      
      socket.to(data.roomid).emit('media:state', {
        cameraOff: Boolean(data.cameraOff),
        muted: Boolean(data.muted),
      });
    } catch (error) {
      logger.logError(LogChannel.SERVER, 'Error in media:state handler', error, { socketId: socket.id });
    }
  });

  socket.on('send-message', async (input: string, userType: string, roomid: string) => {
    try {
      const rateLimit = await checkRateLimit(socket.id, 'send-message');
      
      if (!rateLimit.allowed) {
        logger.warn(LogChannel.RATE, 'Rate limit exceeded for send-message', { socketId: socket.id });
        socket.emit('error', { message: 'Rate limit exceeded' });
        return;
      }

      if (typeof input !== 'string' || typeof roomid !== 'string') {
        logger.warn(LogChannel.CHAT, 'Invalid message data', { socketId: socket.id });
        return;
      }
      
      const info = await getType(socket.id, roomArr);
      if (!info || info.roomId !== roomid) {
        const actualRoomId = info && typeof info === 'object' ? info.roomId : null;
        logger.warn(LogChannel.CHAT, 'Invalid roomid for message', {
          socketId: socket.id,
          providedRoomId: roomid,
          actualRoomId
        });
        return;
      }

      const sanitized = input.slice(0, 1000).replace(/[<>]/g, '');
      
      logger.info(LogChannel.CHAT, 'Message sent', {
        socketId: socket.id,
        roomId: roomid,
        length: sanitized.length
      });
      
      socket.to(roomid).emit('get-message', sanitized);
    } catch (error) {
      logger.logError(LogChannel.SERVER, 'Error in send-message handler', error, { socketId: socket.id });
    }
  });

  socket.on('typing', async ({ roomid, isTyping }: { roomid: string; isTyping: boolean }) => {
    try {
      const rateLimit = await checkRateLimit(socket.id, 'typing');
      if (!rateLimit.allowed) return;

      if (typeof roomid !== 'string') {
        logger.warn(LogChannel.CHAT, 'Invalid typing data', { socketId: socket.id });
        return;
      }
      
      const info = await getType(socket.id, roomArr);
      if (!info || info.roomId !== roomid) {
        const actualRoomId = info && typeof info === 'object' ? info.roomId : null;
        logger.warn(LogChannel.CHAT, 'Invalid roomid for typing', {
          socketId: socket.id,
          providedRoomId: roomid,
          actualRoomId
        });
        return;
      }

      logger.debug(LogChannel.CHAT, 'Typing status', {
        socketId: socket.id,
        roomId: roomid,
        isTyping
      });
      
      socket.to(roomid).emit('typing', Boolean(isTyping));
    } catch (error) {
      logger.logError(LogChannel.SERVER, 'Error in typing handler', error, { socketId: socket.id });
    }
  });
});

setInterval(async () => {
  if (isRedisConnected()) {
    const aliveSocketIds = new Set(io.sockets.sockets.keys());
    await redisState.pruneDeadSockets(aliveSocketIds);
  }
}, 60_000);

process.on('SIGTERM', async () => {
  logger.info(LogChannel.SERVER, 'SIGTERM received, shutting down');
  await redis.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info(LogChannel.SERVER, 'SIGINT received, shutting down');
  await redis.quit();
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  logger.logError(LogChannel.SERVER, 'Uncaught exception', error);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error(LogChannel.SERVER, 'Unhandled rejection', { reason: String(reason), promise: String(promise) });
});

logger.info(LogChannel.SERVER, 'Server initialization complete', {
  port: PORT,
  nodeEnv: NODE_ENV,
  logLevel: process.env.LOG_LEVEL || 'INFO'
});
