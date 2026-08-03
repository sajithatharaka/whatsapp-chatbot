import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login'];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // `getUser()` revalidates the session against the Auth server rather than
  // trusting the (spoofable) session cookie, unlike `getSession()`.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    return NextResponse.redirect(redirectUrl);
  }

  if (user && request.nextUrl.pathname === '/login') {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/dashboard';
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
