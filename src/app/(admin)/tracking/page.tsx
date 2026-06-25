'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Search, Filter, LogIn, LogOut, ShoppingCart, FileText, Users, CheckCircle, XCircle, ArrowRight, Edit, Send, Package, Trash2 } from 'lucide-react'

const ACTION_CONFIG: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  login:                        { label: 'Login',                   icon: LogIn,       color: 'text-blue-600',   bg: 'bg-blue-50' },
  logout:                       { label: 'Logout',                  icon: LogOut,      color: 'text-gray-500',   bg: 'bg-gray-50' },
  create_order:                 { label: 'Order created',           icon: ShoppingCart,color: 'text-green-600',  bg: 'bg-green-50' },
  update_order_status:          { label: 'Order status changed',    icon: ArrowRight,  color: 'text-amber-600',  bg: 'bg-amber-50' },
  update_order:                 { label: 'Order updated',           icon: Edit,        color: 'text-blue-600',   bg: 'bg-blue-50' },
  cancel_order:                 { label: 'Order cancelled',         icon: XCircle,     color: 'text-red-600',    bg: 'bg-red-50' },
  delete_order:                 { label: 'Order deleted',           icon: Trash2,      color: 'text-red-600',    bg: 'bg-red-50' },
  create_customer:              { label: 'Distributor created',     icon: Users,       color: 'text-green-600',  bg: 'bg-green-50' },
  update_customer:              { label: 'Distributor updated',     icon: Edit,        color: 'text-blue-600',   bg: 'bg-blue-50' },
  approve_po:                   { label: 'Portal PO approved → SO', icon: CheckCircle, color: 'text-green-600',  bg: 'bg-green-50' },
  reject_po:                    { label: 'Portal PO rejected',      icon: XCircle,     color: 'text-red-600',    bg: 'bg-red-50' },
  submit_profile_request:       { label: 'Profile change request',  icon: Send,        color: 'text-amber-600',  bg: 'bg-amber-50' },
  approve_profile_request:      { label: 'Profile request approved',icon: CheckCircle, color: 'text-green-600',  bg: 'bg-green-50' },
  reject_profile_request:       { label: 'Profile request rejected',icon: XCircle,     color: 'text-red-600',    bg: 'bg-red-50' },
  promote_order:                { label: 'Document promoted',       icon: FileText,    color: 'text-purple-600', bg: 'bg-purple-50' },
  create_purchase_order:        { label: 'Purchase order created',  icon: Package,     color: 'text-green-600',  bg: 'bg-green-50' },
  update_purchase_order:        { label: 'Purchase order updated',  icon: Edit,        color: 'text-blue-600',   bg: 'bg-blue-50' },
  update_purchase_order_status: { label: 'PO status changed',       icon: ArrowRight,  color: 'text-amber-600',  bg: 'bg-amber-50' },
  delete_purchase_order:        { label: 'Purchase order deleted',  icon: Trash2,      color: 'text-red-600',    bg: 'bg-red-50' },
}

const FILTER_GROUPS = [
  { label: 'All',          value: 'all' },
  { label: 'Auth',         value: 'auth' },
  { label: 'Orders',       value: 'orders' },
  { label: 'Purchases',    value: 'purchases' },
  { label: 'Distributors', value: 'customers' },
  { label: 'Profile',      value: 'profile' },
]

const ACTION_GROUPS: Record<string, string[]> = {
  auth:      ['login', 'logout'],
  orders:    ['create_order', 'update_order', 'update_order_status', 'cancel_order', 'delete_order', 'promote_order', 'approve_po', 'reject_po'],
  purchases: ['create_purchase_order', 'update_purchase_order', 'update_purchase_order_status', 'delete_purchase_order'],
  customers: ['create_customer', 'update_customer'],
  profile:   ['submit_profile_request', 'approve_profile_request', 'reject_profile_request'],
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (mins > 0) return `${mins}m ago`
  return 'just now'
}

