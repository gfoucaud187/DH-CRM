import type { Metadata } from 'next'
import Providers from '@/app/providers'

export const metadata: Metadata = {
  title: 'DH Expenses',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'DH Expenses',
  },
}

export default function ScanLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      {children}
    </div>
  )
}
