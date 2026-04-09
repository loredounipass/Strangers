import { useState, useCallback } from 'react';

/**
 * useChat — Estado del chat como array de mensajes React.
 * Reemplaza el patrón innerHTML += del código original.
 */
export function useChat() {
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);

  // C-06: Full HTML entity encoding — mirrors server sanitizeMessage()
  // React escapes JSX by default, but we also sanitize before storing in state
  // to protect any non-JSX rendering paths and future consumers.
  function sanitize(text) {
    const map = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#x27;', '`': '&#x60;' };
    return text.slice(0, 1000).replace(/[<>&"'`]/g, (c) => map[c] || c).trim();
  }

  const addMessage = useCallback((text, isOwn = false) => {
    const sanitized = sanitize(text);
    setMessages((prev) => [
      ...prev,
      { id: Date.now() + Math.random(), text: sanitized, isOwn },
    ]);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const showTyping = useCallback((show) => {
    setIsTyping(show);
  }, []);

  return {
    messages,
    isTyping,
    addMessage,
    clearMessages,
    showTyping,
    sanitize,
  };
}
