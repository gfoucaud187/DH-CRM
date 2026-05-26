import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ShoppingCart, FileText, Clock, Plus } from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  draft:            'bg-gray-100 text-gray-500',
  pending_approval: 'bg-orange-100 text-orange-700',
  approved:         'bg-green-100 text-green-700',
  rejected:         'bg-red-100 text-red-600',
  sent_to_customer: 'bg-blue-100 text-blue-700',
}

export default async function PortalDashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/portal-login')

  const { data: profile } = await supabase
    .from('user_profiles').select('customer_id').eq('id', user.id).single()

  const { data: customer } = await supabase
    .from('customers').select('payment_terms, currency').eq('id', profile?.customer_id).single()

  const { data: posRaw } = await supabase
    .from('sales_orders').select('*')
    .eq('customer_id', profile?.customer_id)
    .eq('document_type', 'po')
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(5)
  const pos = posRaw ?? []

  const { data: invoicesRaw } = await supabase
    .from('sales_orders').select('*')
    .eq('customer_id', profile?.customer_id)
    .eq('document_type', 'invoice')
    .eq('is_foc', false)
    .order('created_at', { ascending: false })
    .limit(5)
  const invoices = invoicesRaw ?? []

  const activePOs        = pos.filter((o: any) => ['draft','pending_approval'].includes(o.status))
  const pendingInvoices  = invoices.filter((o: any) => o.status !== 'paid')
  const totalOutstanding = pendingInvoices.reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0)

  const getDaysRemaining = (o: any) => {
    const terms = customer?.payment_terms ?? 'Net 30'
    const days = parseInt(terms.replace(/\D/g, '')) || 30
    const invoiceDate = new Date(o.order_date ?? o.created_at)
    const dueDate = new Date(invoiceDate.getTime() + days * 86400000)
    return Math.ceil((dueDate.getTime() - Date.now()) / 86400000)
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-0.5">Overview of your account</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <ShoppingCart className="h-4 w-4 text-orange-500" />
            <span className="text-sm text-gray-500">Active orders</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{activePOs.length}</p>
          <p className="text-xs text-gray-400 mt-1">purchase orders in progress</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="h-4 w-4 text-purple-500" />
            <span className="text-sm text-gray-500">Pending invoices</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{pendingInvoices.length}</p>
          <p className="text-xs text-gray-400 mt-1">awaiting payment</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-amber-500" />
            <span className="text-sm text-gray-500">Outstanding</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {customer?.currency} {totalOutstanding.toFixed(2)}
          </p>
          <p className="text-xs text-gray-400 mt-1">total due</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">My Orders</h2>
            <div className="flex items-center gap-3">
              <Link href="/portal/orders/new"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-gray-700 transition-colors">
                <Plus className="h-3.5 w-3.5" /> New
              </Link>
              <Link href="/portal/orders" className="text-xs text-blue-600 hover:underline">View all</Link>
            </div>
          </div>
          {pos.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">No orders yet</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {pos.map((o: any) => (
                <Link key={o.id} href={'/portal/orders/' + o.id}
                  className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
                  <div>
                    <p className="font-mono text-xs font-semibold text-gray-900">{o.order_number}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{new Date(o.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-600">{o.total_units} u</span>
                    <span className="text-sm font-semibold text-gray-900">{o.currency} {Number(o.total_amount).toFixed(2)}</span>
                    <span className={'text-xs px-2 py-0.5 rounded-full font-medium ' + (STATUS_COLORS[o.status] ?? 'bg-gray-100 text-gray-500')}>
                      {o.status?.replace(/_/g,' ')}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Invoices</h2>
            <Link href="/portal/invoices" className="text-xs text-blue-600 hover:underline">View all</Link>
          </div>
          {invoices.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">No invoices yet</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {invoices.map((o: any) => {
                const daysRemaining = getDaysRemaining(o)
                const isPaid = o.status === 'paid'
                return (
                  <Link key={o.id} href={'/portal/invoices/' + o.id}
                    className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
                    <div>
                      <p className="font-mono text-xs font-semibold text-gray-900">{o.order_number}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{new Date(o.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-gray-900">{o.currency} {Number(o.total_amount).toFixed(2)}</span>
                      {isPaid ? (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">Paid</span>
                      ) : (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${daysRemaining < 0 ? 'bg-red-100 text-red-600' : daysRemaining <= 7 ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                          {daysRemaining < 0 ? `${Math.abs(daysRemaining)}d overdue` : `${daysRemaining}d left`}
                        </span>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}