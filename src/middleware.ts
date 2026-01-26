import type { MiddlewareHandler } from 'astro';

export const onRequest: MiddlewareHandler = async ({ url, cookies, redirect }, next) => {
  const pathname = url.pathname;

  // Rutas públicas que no requieren autenticación
  const publicRoutes = ['/login', '/api/login', '/api/logout'];
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));

  // Verificar si el usuario está autenticado
  const sessionToken = cookies.get('session-token')?.value;
  const isAuthenticated = sessionToken === 'authenticated';

  // Si no está autenticado y trata de acceder a una ruta protegida, redirigir a login
  if (!isAuthenticated && !isPublicRoute && pathname !== '/favicon.svg' && !pathname.startsWith('/_astro')) {
    return redirect('/login', 302);
  }

  // Si está autenticado y trata de acceder a login, redirigir al inicio
  if (isAuthenticated && pathname === '/login') {
    return redirect('/', 302);
  }

  return next();
};
