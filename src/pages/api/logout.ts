import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ cookies, redirect }) => {
  cookies.delete('session-token', { path: '/' });
  return redirect('/login', 302);
};
