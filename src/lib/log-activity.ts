import { createClient } from '@/lib/supabase/client'

export type LogAction =
  | 'login'
  | 'logout'
  | 'create_order'
  | 'update_order_status'
  | 'update_order'
  | 'cancel_order'
  | 'delete_order'
  | 'create_customer'
  | 'update_customer'
  | 'approve_po'
  | 'reject_po'
  | 'submit_profile_request'
  | 'approve_profile_request'
  | 'reject_profile_request'
  | 'promote_order'
  | 'create_purchase_order'
  | 'update_purchase_order'
  | 'update_purchase_order_status'
  | 'delete_purchase_order'

export type LogEntity = 'order' | 'customer' | 'profile_request' | 'auth' | 'purchase_order'

interface LogParams {
  action: LogAction
  entityType?: LogEntity
  entityId?: string
  entityRef?: string
  oldValue?: Record<string, any>
  newValue?: Record<string, any>
  metadata?: Record<string, any>
}

export async function logActivity(params: LogParams) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    await supabase.from('activity_log').insert({
      user_id: user.id,
      user_email: user.email,
      user_role: profile?.role ?? 'unknown',
      action: params.action,
      entity_type: params.entityType ?? null,
      entity_id: params.entityId ?? null,
      entity_ref: params.entityRef ?? null,
      old_value: params.oldValue ?? null,
      new_value: params.newValue ?? null,
      metadata: params.metadata ?? null,
    })
  } catch {
    // Logging should never break the app
  }
}