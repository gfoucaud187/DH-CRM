'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import { ArrowLeft, Package, Truck, CheckCircle, XCircle, FileText, Edit, Send, ArrowRight, CreditCard, Plus, Trash2 } from 'lucide-react'
import { warehouseLabel } from '@/lib/warehouse'
import Link from 'next/link'
import InvoicePDF from '@/components/pdf/InvoicePDF'
import ClientReturnPDF from '@/components/pdf/ClientReturnPDF'
import { logActivity } from '@/lib/log-activity'

function addDays(dateStr: string, days: number): Date {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d
}

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
  const params = useParams()
  const id = Array.isArray(params.id) ? params.id[0] : params.id
  const router = useRouter()
  const supabase = createClient()
  const queryClient = useQueryClient()

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('sales_orders')
        .select('*, lines:sales_order_lines(*), services:sales_order_services(*), customer:customers(legal_name, contacts, addresses, vat_number, track_trace_enabled)')
        .eq('id', id)
        .single()
      return data
    }
  })

  // Fetch product data for PDF enrichment
  const { data: productData = [] } = useQuery({
    queryKey: ['order-products', order?.lines?.map((l: any) => l.sku)],
    queryFn: async () => {
      if (!order?.lines?.length) return []
      const skus = order.lines.map((l: any) => l.sku).filter(Boolean)
      const { data } = await supabase
        .from('products')
        .select('sku, shape, wrapper, pack_type, units_per_pack, net_weight_g, length_inches, ring_gauge, vitola')
        .in('sku', skus)
      return data ?? []
    },
    enabled: !!order?.lines?.length,
  })

  // Enrich lines with product data
  const enrichedLines = (order?.lines ?? []).map((line: any) => {
    const product = (productData as any[]).find((p: any) => p.sku === line.sku) ?? {}
    return {
      ...line,
      shape:         line.shape         ?? product.shape,
      wrapper:       line.wrapper       ?? product.wrapper,
      pack_type:     line.pack_type     ?? product.pack_type,
      units_per_pack:line.units_per_pack?? product.units_per_pack,
      net_weight_g:  line.net_weight_g  ?? product.net_weight_g,
      length_inches: line.length_inches ?? product.length_inches,
      ring_gauge:    line.ring_gauge    ?? product.ring_gauge,
      vitola:        line.vitola        ?? product.vitola,
    }
  })

  const { data: focOrder } = useQuery({
    queryKey: ['order-foc', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('sales_orders')
        .select('*, lines:sales_order_lines(*)')
        .eq('promoted_from', id)
        .eq('is_foc', true)
        .maybeSingle()
      return data
    },
    enabled: !!id
  })

  // Fetch ALL SO(DO) linked to this SO (multiple allowed). Matched via promoted_from, not
  // linked_order_id — the latter gets overwritten to point at the SO(DO)'s own promoted
  // invoice once it's promoted, so it can't be used to find the SO(DO) from its parent SO.
  const { data: allFocOrders = [] } = useQuery({
    queryKey: ['order-all-foc', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('sales_orders')
        .select('id, order_number, status, document_type, is_foc, promoted_from, linked_order_id')
        .eq('promoted_from', id)
        .eq('is_foc', true)
        .order('created_at', { ascending: true })
      return data ?? []
    },
    enabled: !!id
  })

  // Fetch invoices generated from SO(DO) — their promoted_from points to the SO(DO)
  const { data: docInvoices = [] } = useQuery({
    queryKey: ['order-doc-invoices', id],
    queryFn: async () => {
      if (!id) return []
      // Get all DO invoices whose promoted_from is one of the SO(DO)s linked to this SO
      const { data: focs } = await supabase
        .from('sales_orders')
        .select('id')
        .eq('promoted_from', id)
        .eq('is_foc', true)
      if (!focs || focs.length === 0) return []
      const focIds = focs.map((f: any) => f.id)
      const { data: invs } = await supabase
        .from('sales_orders')
        .select('id, order_number, status, document_type, is_foc, promoted_from')
        .in('promoted_from', focIds)
        .eq('document_type', 'invoice')
      return invs ?? []
    },
    enabled: !!id
  })

  // Fetch client returns registered against this SO/Invoice
  const { data: clientReturns = [] } = useQuery({
    queryKey: ['order-client-returns', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('sales_orders')
        .select('id, order_number, total_amount, currency, created_at')
        .eq('promoted_from', id)
        .eq('document_type', 'client_return')
        .order('created_at', { ascending: true })
      return data ?? []
    },
    enabled: !!id
  })

  // All invoices generated from this SO (primary + any T&T "LINKED" price-difference invoice) —
  // needed to compute the SO's aggregate Paid / Partial / Pending Payment tag, since payment
  // tracking itself only lives on invoices (the SO is a logistics document, not a finance one).
  const { data: soInvoices = [] } = useQuery({
    queryKey: ['order-so-invoices', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('sales_orders')
        .select('id, order_number, total_amount, amount_received')
        .eq('promoted_from', id)
        .eq('document_type', 'invoice')
        .eq('is_foc', false)
      return data ?? []
    },
    enabled: !!id && order?.document_type === 'so' && !order?.is_foc
  })

  // Client returns registered against any invoice of this SO (returns can be registered from
  // either the SO or the invoice page) — netted into the SO's aggregate payment status below.
  const { data: soInvoiceReturns = [] } = useQuery({
    queryKey: ['order-so-invoice-returns', id, (soInvoices as any[]).map((i: any) => i.id).join(',')],
    queryFn: async () => {
      const invoiceIds = (soInvoices as any[]).map((i: any) => i.id)
      if (invoiceIds.length === 0) return []
      const { data } = await supabase
        .from('sales_orders')
        .select('id, total_amount, promoted_from')
        .in('promoted_from', invoiceIds)
        .eq('document_type', 'client_return')
      return data ?? []
    },
    enabled: (soInvoices as any[]).length > 0
  })

  // Invoice(s) promoted FROM this SO — an array, not a single row, because T&T orders can carry
  // a second "LINKED" invoice for the price difference (see promote/route.ts). Using
  // .maybeSingle() here used to throw when both existed, silently hiding both from the UI.
  const { data: linkedInvoices = [] } = useQuery({
    queryKey: ['order-linked-invoices', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('sales_orders')
        .select('id, order_number, document_type, status')
        .eq('promoted_from', id)
        .eq('document_type', 'invoice')
        .eq('is_foc', false)
        .order('created_at', { ascending: true })
      return data ?? []
    },
    enabled: !!id && !order?.is_foc
  })

  const { data: sourceDoc } = useQuery({
    queryKey: ['order-source', order?.promoted_from],
    queryFn: async () => {
      const { data } = await supabase
        .from('sales_orders')
        .select('id, order_number, document_type, status, warehouse, customer_name, created_at, is_foc, linked_order_id, promoted_from')
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

  const { data: payments = [] } = useQuery({
    queryKey: ['order-payments', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('payments')
        .select('*')
        .eq('sales_order_id', id)
        .order('payment_date', { ascending: false })
      return data ?? []
    },
    enabled: !!id
  })

  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentCurrency, setPaymentCurrency] = useState('')
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])
  const [paymentMethod, setPaymentMethod] = useState('')
  const [paymentReference, setPaymentReference] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')

  const openPaymentModal = () => {
    setPaymentAmount('')
    setPaymentCurrency(order?.currency ?? 'USD')
    setPaymentDate(new Date().toISOString().split('T')[0])
    setPaymentMethod('')
    setPaymentReference('')
    setPaymentNotes('')
    setShowPaymentModal(true)
  }

  const { mutate: recordPayment, isPending: recordingPayment } = useMutation({
    mutationFn: async () => {
      const amount = parseFloat(paymentAmount)
      if (!amount || amount <= 0) throw new Error('Enter a valid amount')
      const { error } = await supabase.from('payments').insert({
        sales_order_id: id,
        amount,
        currency: paymentCurrency || order?.currency || 'USD',
        payment_date: paymentDate,
        method: paymentMethod || null,
        reference: paymentReference || null,
        notes: paymentNotes || null,
      })
      if (error) throw error
      await logActivity({
        action: 'record_payment', entityType: 'order', entityId: id as string, entityRef: order?.order_number,
        metadata: { amount, currency: paymentCurrency || order?.currency, payment_date: paymentDate },
      })
    },
    onSuccess: () => {
      setShowPaymentModal(false)
      queryClient.invalidateQueries({ queryKey: ['order-payments', id] })
      queryClient.invalidateQueries({ queryKey: ['order', id] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (err: any) => alert('Error: ' + err.message)
  })

  const { mutate: deletePayment } = useMutation({
    mutationFn: async (paymentId: string) => {
      const payment = (payments as any[]).find(p => p.id === paymentId)
      const { error } = await supabase.from('payments').delete().eq('id', paymentId)
      if (error) throw error
      await logActivity({
        action: 'delete_payment', entityType: 'order', entityId: id as string, entityRef: order?.order_number,
        metadata: { amount: payment?.amount, currency: payment?.currency, payment_date: payment?.payment_date },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order-payments', id] })
      queryClient.invalidateQueries({ queryKey: ['order', id] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
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
      await logActivity({
        action: 'update_order_status',
        entityType: 'order',
        entityId: id as string,
        entityRef: order?.order_number,
        oldValue: { status: oldStatus },
        newValue: { status },
      })
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
    const res = await fetch('/api/orders/create_foc', {
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
      await logActivity({
        action: 'approve_po',
        entityType: 'order',
        entityId: id as string,
        entityRef: order?.order_number,
      })
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
    await logActivity({
      action: 'reject_po',
      entityType: 'order',
      entityId: id as string,
      entityRef: order?.order_number,
      metadata: { reason: comment },
    })
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
  const hasMixedWarehouses = !isInt && new Set(commercialLines.map((l: any) => l.warehouse ?? order.warehouse)).size > 1
  const alreadyHasInvoice = isSO && (linkedInvoices as any[]).length > 0
  const alreadyHasFoc = false // Multiple SO(DO) always allowed

  // SO-level payment tag — aggregated from its invoice(s), net of client returns. The SO itself
  // never records payments (that's a finance action on the invoice); this just reflects status.
  const soTotalInvoiced = (soInvoices as any[]).reduce((s: number, i: any) => s + Number(i.total_amount ?? 0), 0)
  const soTotalReceived = (soInvoices as any[]).reduce((s: number, i: any) => s + Number(i.amount_received ?? 0), 0)
  const soTotalReturned = (soInvoiceReturns as any[]).reduce((s: number, r: any) => s + Number(r.total_amount ?? 0), 0)
  const soNetOutstanding = soTotalInvoiced - soTotalReceived - soTotalReturned
  const soPaymentTag = (soInvoices as any[]).length === 0 ? null
    : soNetOutstanding <= 0.005 ? { label: 'Paid', color: 'bg-green-100 text-green-700' }
    : soTotalReceived > 0.005 ? { label: 'Partial Payment', color: 'bg-amber-100 text-amber-700' }
    : { label: 'Pending Payment', color: 'bg-red-100 text-red-600' }

  const getDocLabel = () => {
    if (order.document_type === 'client_return') return 'RETURN'
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
            {isSO && !order.is_foc && soPaymentTag && (
              <span className={'px-2 py-1 rounded-full text-xs font-medium ' + soPaymentTag.color}>{soPaymentTag.label}</span>
            )}
            {order.is_foc && <span className="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-700">FOC</span>}
            {order.is_sample && <span className="px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-700">SAMPLE</span>}
            {isPO && order.requires_stock_review && (
              <span className="px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-700">⚠ Stock review</span>
            )}
          </div>
          {isInt ? (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded">{warehouseLabel(order.warehouse)}</span>
              <ArrowRight className="h-4 w-4 text-teal-500" />
              <span className="text-sm font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded">{warehouseLabel(order.warehouse_destination) || '—'}</span>
              <span className="text-gray-400 text-sm ml-1">Internal transfer</span>
            </div>
          ) : (
            <p className="text-gray-500 text-sm mt-0.5">{order.customer_name} · {warehouseLabel(order.warehouse)}</p>
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
                  <span className="px-3 py-2 bg-white border border-teal-200 rounded-lg text-sm font-bold text-teal-800">{warehouseLabel(order.warehouse)}</span>
                </div>
                <ArrowRight className="h-6 w-6 text-teal-400" />
                <div className="text-center">
                  <p className="text-xs text-teal-600 mb-1">TO</p>
                  <span className="px-3 py-2 bg-white border border-teal-200 rounded-lg text-sm font-bold text-teal-800">{warehouseLabel(order.warehouse_destination) || '—'}</span>
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

          {(sourceDoc || (linkedInvoices as any[]).length > 0 || allFocOrders.length > 0 || clientReturns.length > 0) && (
            <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 space-y-2">
              <h2 className="font-semibold text-blue-800 text-sm">Linked Documents</h2>
              {sourceDoc && (
                <button onClick={() => router.push('/orders/' + sourceDoc.id)}
                  className="w-full text-left text-sm text-blue-700 hover:underline flex items-center gap-1">
                  <span className="text-blue-400">↑</span> From: {sourceDoc.order_number}
                </button>
              )}
              {(linkedInvoices as any[]).map((inv: any) => (
                <button key={inv.id} onClick={() => router.push('/orders/' + inv.id)}
                  className="w-full text-left text-sm text-blue-700 hover:underline flex items-center gap-1">
                  <span className="text-blue-400">→</span> {inv.order_number}
                </button>
              ))}
              {(clientReturns as any[]).map((ret: any) => (
                <button key={ret.id} onClick={() => router.push('/orders/' + ret.id)}
                  className="w-full text-left text-sm text-pink-700 hover:underline flex items-center gap-1">
                  <span className="text-pink-400">↩</span> {ret.order_number} ({ret.currency} {Number(ret.total_amount).toFixed(2)})
                </button>
              ))}
              {(allFocOrders as any[]).map((foc: any) => {
                const focInvoice = (docInvoices as any[]).find((inv: any) => inv.promoted_from === foc.id)
                return (
                  <div key={foc.id} className="pl-2 border-l-2 border-blue-200">
                    <button onClick={() => router.push('/orders/' + foc.id)}
                      className="w-full text-left text-sm text-blue-700 hover:underline flex items-center gap-1">
                      <span className="text-blue-400">→</span> {foc.order_number}
                    </button>
                    {focInvoice && (
                      <button onClick={() => router.push('/orders/' + focInvoice.id)}
                        className="w-full text-left text-sm text-blue-600 hover:underline flex items-center gap-1 pl-4">
                        <span className="text-blue-300">→</span> {focInvoice.order_number}
                      </button>
                    )}
                  </div>
                )
              })}
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

          {isSO && order.is_foc && !(docInvoices as any[]).find((inv: any) => inv.promoted_from === order.id) && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="font-semibold text-gray-900 mb-1">Generate Invoice (FOC)</h2>
              <p className="text-xs text-gray-500 mb-3">Creates INV(DO) with total 0 USD.</p>
              <button onClick={handlePromote}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium hover:bg-green-800 transition-colors">
                <FileText className="h-4 w-4" /> Generate Invoice (FOC)
              </button>
            </div>
          )}

          {isSO && !order.is_foc && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="font-semibold text-gray-900 mb-1">Create FOC Document</h2>
              <p className="text-xs text-gray-500 mb-3">Creates SO(DO) linked to {order.order_number}.</p>
              <button onClick={handleCreateFoc}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                <Package className="h-4 w-4" /> Create SO(DO)
              </button>
            </div>
          )}

          {(isSO || isInvoice) && !order.is_foc && !order.is_sample && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="font-semibold text-gray-900 mb-1">Register Return</h2>
              <p className="text-xs text-gray-500 mb-3">Credits stock and creates a Client Return linked to {order.order_number}.</p>
              <Link href={'/orders/' + id + '/return/new'}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                <Package className="h-4 w-4" /> Register Return
              </Link>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <h2 className="font-semibold text-gray-900">Order Info</h2>
            {isInt ? (
              [
                { label: 'From Warehouse',    value: warehouseLabel(order.warehouse) },
                { label: 'To Warehouse',      value: warehouseLabel(order.warehouse_destination) || '—' },
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
                { label: 'Warehouse',     value: warehouseLabel(order.warehouse) },
                { label: 'Price List',    value: order.price_list },
                { label: 'Currency',      value: order.currency },
                { label: 'Incoterms',     value: order.incoterms },
                { label: 'Payment',       value: order.payment_terms },
                { label: 'Order Date',    value: order.order_date ? new Date(order.order_date).toLocaleDateString() : '—' },
                ...((isSO || isInvoice) ? [
                  { label: 'Order Received',   value: order.order_received_date ? new Date(order.order_received_date).toLocaleDateString() : '—' },
                  { label: 'Shipment Date',    value: order.shipment_date ? new Date(order.shipment_date).toLocaleDateString() : '—' },
                  { label: 'Received by Client', value: order.client_received_date ? new Date(order.client_received_date).toLocaleDateString() : '—' },
                ] : [
                  { label: 'Shipment Date', value: order.shipment_date ? new Date(order.shipment_date).toLocaleDateString() : '—' },
                ]),
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

          {isInvoice && !order.is_foc && !order.is_sample && (() => {
            const amountReceived = Number(order.amount_received ?? 0)
            const totalAmount = Number(order.total_amount ?? 0)
            const totalReturned = (clientReturns as any[]).reduce((s: number, r: any) => s + Number(r.total_amount ?? 0), 0)
            const balance = totalAmount - amountReceived - totalReturned
            const isFullyPaid = balance <= 0.005
            const dueDate = (order.shipment_date && order.payment_terms_days != null)
              ? addDays(order.shipment_date, order.payment_terms_days) : null
            const today = new Date(); today.setHours(0, 0, 0, 0)
            const daysDiff = dueDate ? Math.round((today.getTime() - dueDate.getTime()) / 86400000) : null
            const dueStatus = isFullyPaid
              ? { label: 'Fully Paid', color: 'bg-green-100 text-green-700' }
              : dueDate == null
                ? { label: 'No due date set', color: 'bg-gray-100 text-gray-500' }
                : daysDiff! > 0
                  ? { label: `Overdue by ${daysDiff} day${daysDiff !== 1 ? 's' : ''}`, color: 'bg-red-100 text-red-600' }
                  : { label: `Due in ${-daysDiff!} day${-daysDiff! !== 1 ? 's' : ''}`, color: 'bg-amber-100 text-amber-700' }

            return (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-gray-900 flex items-center gap-2"><CreditCard className="h-4 w-4" /> Payments</h2>
                  <span className={'px-2 py-1 rounded-full text-xs font-medium ' + dueStatus.color}>{dueStatus.label}</span>
                </div>
                <div className="space-y-1 mb-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Total Amount</span>
                    <span className="font-medium text-gray-900">{order.currency} {totalAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Amount Received</span>
                    <span className="font-medium text-green-700">{order.currency} {amountReceived.toFixed(2)}</span>
                  </div>
                  {totalReturned > 0.005 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Client Returns</span>
                      <span className="font-medium text-pink-600">-{order.currency} {totalReturned.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Balance Due</span>
                    <span className={'font-semibold ' + (balance < 0 ? 'text-pink-600' : 'text-gray-900')}>
                      {balance < 0 ? '-' : ''}{order.currency} {Math.abs(balance).toFixed(2)}
                    </span>
                  </div>
                  {dueDate && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Payment Due Date</span>
                      <span className="font-medium text-gray-900">{dueDate.toLocaleDateString()}</span>
                    </div>
                  )}
                </div>

                {(payments as any[]).length > 0 && (
                  <div className="space-y-1 mb-3 pt-2 border-t border-gray-100">
                    {(payments as any[]).map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between text-xs py-1">
                        <div>
                          <span className="font-medium text-gray-700">{new Date(p.payment_date).toLocaleDateString()}</span>
                          <span className="text-gray-400 ml-2">{p.method || p.reference || ''}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{p.currency} {Number(p.amount).toFixed(2)}</span>
                          <button onClick={() => { if (confirm('Delete this payment?')) deletePayment(p.id) }}
                            className="text-gray-300 hover:text-red-500">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <button onClick={openPaymentModal}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                  <Plus className="h-4 w-4" /> Record Payment
                </button>
              </div>
            )
          })()}

          {!isPO && order.document_type !== 'client_return' && (
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
                  Set to "Stock Transferred" to move stock from {warehouseLabel(order.warehouse)} → {warehouseLabel(order.warehouse_destination)}
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

          {!isInt && !isPO && order.document_type !== 'client_return' && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="font-semibold text-gray-900 mb-3">Document</h2>
              <InvoicePDF order={order} lines={enrichedLines.filter((l: any) => l.line_type === 'commercial' || l.line_type === 'foc')} services={order.services ?? []} customer={order.customer} appSettings={appSettings} sourceDoc={sourceDoc} />
            </div>
          )}

          {order.document_type === 'client_return' && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="font-semibold text-gray-900 mb-3">Document</h2>
              <ClientReturnPDF order={order} lines={commercialLines} sourceDoc={sourceDoc} />
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Lines</h2>
              {isInt && (
                <span className="text-xs text-teal-600 bg-teal-50 px-2 py-1 rounded font-medium">
                  {warehouseLabel(order.warehouse)} → {warehouseLabel(order.warehouse_destination)}
                </span>
              )}
              {sourceDoc && !isInt && <span className="text-xs text-gray-400">From {sourceDoc.order_number}</span>}
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Product</th>
                  {hasMixedWarehouses && (
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Warehouse</th>
                  )}
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
                    {hasMixedWarehouses && (
                      <td className="px-3 py-3 text-gray-600">{warehouseLabel(line.warehouse ?? order.warehouse)}</td>
                    )}
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
                    <td colSpan={hasMixedWarehouses ? 5 : 4} className="px-4 py-3 text-right font-semibold">Total</td>
                    <td className="px-4 py-3 text-right font-bold">
                      {order.currency} {Number(order.total_amount).toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {(order.services ?? []).length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Additional Services</h2>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Type</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Description</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(order.services as any[]).map((s: any) => (
                    <tr key={s.id}>
                      <td className="px-4 py-3 capitalize text-gray-600">{s.service_type}</td>
                      <td className="px-3 py-3">{s.description}</td>
                      <td className="px-4 py-3 text-right font-medium">{s.currency} {Number(s.price).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

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

      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowPaymentModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h2 className="font-semibold text-gray-900 mb-4">Record Payment</h2>

            <label className="text-xs font-medium text-gray-500 uppercase">Amount</label>
            <div className="flex gap-2 mt-1 mb-3">
              <input type="number" step="0.01" min="0" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)}
                placeholder="0.00"
                className="flex-1 h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
              <input type="text" value={paymentCurrency} onChange={e => setPaymentCurrency(e.target.value)}
                className="w-20 h-9 rounded-md border border-gray-200 px-2 text-sm text-center focus:outline-none" />
            </div>

            <label className="text-xs font-medium text-gray-500 uppercase">Payment Date</label>
            <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)}
              className="mt-1 mb-3 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />

            <label className="text-xs font-medium text-gray-500 uppercase">Method (optional)</label>
            <input type="text" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
              placeholder="e.g. Wire transfer"
              className="mt-1 mb-3 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />

            <label className="text-xs font-medium text-gray-500 uppercase">Reference (optional)</label>
            <input type="text" value={paymentReference} onChange={e => setPaymentReference(e.target.value)}
              placeholder="Bank ref / transaction ID"
              className="mt-1 mb-3 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />

            <label className="text-xs font-medium text-gray-500 uppercase">Notes (optional)</label>
            <textarea value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} rows={2}
              className="mt-1 mb-4 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none resize-none" />

            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowPaymentModal(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={() => recordPayment()} disabled={recordingPayment}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50">
                {recordingPayment ? 'Saving...' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}