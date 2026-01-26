import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const data = await request.formData();
  const password = data.get('password')?.toString();

  // Obtener contraseña de variable de entorno
  const validPassword = import.meta.env.AUTH_PASSWORD;

  // Validar que se proporcionó contraseña
  if (!password) {
    return new Response(
      JSON.stringify({ error: 'Contraseña incorrecta' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Validar que la contraseña está configurada
  if (!validPassword) {
    return new Response(
      JSON.stringify({ error: 'Configuración de contraseña no válida' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Verificar si la contraseña coincide
  if (password === validPassword) {
    // Establecer cookie de sesión
    cookies.set('session-token', 'authenticated', {
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 días
      path: '/'
    });

    return redirect('/', 302);
  }

  return new Response(
    JSON.stringify({ error: 'Contraseña incorrecta' }),
    { status: 401, headers: { 'Content-Type': 'application/json' } }
  );
};
