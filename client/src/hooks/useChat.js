import { useState, useCallback } from 'react';

/**
 * useChat — Estado del chat como array de mensajes React.
 * Reemplaza el patrón innerHTML += del código original.
 */
export function useChat() {
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);

  function sanitize(text) {
    return text.replace(/[<>]/g, '');
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
