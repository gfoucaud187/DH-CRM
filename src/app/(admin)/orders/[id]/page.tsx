'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Package, Truck, CheckCircle, XCircle, FileText, Edit, Send, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import InvoicePDF from '@/components/pdf/InvoicePDF'

const SO_STATUSES = [
  { value: 'draft',               label: 'Draft',               icon: FileText,    color: 'bg-gray-100 text-gray-600' },
  { value: 'submitted_to_client', label: 'Submitted to Client', icon: Send,        color: 'bg-blue-100 text-blue-700' },
  { value: 'in_preparation',      label: 'In Preparation',      icon: Package,     color: 'bg-amber-100 text-amber-700' },
  { value: 'ready_for_shipment',  label: 'Ready for Shipment',  icon: Truck,       color: 'bg-purple-100 text-purple-700' },
  { value: 'shipped',             label: 'Shipped',             icon: Truck,       color: 'bg-indigo-100 text-indigo-700' },
  { value: 'completed',           label: 'Completed',           icon: CheckCircle, color: 'bg-green-100 text-green-700' },
  { value: 'cancelled',           label: 'Cancelled',           icon: XCircle,     color: 'bg-red-100 text-red-600' },
]

const INVOICE_STATUSES = [
  { value: 'draft',            label: 'Draft',            icon: FileText, color: 'bg-gray-100 text-gray-600' },
  { value: 'sent_to_customer', label: 'Sent to Customer', icon: Send,     color: 'bg-blue-100 text-blue-700' },
]

const PO_STATUSES = [
  { value: 'pending_approval', label: 'Pending Approval', icon: FileText,    color: 'bg-orange-100 text-orange-700' },
  { value: 'approved',         label: 'Approved',         icon: CheckCircle, color: 'bg-green-100 text-green-700' },
  { value: 'rejected',         label: 'Rejected',         icon: XCircle,     color: 'bg-red-100 text-red-600' },
]

const INT_STATUSES = [
  { value: 'draft',             label: 'Draft',             icon: FileText,    color: 'bg-gray-100 text-gray-600' },
  { value: 'in_preparation',    label: 'In Preparation',    icon: Package,     color: 'bg-amber-100 text-amber-700' },
  { value: 'stock_transferred', label: 'Stock Transferred', icon: CheckCircle, color: 'bg-teal-100 text-teal-700' },
  { value: 'cancelled',         label: 'Cancelled',         icon: XCircle,     color: 'bg-red-100 text-red-600' },
]

