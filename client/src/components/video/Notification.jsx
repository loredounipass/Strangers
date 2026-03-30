import { useState, useCallback, useRef } from 'react';

/**
 * useNotification — Hook para mostrar toasts de notificación.
 * Retorna showNotification (función imperativa) y el componente <Notification />.
 */
export function useNotification() {
  const [notifications, setNotifications] = useState([]);
  const counterRef = useRef(0);

  const showNotification = useCallback((message) => {
    const id = ++counterRef.current;
    setNotifications((prev) => [...prev, { id, message }]);

    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 3500);
  }, []);

  return { notifications, showNotification };
}

/**
 * Notification — Componente toast.
 * Migración exacta del showNotification() del index.js original.
 */
export default function Notification({ notifications }) {
  return (
    <>
      {notifications.map((n) => (
        <div key={n.id} className="notification">
          {n.message}
        </div>
      ))}
    </>
  );
}
