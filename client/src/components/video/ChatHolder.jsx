import { useRef, useEffect } from 'react';

/**
 * ChatHolder — Panel de mensajes + input + typing indicator.
 * Migración exacta del HTML de video.html.
 * Los mensajes se reciben como array en lugar de innerHTML +=.
 */
export default function ChatHolder({
  messages,
  isTyping,
  inputRef,
  onSend,
  onInput,
}) {
  const messagesEndRef = useRef(null);

  // Auto-scroll al último mensaje
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSend();
    }
  }

  return (
    <div className="chat-holder">
      <div className="messages">
        <div className="wrapper">
          {messages.map((msg) => (
            <div className="msg" key={msg.id}>
              <b>{msg.isOwn ? 'You: ' : 'Stranger: '}</b>
              <span>{msg.text}</span>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div
          id="typingIndicator"
          style={{ display: isTyping ? 'block' : 'none' }}
        >
          <span className="scanline"></span>
          Stranger is typing...
        </div>
      </div>

      <div className="input">
        <div className="input-container">
          <input
            type="text"
            placeholder="TYPE MESSAGE..."
            id="messageInput"
            ref={inputRef}
            onKeyDown={handleKeyDown}
            onChange={(e) => onInput && onInput(e.target.value)}
          />
          <button id="send" className="cyber-button small" onClick={onSend}>
            <span className="glitch-text">SEND</span>
          </button>
        </div>
      </div>
    </div>
  );
}
