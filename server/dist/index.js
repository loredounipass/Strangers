"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
// Load env from server/.env (works when running from dist/ or src/)
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '..', '.env') });
const cors_1 = __importDefault(require("cors"));
const socket_io_1 = require("socket.io");
const lib_1 = require("./lib");
const app = (0, express_1.default)();
const allowedOrigins = ((_a = process.env.ALLOWED_ORIGINS) === null || _a === void 0 ? void 0 : _a.split(',')) || ['http://localhost:3000'];
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        const allowedClean = (allowedOrigins || []).map(s => s.trim()).filter(Boolean);
        // Log for debugging during development
        console.log('[CORS] request origin =', origin, 'allowed =', allowedClean);
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin)
            return callback(null, true);
        // Allow explicit allowed origins or any app.github.dev preview origin for this dev environment
        if (allowedClean.indexOf(origin) !== -1 || origin.endsWith('.app.github.dev')) {
            return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST'],
}));
// Endpoint to return ICE servers (STUN/TURN) configured via environment
app.get('/ice', (req, res) => {
    const servers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ];
    if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
        servers.push({ urls: process.env.TURN_URL, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
    }
    // No public TURN URL handling — only credentialed TURN via TURN_URL/TURN_USERNAME/TURN_CREDENTIAL
    console.log('[ICE] returning ICE servers:', servers);
    res.json({ servers });
});
const server = app.listen(8000, () => console.log('Server is up, 8000'));
const io = new socket_io_1.Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
    pingTimeout: 10000,
    pingInterval: 5000,
});
const activeSockets = new Set();
let roomArr = [];
io.on('connection', (socket) => {
    activeSockets.add(socket.id);
    console.log('[SERVER] emit online ->', activeSockets.size);
    io.emit('online', activeSockets.size);
    console.log('[SERVER] New socket connected:', socket.id);
    // START (client may provide a persistent clientId to allow reconnection)
    socket.on('start', (clientIdOrCb, cb) => {
        try {
            console.log('[SERVER] start event from', socket.id, 'args:', clientIdOrCb ? '[clientId]' : '[cb]');
            // Allow both signatures: (cb) or (clientId, cb)
            if (typeof clientIdOrCb === 'function') {
                // old signature
                (0, lib_1.handelStart)(roomArr, socket, undefined, clientIdOrCb, io);
            }
            else if (typeof cb === 'function') {
                (0, lib_1.handelStart)(roomArr, socket, clientIdOrCb, cb, io);
            }
            else {
                console.warn('Client emitted start without callback');
                console.log('[SERVER] emit error -> Missing callback for start event to', socket.id);
                socket.emit('error', { message: 'Missing callback for start event' });
            }
        }
        catch (error) {
            console.error('Error in start handler:', error);
        }
    });
    // DISCONNECT (unexpected network disconnect)
    socket.on('disconnect', () => {
        (0, lib_1.handelDisconnect)(socket.id, roomArr, io, false);
        if (activeSockets.has(socket.id))
            activeSockets.delete(socket.id);
        console.log('[SERVER] emit online ->', activeSockets.size);
        io.emit('online', activeSockets.size);
    });
    // DISCONNECT-ME
    socket.on('disconnect-me', (cb) => {
        try {
            // Explicit client-initiated exit: force immediate cleanup so resources
            // are not held and the user won't be rematched with stale entries.
            (0, lib_1.handelDisconnect)(socket.id, roomArr, io, true);
            if (activeSockets.has(socket.id))
                activeSockets.delete(socket.id);
            console.log('[SERVER] emit online ->', activeSockets.size);
            io.emit('online', activeSockets.size);
            // Acknowledge the client that disconnect handling is done
            if (typeof cb === 'function') {
                try {
                    cb();
                }
                catch (e) { }
            }
            // Also emit a named confirmation for clients that listen for it
            try {
                socket.emit('disconnect-confirm');
            }
            catch (e) { }
        }
        catch (err) {
            console.error('Error handling disconnect-me:', err);
            if (typeof cb === 'function') {
                try {
                    cb(err);
                }
                catch (e) { }
            }
        }
    });
    // NEXT
    socket.on('next', () => {
        try {
            const room = roomArr.find(r => r.p1.id === socket.id || r.p2.id === socket.id);
            if (room && (room.p1.id && room.p2.id)) { // Ensure both players are in the room
                (0, lib_1.handelDisconnect)(socket.id, roomArr, io);
                (0, lib_1.handelStart)(roomArr, socket, undefined, (person) => {
                    if (socket.connected) {
                        console.log('[SERVER] emit start ->', person, 'to', socket.id);
                        socket.emit('start', person);
                    }
                }, io);
            }
            else {
                try {
                    // Always disconnect the client from their current room and request a new start.
                    // This lets the server reassign them even if there's no other peer available
                    // (it will be placed in the available queue or matched if possible).
                    console.log('[SERVER] next requested by', socket.id);
                    try {
                        (0, lib_1.handelDisconnect)(socket.id, roomArr, io);
                    }
                    catch (e) {
                        console.warn('[SERVER] handelDisconnect failed in next', e);
                    }
                    (0, lib_1.handelStart)(roomArr, socket, undefined, (person) => {
                        if (socket.connected) {
                            console.log('[SERVER] emit start ->', person, 'to', socket.id, 'after next');
                            socket.emit('start', person);
                        }
                    }, io);
                }
                catch (error) {
                    console.error('Error in next handler:', error);
                    socket.emit('error', { message: 'Internal server error in next' });
                }
            }
        }
        catch (error) {
            console.error('Error in leave handler:', error);
        }
    });
    // ICE CANDIDATE
    socket.on('ice:send', (data) => {
        try {
            // Validar que candidate sea un objeto válido
            if (!data || !data.candidate || typeof data.candidate !== 'object') {
                socket.emit('error', { message: 'Invalid ICE candidate data' });
                return;
            }
            const type = (0, lib_1.getType)(socket.id, roomArr);
            if (type && 'type' in type) {
                const target = type.type === 'p1' ? type.p2id : type.p1id;
                console.log(`[SOCKET] ICE from ${socket.id} -> ${target}`);
                if (target) {
                    console.log('[SERVER] emit ice:reply -> to', target);
                    io.to(target).emit('ice:reply', { candidate: data.candidate, from: socket.id });
                }
            }
        }
        catch (error) {
            console.error('Error in ice:send handler:', error);
            socket.emit('error', { message: 'Internal server error' });
        }
    });
    // SDP
    socket.on('sdp:send', (data) => {
        var _a, _b;
        try {
            // Validar que sdp sea un objeto válido con type y sdp
            if (!data || !data.sdp || typeof data.sdp !== 'object' || !data.sdp.type) {
                socket.emit('error', { message: 'Invalid SDP data' });
                return;
            }
            const type = (0, lib_1.getType)(socket.id, roomArr);
            if (type && 'type' in type) {
                const target = type.type === 'p1' ? type.p2id : type.p1id;
                console.log(`[SOCKET] SDP (${(_a = data.sdp) === null || _a === void 0 ? void 0 : _a.type}) from ${socket.id} -> ${target}`);
                if (target) {
                    console.log('[SERVER] emit sdp:reply -> to', target, 'type', (_b = data.sdp) === null || _b === void 0 ? void 0 : _b.type);
                    io.to(target).emit('sdp:reply', { sdp: data.sdp, from: socket.id });
                }
            }
        }
        catch (error) {
            console.error('Error in sdp:send handler:', error);
            socket.emit('error', { message: 'Internal server error' });
        }
    });
    // CHAT
    socket.on('send-message', (input, userType, roomid) => {
        try {
            if (typeof input === 'string' && typeof roomid === 'string') {
                const prefix = userType === 'p1' ? 'You: ' : 'Stranger: ';
                console.log('[SERVER] emit get-message -> to room', roomid);
                socket.to(roomid).emit('get-message', input, prefix);
            }
        }
        catch (error) {
            console.error('Error in send-message handler:', error);
        }
    });
    // TYPING
    socket.on('typing', ({ roomid, isTyping }) => {
        try {
            if (typeof roomid === 'string') {
                console.log('[SERVER] emit typing -> to room', roomid, isTyping);
                socket.to(roomid).emit('typing', isTyping);
            }
        }
        catch (error) {
            console.error('Error in typing handler:', error);
        }
    });
    // RECONNECT
    socket.on('reconnect', (attemptNumber) => {
        console.log(`[SERVER] client ${socket.id} reconnected after ${attemptNumber} attempts`);
        console.log('[SERVER] emit reconnected ->', socket.id);
        socket.emit('reconnected');
    });
    // RENEGOTIATE - forward to partner to coordinate adding/removing tracks
    socket.on('renegotiate', () => {
        try {
            const type = (0, lib_1.getType)(socket.id, roomArr);
            if (type && 'type' in type) {
                const targetId = type.type === 'p1' ? type.p2id : type.p1id;
                if (targetId) {
                    console.log('[SERVER] emit renegotiate -> to', targetId);
                    io.to(targetId).emit('renegotiate', { from: socket.id });
                }
            }
        }
        catch (error) {
            console.error('Error in renegotiate handler:', error);
        }
    });
    // Verificar el estado de la sala antes de proceder con el "Next"
    socket.on('check-room-status', (roomid, callback) => {
        try {
            const room = roomArr.find(r => r.roomid === roomid);
            if (room && room.p1.id && room.p2.id) {
                callback('ready');
            }
            else {
                callback('not_ready');
            }
        }
        catch (error) {
            console.error('Error checking room status:', error);
            callback('not_ready');
        }
    });
});