export default function TrackingPage() {
  const supabase = createClient()
  const [search, setSearch] = useState('')
  const [filterGroup, setFilterGroup] = useState('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['activity-log'],
    queryFn: async () => {
      const { data } = await supabase
        .from('activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)
      return data ?? []
    },
    refetchInterval: 30000,
  })

  const filtered = logs.filter((l: any) => {
    const matchSearch = !search ||
      l.user_email?.toLowerCase().includes(search.toLowerCase()) ||
      l.entity_ref?.toLowerCase().includes(search.toLowerCase()) ||
      l.action?.toLowerCase().includes(search.toLowerCase())

    const matchGroup = filterGroup === 'all' ||
      (ACTION_GROUPS[filterGroup] ?? []).includes(l.action)

    return matchSearch && matchGroup
  })

  // Stats
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayLogs = logs.filter((l: any) => new Date(l.created_at) >= today)
  const uniqueUsers = new Set(logs.map((l: any) => l.user_id)).size
  const adminLogs = logs.filter((l: any) => l.user_role === 'admin').length
  const clientLogs = logs.filter((l: any) => l.user_role === 'client').length

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tracking Log</h1>
          <p className="text-gray-500 text-sm mt-0.5">Complete audit trail — who did what and when</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Events today',   value: todayLogs.length },
          { label: 'Active users',   value: uniqueUsers },
          { label: 'Admin actions',  value: adminLogs },
          { label: 'Client actions', value: clientLogs },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input type="text" placeholder="Search user, document, action..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-3 py-2 w-full border border-gray-200 rounded-lg text-sm focus:outline-none" />
        </div>
        <div className="flex gap-1.5">
          {FILTER_GROUPS.map(f => (
            <button key={f.value} onClick={() => setFilterGroup(f.value)}
              className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${filterGroup === f.value ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <Filter className="h-8 w-8 mb-2" />
            <p className="text-sm">No events found</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map((log: any) => {
              const cfg = ACTION_CONFIG[log.action] ?? { label: log.action, icon: FileText, color: 'text-gray-600', bg: 'bg-gray-50' }
              const Icon = cfg.icon
              const isExpanded = expandedId === log.id
              const hasDetail = log.old_value || log.new_value || log.metadata

              return (
                <div key={log.id}
                  className={`px-5 py-3 hover:bg-gray-50 transition-colors ${hasDetail ? 'cursor-pointer' : ''}`}
                  onClick={() => hasDetail && setExpandedId(isExpanded ? null : log.id)}>
                  <div className="flex items-center gap-4">
                    {/* Icon */}
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                      <Icon className={`h-4 w-4 ${cfg.color}`} />
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900 text-sm">{cfg.label}</span>
                        {log.entity_ref && (
                          <span className="text-xs font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                            {log.entity_ref}
                          </span>
                        )}
                        {/* Status change display */}
                        {(log.action === 'update_order_status' || log.action === 'update_purchase_order_status') && log.old_value?.status && log.new_value?.status && (
                          <div className="flex items-center gap-1 text-xs">
                            <span className="text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{log.old_value.status.replace(/_/g,' ')}</span>
                            <ArrowRight className="h-3 w-3 text-gray-400" />
                            <span className="text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded font-medium">{log.new_value.status.replace(/_/g,' ')}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-xs font-medium ${log.user_role === 'admin' ? 'text-blue-600' : 'text-green-600'}`}>
                          {log.user_email ?? 'Unknown'}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${log.user_role === 'admin' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`}>
                          {log.user_role}
                        </span>
                      </div>
                    </div>

                    {/* Time */}
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-gray-400">{timeAgo(log.created_at)}</p>
                      <p className="text-xs text-gray-300">{new Date(log.created_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>

                    {hasDetail && (
                      <span className="text-gray-300 text-xs">{isExpanded ? '▲' : '▼'}</span>
                    )}
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="mt-3 ml-12 p-3 bg-gray-50 rounded-lg text-xs space-y-2">
                      {log.old_value && log.new_value && log.action !== 'update_order_status' && log.action !== 'update_purchase_order_status' && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="font-medium text-gray-500 mb-1">Before</p>
                            {Object.keys(log.old_value).map(k => (
                              <div key={k} className="flex gap-2">
                                <span className="text-gray-400 font-medium">{k}:</span>
                                <span className="text-gray-600 line-through">{String(log.old_value[k])}</span>
                              </div>
                            ))}
                          </div>
                          <div>
                            <p className="font-medium text-gray-500 mb-1">After</p>
                            {Object.keys(log.new_value).map(k => (
                              <div key={k} className="flex gap-2">
                                <span className="text-gray-400 font-medium">{k}:</span>
                                <span className="text-gray-900 font-medium">{String(log.new_value[k])}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {log.metadata && (
                        <div>
                          <p className="font-medium text-gray-500 mb-1">Details</p>
                          {Object.entries(log.metadata).map(([k, v]) => (
                            <div key={k} className="flex gap-2">
                              <span className="text-gray-400 font-medium">{k}:</span>
                              <span className="text-gray-700">{String(v)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}