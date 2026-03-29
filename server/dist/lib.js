"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handelStart = handelStart;
exports.handelDisconnect = handelDisconnect;
exports.getType = getType;
const uuid_1 = require("uuid");
// Grace timers for disconnected clients (roomid -> timeout)
const cleanupTimers = new Map();
function handelStart(roomArr, socket, clientId, cb, io) {
    console.log('[SERVER] Nueva conexión start:', socket.id, 'clientId:', clientId);
    // check available rooms
    // First, try to recover a previous room if clientId matches
    const recovered = tryRecoverRoom(clientId);
    if (recovered) {
        // recovered will have restored socket to existing room
        cb(recovered.role);
        if (recovered.partnerId) {
            console.log('[SERVER] emit remote-socket -> to', recovered.partnerId, 'with', socket.id);
            io.to(recovered.partnerId).emit('remote-socket', socket.id);
            console.log('[SERVER] emit remote-socket -> to', socket.id, 'with', recovered.partnerId);
            socket.emit('remote-socket', recovered.partnerId);
        }
        return;
    }
    let availableroom = checkAvailableRoom();
    if (availableroom.is) {
        console.log('[SERVER] Sala disponible:', availableroom.roomid);
        socket.join(availableroom.roomid);
        cb('p2');
        closeRoom(availableroom.roomid);
        if (availableroom === null || availableroom === void 0 ? void 0 : availableroom.room) {
            console.log('[SERVER] Enviando remote-socket a p1:', availableroom.room.p1.id, 'nuevo p2:', socket.id);
            console.log('[SERVER] emit remote-socket -> to', availableroom.room.p1.id, socket.id);
            io.to(availableroom.room.p1.id).emit('remote-socket', socket.id);
            console.log('[SERVER] emit remote-socket -> to', socket.id, availableroom.room.p1.id);
            socket.emit('remote-socket', availableroom.room.p1.id);
            console.log('[SERVER] emit roomid -> to', socket.id, availableroom.room.roomid);
            socket.emit('roomid', availableroom.room.roomid);
        }
    }
    else {
        let roomid = (0, uuid_1.v4)();
        socket.join(roomid);
        roomArr.push({
            roomid,
            isAvailable: true,
            p1: {
                id: socket.id,
                clientId: clientId || null
            },
            p2: {
                id: null,
                clientId: null
            },
            lastSeen: Date.now()
        });
        cb('p1');
        socket.emit('roomid', roomid);
    }
    function closeRoom(roomid) {
        for (let i = 0; i < roomArr.length; i++) {
            if (roomArr[i].roomid == roomid) {
                roomArr[i].isAvailable = false;
                roomArr[i].p2.id = socket.id;
                roomArr[i].p2.clientId = clientId || null;
                break;
            }
        }
    }
    function checkAvailableRoom() {
        for (let i = 0; i < roomArr.length; i++) {
            const currentRoom = roomArr[i];
            // Si hay una sala disponible, y el usuario no es el que ya está en ella
            if (currentRoom.isAvailable && currentRoom.p1.id !== socket.id) {
                return { is: true, roomid: currentRoom.roomid, room: currentRoom };
            }
        }
        return { is: false, roomid: '', room: null };
    }
    function tryRecoverRoom(clientId) {
        if (!clientId)
            return false;
        for (let i = 0; i < roomArr.length; i++) {
            const r = roomArr[i];
            if (r.p1.clientId === clientId) {
                // recover p1
                r.p1.id = socket.id;
                r.lastSeen = undefined;
                if (cleanupTimers.has(r.roomid)) {
                    clearTimeout(cleanupTimers.get(r.roomid));
                    cleanupTimers.delete(r.roomid);
                }
                socket.join(r.roomid);
                return { role: 'p1', partnerId: r.p2.id };
            }
            if (r.p2.clientId === clientId) {
                // recover p2
                r.p2.id = socket.id;
                r.lastSeen = undefined;
                if (cleanupTimers.has(r.roomid)) {
                    clearTimeout(cleanupTimers.get(r.roomid));
                    cleanupTimers.delete(r.roomid);
                }
                socket.join(r.roomid);
                return { role: 'p2', partnerId: r.p1.id };
            }
        }
        return false;
    }
}
function handelDisconnect(disconnectedId, roomArr, io) {
    var _a, _b, _c;
    // Instead of immediate removal, keep the room for a grace period so client can reconnect
    for (let i = 0; i < roomArr.length; i++) {
        const room = roomArr[i];
        if (room.p1.id === disconnectedId || ((_a = room.p2) === null || _a === void 0 ? void 0 : _a.id) === disconnectedId) {
            const isP1 = room.p1.id === disconnectedId;
            const partner = isP1 ? (_b = room.p2) === null || _b === void 0 ? void 0 : _b.id : (_c = room.p1) === null || _c === void 0 ? void 0 : _c.id;
            if (partner)
                io.to(partner).emit('disconnected');
            // set id to null but preserve clientId and mark lastSeen
            if (isP1) {
                room.p1.id = null;
                room.lastSeen = Date.now();
            }
            else {
                room.p2.id = null;
                room.lastSeen = Date.now();
            }
            // schedule actual cleanup after 30 seconds
            if (!cleanupTimers.has(room.roomid)) {
                const t = setTimeout(() => {
                    var _a, _b;
                    // remove room if still empty or only one without clientId
                    const idx = roomArr.findIndex(r => r.roomid === room.roomid);
                    if (idx !== -1) {
                        const rcur = roomArr[idx];
                        if ((!rcur.p1.id && !((_a = rcur.p2) === null || _a === void 0 ? void 0 : _a.id)) || (rcur.p1.id === null && !rcur.p1.clientId && !((_b = rcur.p2) === null || _b === void 0 ? void 0 : _b.id))) {
                            roomArr.splice(idx, 1);
                        }
                        else {
                            // make available if partner remains
                            rcur.isAvailable = true;
                        }
                    }
                    cleanupTimers.delete(room.roomid);
                }, 30000);
                cleanupTimers.set(room.roomid, t);
            }
        }
    }
}
function getType(id, roomArr) {
    for (let i = 0; i < roomArr.length; i++) {
        if (roomArr[i].p1.id == id) {
            return { type: 'p1', p2id: roomArr[i].p2.id };
        }
        else if (roomArr[i].p2.id == id) {
            return { type: 'p2', p1id: roomArr[i].p1.id };
        }
    }
    return false;
}
