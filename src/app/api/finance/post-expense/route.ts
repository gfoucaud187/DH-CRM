import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { EXPENSE_CATEGORY_ACCOUNTS, PAYMENT_CREDIT_ACCOUNTS } from '@/lib/finance/cpf'

export async function POST(request: NextRequest) {
  try {
    const { expenseId } = await request.json()
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { data: exp, error: fetchErr } = await supabase
      .from('expenses')
      .select('*')
      .eq('id', expenseId)
      .single()

    if (fetchErr || !exp) return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
    if (exp.status === 'posted') return NextResponse.json({ error: 'Already posted' }, { status: 400 })

    const amount = Number(exp.amount_sgd)
    const gst = Number(exp.gst_amount ?? 0)
    const expAccount = EXPENSE_CATEGORY_ACCOUNTS[exp.category] ?? { code: '6950', name: 'Miscellaneous Expenses' }
    const creditAccount = PAYMENT_CREDIT_ACCOUNTS[exp.payment_method ?? 'bank_transfer'] ?? { code: '1100', name: 'Cash at Bank - DBS Current' }

    // Build journal lines
    const lines: any[] = []
    const netAmount = amount - (exp.gst_claimable ? gst : 0)

    lines.push({ account_code: expAccount.code, account_name: expAccount.name, debit: netAmount, credit: 0, sort_order: 0 })
    if (gst > 0 && exp.gst_claimable) {
      lines.push({ account_code: '1210', account_name: 'GST Receivable (Input Tax)', debit: gst, credit: 0, sort_order: 1 })
    }
    lines.push({ account_code: creditAccount.code, account_name: creditAccount.name, debit: 0, credit: amount, sort_order: 2 })

    // Create journal entry
    const { data: je, error: jeErr } = await supabase
      .from('journal_entries')
      .insert({
        date: exp.date,
        description: `Expense: ${exp.vendor}${exp.description ? ' — ' + exp.description : ''}`,
        reference: exp.id,
        source_type: 'expense',
        source_id: exp.id,
        currency: 'SGD',
        status: 'posted',
        created_by: user?.id,
        posted_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (jeErr || !je) return NextResponse.json({ error: jeErr?.message ?? 'Journal entry creation failed' }, { status: 500 })

    // Insert lines
    const { error: linesErr } = await supabase
      .from('journal_lines')
      .insert(lines.map(l => ({ ...l, journal_entry_id: je.id })))

    if (linesErr) {
      await supabase.from('journal_entries').delete().eq('id', je.id)
      return NextResponse.json({ error: linesErr.message }, { status: 500 })
    }

    // Mark expense as posted
    await supabase.from('expenses').update({
      status: 'posted',
      journal_entry_id: je.id,
      updated_at: new Date().toISOString(),
    }).eq('id', exp.id)

    return NextResponse.json({ journalEntryId: je.id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
