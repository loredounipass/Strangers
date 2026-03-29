// Socket Events Module

export function setupSocketEvents(socket, handlers = {}) {
  const {
    onConnect,
    onStart,
    onRoomId,
    onRemoteSocket,
    onDisconnected,
    onDisconnectConfirm,
    onSdpReply,
    onIceReply,
    onMessage,
    onTyping
  } = handlers;
  
  socket.on('connect', () => {
    console.log('[SOCKET] connected', socket.id);
    if (onConnect) onConnect();
  });
  
  socket.on('start', (personType) => {
    console.log('[SOCKET] start ->', personType);
    if (onStart) onStart(personType);
  });
  
  socket.on('roomid', (id) => {
    console.log('[SOCKET] roomid ->', id);
    if (onRoomId) onRoomId(id);
  });
  
  socket.on('remote-socket', (partnerId) => {
    console.log('[SOCKET] remote-socket ->', partnerId);
    if (onRemoteSocket) onRemoteSocket(partnerId);
  });
  
  socket.on('disconnected', () => {
    console.log('[SOCKET] disconnected');
    if (onDisconnected) onDisconnected();
  });
  
  socket.on('disconnect-confirm', () => {
    console.log('[SOCKET] disconnect-confirm');
    if (onDisconnectConfirm) onDisconnectConfirm();
  });
  
  socket.on('sdp:reply', (data) => {
    console.log('[SOCKET] sdp:reply ->', data?.sdp?.type);
    if (onSdpReply) onSdpReply(data);
  });
  
  socket.on('ice:reply', (data) => {
    console.log('[SOCKET] ice:reply ->', !!data?.candidate);
    if (onIceReply) onIceReply(data);
  });
  
  socket.on('get-message', (message) => {
    console.log('[SOCKET] get-message ->', message?.slice?.(0,80));
    if (onMessage) onMessage(message);
  });
  
  socket.on('typing', (isTyping) => {
    console.log('[SOCKET] typing ->', isTyping);
    if (onTyping) onTyping(isTyping);
  });
}

export function emitSdp(socket, sdp) {
  console.log('[SOCKET] emit sdp:send ->', sdp?.type);
  socket.emit('sdp:send', { sdp });
}

export function emitIce(socket, candidate, to) {
  console.log('[SOCKET] emit ice:send ->', !!candidate);
  socket.emit('ice:send', { candidate, to });
}

export function emitStart(socket, clientIdOrCallback, callback) {
  if (typeof clientIdOrCallback === 'function' && !callback) {
    socket.emit('start', clientIdOrCallback);
    return;
  }

  // clientId provided
  console.log('[SOCKET] emit start ->', typeof clientIdOrCallback === 'string' ? '[clientId]' : '[cb]');
  socket.emit('start', clientIdOrCallback, callback);
}

export function emitDisconnectMe(socket) {
  console.log('[SOCKET] emit disconnect-me');
  socket.emit('disconnect-me');
}

export function emitSendMessage(socket, message, userType, roomid) {
  socket.emit('send-message', message, userType, roomid);
}

export function emitTyping(socket, roomid, isTyping) {
  console.log('[SOCKET] emit typing ->', roomid, isTyping);
  socket.emit('typing', { roomid, isTyping });
}
