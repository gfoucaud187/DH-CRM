guillaume@Guillaumes-MacBook-Air dh-crm %       cat "src/app/portal/logout/route.ts"
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST() {
  const supabase = createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/portal/login', process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'))
}%                                                                                         
guillaume@Guillaumes-MacBook-Air dh-crm % guillaume@Guillaumes-MacBook-Air dh-crm %       cat "src/app/portal/logout/route.ts"
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST() {
  const supabase = createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/portal/login', process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'))
}%                                                                                          
guillaume@Guillaumes-MacBook-Air dh-crm %
zsh: parse error near `}'
guillaume@Guillaumes-MacBook-Air dh-crm % 