import { Outlet } from 'react-router-dom';

/**
 * PublicRoute — Wrapper para rutas públicas (sin autenticación).
 * Actualmente hace pass-through con <Outlet />.
 * En el futuro se puede extender para redirigir usuarios autenticados,
 * mostrar layouts compartidos, o aplicar lógica de guards.
 */
export default function PublicRoute() {
  return <Outlet />;
}
