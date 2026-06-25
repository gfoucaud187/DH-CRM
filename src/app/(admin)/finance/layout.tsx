'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Receipt, Users2, Landmark, BookOpen, TrendingUp, Scale, Clock } from 'lucide-react'

const FINANCE_NAV = [
  { href: '/finance/dashboard',       label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/finance/expenses',        label: 'Expenses',     icon: Receipt },
  { href: '/finance/reports/ageing',  label: 'AR/AP Ageing', icon: Clock },
]

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div>
      <div className="mb-6 flex items-center gap-1 border-b border-gray-100 pb-4 overflow-x-auto">
        {FINANCE_NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                active
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <Icon size={14} />
              {label}
            </Link>
          )
        })}
      </div>
      {children}
    </div>
  )
}
