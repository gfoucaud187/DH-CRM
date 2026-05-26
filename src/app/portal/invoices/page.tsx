import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { FileText } from 'lucide-react'
import Link from 'next/link'

export default async function PortalInvoicesPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/portal-login')

  const { data: profile } = await supabase
    .from('user_profiles').select('customer_id').eq('id', user.id).single()

  const { data: customer } = await supabase
    .from('customers').select('payment_terms, currency').eq('id', profile?.customer_id).single()

  const { data: invoicesRaw } = await supabase
    .from('sales_orders').select('*')
    .eq('customer_id', profile?.customer_id)
    .eq('document_type', 'invoice')
    .eq('is_foc', false)
    .order('created_at', { ascending: false })
  const invoices: any[] = invoicesRaw ?? []

  const paymentDays = parseInt((customer?.payment_terms ?? 'Net 30').replace(/\D/g, '')) || 30

  const getDaysInfo = (o: any) => {
    const invoiceDate = new Date(o.order_date ?? o.created_at)
    const dueDate = new Date(invoiceDate.getTime() + paymentDays * 86400000)
    const daysRemaining = Math.ceil((dueDate.getTime() - Date.now()) / 86400000)
    return { dueDate, daysRemaining }
  }

  const isPaid = (o: any) => o.status === 'paid'
  const totalOutstanding = invoices.filter((o: any) => !isPaid(o)).reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0)
  const overdue = invoices.filter((o: any) => !isPaid(o) && getDaysInfo(o).daysRemaining < 0)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
        <p className="text-gray-500 text-sm mt-0.5">{invoices.length} invoices · Payment terms: {customer?.payment_terms}</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Total outstanding</p>
          <p className="text-2xl font-bold text-gray-900">{customer?.currency} {totalOutstanding.toFixed(2)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Overdue</p>
          <p className={'text-2xl font-bold ' + (overdue.length > 0 ? 'text-red-600' : 'text-gray-900')}>{overdue.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Paid</p>
          <p className="text-2xl font-bold text-green-600">{invoices.filter((o: any) => isPaid(o)).length}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <FileText className="h-8 w-8 mb-2" />
            <p className="text-sm">No invoices yet</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Invoice #</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Due date</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Days</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoices.map((o: any) => {
                const paid = isPaid(o)
                const { dueDate, daysRemaining } = getDaysInfo(o)
                const isOverdue = !paid && daysRemaining < 0
                return (
                  <tr key={o.id} className={'hover:bg-gray-50 ' + (isOverdue ? 'bg-red-50' : '')}>
                    <td className="px-5 py-3 font-mono text-xs font-semibold text-gray-900">{o.order_number}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{new Date(o.order_date ?? o.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{dueDate.toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{o.currency} {Number(o.total_amount).toFixed(2)}</td>
                    <td className="px-4 py-3">
                      {paid ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Paid</span>
                      ) : (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${isOverdue ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-700'}`}>
                          {isOverdue ? 'Overdue' : 'Payable'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {!paid && (
                        <span className={`text-xs font-medium ${isOverdue ? 'text-red-600' : daysRemaining <= 7 ? 'text-amber-600' : 'text-gray-500'}`}>
                          {isOverdue ? `${Math.abs(daysRemaining)}d overdue` : `${daysRemaining}d left`}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={'/portal/invoices/' + o.id} className="text-xs text-blue-600 hover:underline">View →</Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}