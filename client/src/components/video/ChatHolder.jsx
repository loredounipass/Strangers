import { useRef, useEffect, useState } from 'react';
import EmojiPicker from 'emoji-picker-react';

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
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

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

  function handleEmojiClick(emojiObject) {
    const input = inputRef.current;
    if (input) {
      const start = input.selectionStart;
      const end = input.selectionEnd;
      const currentValue = input.value;
      const newValue = currentValue.substring(0, start) + emojiObject.emoji + currentValue.substring(end);
      input.value = newValue;
      input.focus();
      input.setSelectionRange(start + emojiObject.emoji.length, start + emojiObject.emoji.length);
      onInput && onInput(newValue);
    }
    setShowEmojiPicker(false);
  }

  return (
    <div className="chat-holder">
      <div className="messages">
        <div className="wrapper">
          {messages.map((msg) => (
            <div className={`msg ${msg.isOwn ? 'own-msg' : 'stranger-msg'}`} key={msg.id}>
              <b>{msg.isOwn ? 'You: ' : 'Stranger: '}</b>
              <span>{msg.text}</span>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div
        className="typing-indicator"
        style={{ display: isTyping ? 'flex' : 'none' }}
      >
        <span className="typing-text">Stranger is typing</span>
        <div className="typing-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>

      <div className="input">
        <div className="input-container">
          <button 
            className="emoji-btn" 
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            title="Add emoji"
          >
            😊
          </button>
          <input
            type="text"
            placeholder="Message..."
            id="messageInput"
            ref={inputRef}
            onKeyDown={handleKeyDown}
            onChange={(e) => onInput && onInput(e.target.value)}
          />
          <button id="send" onClick={onSend} title="Send">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
        {showEmojiPicker && (
          <div className="emoji-picker-wrapper">
            <EmojiPicker onEmojiClick={handleEmojiClick} />
          </div>
        )}
      </div>
    </div>
  );
}
