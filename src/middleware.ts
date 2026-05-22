import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const response = NextResponse.next()
  const { pathname } = request.nextUrl

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: {
      get: (name) => request.cookies.get(name)?.value,
      set: (name, value, options) => { response.cookies.set({ name, value, ...options }) },
      remove: (name, options) => { response.cookies.set({ name, value: '', ...options }) },
    }}
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Public routes
  if (pathname === '/login' || pathname.startsWith('/portal/login') || pathname.startsWith('/portal/first-login')) {
    if (user) {
      const { data: profile } = await supabase
        .from('user_profiles').select('role').eq('id', user.id).single()
      if (profile?.role === 'client') return NextResponse.redirect(new URL('/portal/dashboard', request.url))
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return response
  }

  // Portal routes — require client role
  if (pathname.startsWith('/portal')) {
    if (!user) return NextResponse.redirect(new URL('/portal/login', request.url))
    const { data: profile } = await supabase
      .from('user_profiles').select('role, customer_id').eq('id', user.id).single()
    if (!profile || profile.role !== 'client') return NextResponse.redirect(new URL('/login', request.url))
    return response
  }

  // Admin routes — require admin role
  if (!user) return NextResponse.redirect(new URL('/login', request.url))
  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (profile?.role === 'client') return NextResponse.redirect(new URL('/portal/dashboard', request.url))

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