export default function OrderDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const supabase = createClient()
  const queryClient = useQueryClient()

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('sales_orders')
        .select('*, lines:sales_order_lines(*), customer:customers(legal_name, contacts, addresses, vat_number, track_trace_enabled)')
        .eq('id', id)
        .single()
      return data
    }
  })

  const { data: focOrder } = useQuery({
    queryKey: ['order-foc', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('sales_orders')
        .select('*, lines:sales_order_lines(*)')
        .eq('linked_order_id', id)
        .eq('is_foc', true)
        .maybeSingle()
      return data
    },
    enabled: !!id
  })

  const { data: linkedDoc } = useQuery({
    queryKey: ['order-linked', order?.linked_order_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('sales_orders')
        .select('id, order_number, document_type, status')
        .eq('id', order.linked_order_id)
        .single()
      return data
    },
    enabled: !!order?.linked_order_id
  })

  const { data: sourceDoc } = useQuery({
    queryKey: ['order-source', order?.promoted_from],
    queryFn: async () => {
      const { data } = await supabase
        .from('sales_orders')
        .select('id, order_number, document_type, status')
        .eq('id', order.promoted_from)
        .single()
      return data
    },
    enabled: !!order?.promoted_from
  })

  const { data: appSettings } = useQuery({
    queryKey: ['app-settings'],
    queryFn: async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('*')
        .eq('key', 'main')
        .single()
      return data
    }
  })

  const { mutate: updateStatus } = useMutation({
    mutationFn: async (status: any) => {
      const oldStatus = order?.status
      const { error } = await supabase
        .from('sales_orders')
        .update({ status })
        .eq('id', id as string)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    }
  })

  const handlePromote = async () => {
    const res = await fetch('/api/orders/promote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: id }),
    })
    const data = await res.json()
    if (data.success) {
      router.push('/orders/' + data.invoice.id)
    } else alert('Error: ' + data.error)
  }

  const handleCreateFoc = async () => {
    const res = await fetch('/api/orders/create-foc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ so_id: id }),
    })
    const data = await res.json()
    if (data.success) {
      router.push('/orders/' + data.foc_order.id + '/edit')
    } else if (data.existing_id) router.push('/orders/' + data.existing_id)
    else alert('Error: ' + data.error)
  }

  const handleApprovePO = async () => {
    const res = await fetch('/api/orders/promote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: id, target_type: 'so' }),
    })
    const data = await res.json()
    if (data.success) {
      await supabase.from('sales_orders').update({ status: 'approved' }).eq('id', id as string)
      router.push('/orders/' + data.invoice.id)
    } else alert('Error: ' + data.error)
  }

  const handleRejectPO = async () => {
    const comment = (document.getElementById('reject-comment') as HTMLTextAreaElement)?.value
    if (!comment?.trim()) return alert('Please add a reason for rejection')
    await supabase.from('sales_orders').update({
      status: 'rejected',
      rejection_comment: comment,
    }).eq('id', id as string)
    queryClient.invalidateQueries({ queryKey: ['order', id] })
    queryClient.invalidateQueries({ queryKey: ['orders'] })
    router.push('/orders')
  }

  if (isLoading) return <div className="flex items-center justify-center h-48 text-gray-400">Loading...</div>
  if (!order) return <div className="text-center py-12 text-gray-400">Order not found</div>

  const isInvoice  = order.document_type === 'invoice'
  const isSO       = order.document_type === 'so'
  const isPO       = order.document_type === 'po'
  const isInt      = order.document_type === 'so_int'
  const isDraft    = order.status === 'draft'
  const isProforma = order.document_type === 'proforma'

  const statuses = isInvoice ? INVOICE_STATUSES
    : isProforma ? [{ value: 'draft', label: 'Draft', icon: FileText, color: 'bg-gray-100 text-gray-600' }]
    : isPO ? PO_STATUSES
    : isInt ? INT_STATUSES
    : SO_STATUSES

  const currentStatus = statuses.find((s: any) => s.value === order.status) ?? statuses[0]
  const commercialLines = (order.lines ?? []).filter((l: any) => l.line_type === 'commercial' || l.line_type === 'foc')
  const alreadyHasInvoice = isSO && !!linkedDoc && linkedDoc.document_type === 'invoice'
  const alreadyHasFoc = isSO && !!focOrder

  const getDocLabel = () => {
    if (isInt) return 'SO(INT)'
    if (order.is_foc && isInvoice) return 'INV(DO)'
    if (order.is_foc) return 'SO(DO)'
    return order.document_type?.toUpperCase()
  }

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/orders" className="text-gray-400 hover:text-gray-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{order.order_number ?? 'Draft'}</h1>
            <span className={'px-3 py-1 rounded-full text-xs font-medium ' + currentStatus.color}>
              {currentStatus.label}
            </span>
            <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600 uppercase font-mono">
              {getDocLabel()}
            </span>
            {order.is_tt_order && <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700">T&T</span>}
            {order.is_foc && <span className="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-700">FOC</span>}
            {order.is_sample && <span className="px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-700">SAMPLE</span>}
            {isPO && order.requires_stock_review && (
              <span className="px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-700">⚠ Stock review</span>
            )}
          </div>
          {isInt ? (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded">{order.warehouse}</span>
              <ArrowRight className="h-4 w-4 text-teal-500" />
              <span className="text-sm font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded">{order.warehouse_destination ?? '—'}</span>
              <span className="text-gray-400 text-sm ml-1">Internal transfer</span>
            </div>
          ) : (
            <p className="text-gray-500 text-sm mt-0.5">{order.customer_name} · {order.warehouse}</p>
          )}
        </div>
        {(isDraft && !isPO) || (isDraft && isInt) ? (
          <Link href={'/orders/' + id + '/edit'}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
            <Edit className="h-4 w-4" /> Edit
          </Link>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-1 space-y-4">

          {isInt && (
            <div className="bg-teal-50 rounded-xl border border-teal-200 p-4">
              <h2 className="font-semibold text-teal-900 mb-3">Internal Transfer</h2>
              <div className="flex items-center justify-between mb-3">
                <div className="text-center">
                  <p className="text-xs text-teal-600 mb-1">FROM</p>
                  <span className="px-3 py-2 bg-white border border-teal-200 rounded-lg text-sm font-bold text-teal-800">{order.warehouse}</span>
                </div>
                <ArrowRight className="h-6 w-6 text-teal-400" />
                <div className="text-center">
                  <p className="text-xs text-teal-600 mb-1">TO</p>
                  <span className="px-3 py-2 bg-white border border-teal-200 rounded-lg text-sm font-bold text-teal-800">{order.warehouse_destination ?? '—'}</span>
                </div>
              </div>
              {order.status === 'stock_transferred' && (
                <p className="text-xs text-teal-700 bg-teal-100 rounded-lg px-3 py-2 text-center font-medium">
                  ✅ Stock successfully transferred
                </p>
              )}
            </div>
          )}

          {isPO && order.status === 'pending_approval' && (
            <>
              <div className="bg-orange-50 rounded-xl border border-orange-200 p-4">
                <h2 className="font-semibold text-orange-900 mb-1">Purchase Order</h2>
                <p className="text-xs text-orange-700 mb-3">Review and approve or reject.</p>
                {order.requires_stock_review && (
                  <p className="text-xs text-amber-700 bg-amber-100 rounded px-2 py-1 mb-3">
                    ⚠ Some quantities exceed available stock.
                  </p>
                )}
                <button onClick={handleApprovePO}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors mb-2">
                  <CheckCircle className="h-4 w-4" /> Convert to SO
                </button>
              </div>
              <div className="bg-white rounded-xl border border-red-200 p-4">
                <h2 className="font-semibold text-gray-900 mb-1">Reject Order</h2>
                <p className="text-xs text-gray-500 mb-2">Client will see your message and can resubmit.</p>
                <textarea id="reject-comment" rows={3}
                  placeholder="Explain what needs to be changed..."
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none resize-none mb-2" />
                <button onClick={handleRejectPO}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors">
                  <XCircle className="h-4 w-4" /> Reject
                </button>
              </div>
            </>
          )}

          {isPO && order.status === 'rejected' && order.rejection_comment && (
            <div className="bg-red-50 rounded-xl border border-red-200 p-4">
              <h2 className="font-semibold text-red-800 mb-2">Rejection reason</h2>
              <p className="text-sm text-red-700">{order.rejection_comment}</p>
            </div>
          )}

          {(sourceDoc || linkedDoc) && (
            <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 space-y-2">
              <h2 className="font-semibold text-blue-800 text-sm">Linked Documents</h2>
              {sourceDoc && (
                <button onClick={() => router.push('/orders/' + sourceDoc.id)}
                  className="w-full text-left text-sm text-blue-700 hover:underline">
                  From: {sourceDoc.document_type.toUpperCase()} {sourceDoc.order_number}
                </button>
              )}
              {linkedDoc && linkedDoc.document_type === 'invoice' && (
                <button onClick={() => router.push('/orders/' + linkedDoc.id)}
                  className="w-full text-left text-sm text-blue-700 hover:underline">
                  Invoice: {linkedDoc.order_number}
                </button>
              )}
            </div>
          )}

          {isProforma && !alreadyHasInvoice && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="font-semibold text-gray-900 mb-1">Convert to Sales Order</h2>
              <p className="text-xs text-gray-500 mb-3">Creates a SO from this proforma.</p>
              <button onClick={async () => {
                const res = await fetch('/api/orders/promote', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ order_id: id, target_type: 'so' }),
                })
                const data = await res.json()
                if (data.success) {
                  router.push('/orders/' + data.invoice.id)
                } else alert('Error: ' + data.error)
              }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
                <FileText className="h-4 w-4" /> Convert to SO
              </button>
            </div>
          )}

          {isSO && !alreadyHasInvoice && !order.is_foc && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="font-semibold text-gray-900 mb-1">Generate Invoice</h2>
              <p className="text-xs text-gray-500 mb-3">Creates INV linked to {order.order_number}.</p>
              <button onClick={handlePromote}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
                <FileText className="h-4 w-4" /> Generate Invoice
              </button>
            </div>
          )}

          {isSO && !order.is_foc && !alreadyHasFoc && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="font-semibold text-gray-900 mb-1">Create FOC Document</h2>
              <p className="text-xs text-gray-500 mb-3">Creates SO(DO) linked to {order.order_number}.</p>
              <button onClick={handleCreateFoc}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                <Package className="h-4 w-4" /> Create SO(DO)
              </button>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <h2 className="font-semibold text-gray-900">Order Info</h2>
            {isInt ? (
              [
                { label: 'From Warehouse',    value: order.warehouse },
                { label: 'To Warehouse',      value: order.warehouse_destination ?? '—' },
                { label: 'Order Date',        value: order.order_date ? new Date(order.order_date).toLocaleDateString() : '—' },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-gray-500">{label}</span>
                  <span className="font-medium text-gray-900">{value}</span>
                </div>
              ))
            ) : (
              [
                { label: 'Customer',      value: order.customer_name },
                { label: 'Warehouse',     value: order.warehouse },
                { label: 'Price List',    value: order.price_list },
                { label: 'Currency',      value: order.currency },
                { label: 'Incoterms',     value: order.incoterms },
                { label: 'Payment',       value: order.payment_terms },
                { label: 'Order Date',    value: order.order_date ? new Date(order.order_date).toLocaleDateString() : '—' },
                { label: 'Shipment Date', value: order.shipment_date ? new Date(order.shipment_date).toLocaleDateString() : '—' },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-gray-500">{label}</span>
                  <span className="font-medium text-gray-900">{value ?? '—'}</span>
                </div>
              ))
            )}
            {order.notes && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-1">Notes</p>
                <p className="text-sm text-gray-700">{order.notes}</p>
              </div>
            )}
          </div>

          {!isPO && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="font-semibold text-gray-900 mb-3">Change Status</h2>
              <div className="space-y-1">
                {statuses.map((s: any) => (
                  <button key={s.value} onClick={() => updateStatus(s.value)}
                    disabled={s.value === order.status}
                    className={'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ' + (s.value === order.status ? s.color + ' font-medium' : 'text-gray-600 hover:bg-gray-50')}>
                    <s.icon className="h-4 w-4" />
                    {s.label}
                    {s.value === order.status && <span className="ml-auto text-xs">Current</span>}
                  </button>
                ))}
              </div>
              {isInt && order.status !== 'stock_transferred' && (
                <p className="text-xs text-teal-600 mt-2 flex items-center gap-1">
                  <ArrowRight className="h-3 w-3" />
                  Set to "Stock Transferred" to move stock from {order.warehouse} → {order.warehouse_destination}
                </p>
              )}
            </div>
          )}

          {focOrder && (
            <div className="bg-green-50 rounded-xl border border-green-200 p-4">
              <h2 className="font-semibold text-green-800 mb-2">FOC Document</h2>
              <button onClick={() => router.push('/orders/' + focOrder.id)}
                className="text-sm text-green-700 font-mono hover:underline">
                {focOrder.order_number}
              </button>
              <p className="text-xs text-green-600 mt-1">{focOrder.total_packs} packs · {focOrder.total_units} units</p>
            </div>
          )}
        </div>

        <div className="col-span-2 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total Packs',  value: order.total_packs },
              { label: 'Total Units',  value: order.total_units },
              { label: 'Total Amount', value: isInt ? 'INT' : (order.is_foc || order.is_sample ? 'FOC' : order.currency + ' ' + Number(order.total_amount).toFixed(2)) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                <p className="text-2xl font-bold text-gray-900">{value}</p>
                <p className="text-xs text-gray-400 mt-1">{label}</p>
              </div>
            ))}
          </div>

          {!isInt && !isPO && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="font-semibold text-gray-900 mb-3">Document</h2>
              <InvoicePDF order={order} lines={commercialLines} customer={order.customer} appSettings={appSettings} />
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Lines</h2>
              {isInt && (
                <span className="text-xs text-teal-600 bg-teal-50 px-2 py-1 rounded font-medium">
                  {order.warehouse} → {order.warehouse_destination}
                </span>
              )}
              {sourceDoc && !isInt && <span className="text-xs text-gray-400">From {sourceDoc.order_number}</span>}
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Product</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-600">Packs</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-600">Units</th>
                  {!order.is_foc && !order.is_sample && !isInt && (
                    <>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Price/Unit</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-600">Total</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {commercialLines.map((line: any) => (
                  <tr key={line.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium">{line.product_name}</p>
                      <p className="text-xs text-gray-400 font-mono">{line.sku}</p>
                    </td>
                    <td className="px-3 py-3 text-center">{line.quantity_packs}</td>
                    <td className="px-3 py-3 text-center">{line.quantity_units}</td>
                    {!order.is_foc && !order.is_sample && !isInt && (
                      <>
                        <td className="px-3 py-3 text-right text-gray-600">{Number(line.price_per_unit).toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-medium">{Number(line.line_total).toFixed(2)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
              {!order.is_foc && !order.is_sample && !isInt && (
                <tfoot className="bg-gray-50 border-t border-gray-200">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-right font-semibold">Total</td>
                    <td className="px-4 py-3 text-right font-bold">
                      {order.currency} {Number(order.total_amount).toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {focOrder && (focOrder.lines ?? []).length > 0 && (
            <div className="bg-white rounded-xl border border-green-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-green-100 bg-green-50">
                <h2 className="font-semibold text-green-800">FOC Lines — {focOrder.order_number}</h2>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Product</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-600">Packs</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-600">Units</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {focOrder.lines.map((line: any) => (
                    <tr key={line.id}>
                      <td className="px-4 py-3">
                        <p className="font-medium">{line.product_name}</p>
                        <p className="text-xs text-gray-400 font-mono">{line.sku}</p>
                      </td>
                      <td className="px-3 py-3 text-center">{line.quantity_packs}</td>
                      <td className="px-3 py-3 text-center">{line.quantity_units}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}