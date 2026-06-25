import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']

export async function POST(request: NextRequest) {
  try {
    const { year, month } = await request.json()
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { data: entries, error: fetchErr } = await supabase
      .from('payroll_entries')
      .select('*')
      .eq('period_year', year)
      .eq('period_month', month)
      .eq('status', 'draft')

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
    if (!entries || entries.length === 0) return NextResponse.json({ error: 'No draft entries found' }, { status: 400 })

    const totalGross = entries.reduce((s, e) => s + Number(e.gross_salary), 0)
    const totalCPFEmployee = entries.reduce((s, e) => s + Number(e.cpf_employee), 0)
    const totalCPFEmployer = entries.reduce((s, e) => s + Number(e.cpf_employer), 0)
    const totalNet = entries.reduce((s, e) => s + Number(e.net_salary), 0)
    const totalSDL = entries.reduce((s, e) => s + Number(e.sdl), 0)

    const periodLabel = `${MONTHS[month - 1]} ${year}`
    const lastDay = new Date(year, month, 0).toISOString().slice(0, 10)

    // Create one consolidated journal entry for the month
    const { data: je, error: jeErr } = await supabase
      .from('journal_entries')
      .insert({
        date: lastDay,
        description: `Payroll — ${periodLabel} (${entries.length} employees)`,
        source_type: 'payroll',
        currency: 'SGD',
        status: 'posted',
        created_by: user?.id,
        posted_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (jeErr || !je) return NextResponse.json({ error: jeErr?.message ?? 'Journal entry creation failed' }, { status: 500 })

    // Journal lines:
    // Dr 6100 Salaries (net salary)
    // Dr 6110 CPF Employer
    // Dr 6120 SDL
    // Cr 2210 CPF Payable (employee + employer)
    // Cr 2220 SDL Payable
    // Cr 1100 Cash at Bank (net salaries paid)
    const lines = [
      { account_code: '6100', account_name: 'Salaries', debit: totalNet, credit: 0, sort_order: 0, description: `Net salary — ${periodLabel}` },
      { account_code: '6110', account_name: 'CPF - Employer Contribution', debit: totalCPFEmployer, credit: 0, sort_order: 1, description: `Employer CPF — ${periodLabel}` },
      { account_code: '6120', account_name: 'SDL - Skills Development Levy', debit: totalSDL, credit: 0, sort_order: 2, description: `SDL — ${periodLabel}` },
      { account_code: '2210', account_name: 'CPF Payable', debit: 0, credit: totalCPFEmployee + totalCPFEmployer, sort_order: 3, description: `CPF to board — ${periodLabel}` },
      { account_code: '2220', account_name: 'SDL Payable', debit: 0, credit: totalSDL, sort_order: 4, description: `SDL to board — ${periodLabel}` },
      { account_code: '1100', account_name: 'Cash at Bank - DBS Current', debit: 0, credit: totalNet, sort_order: 5, description: `Net salary disbursement — ${periodLabel}` },
    ]

    const { error: linesErr } = await supabase
      .from('journal_lines')
      .insert(lines.map(l => ({ ...l, journal_entry_id: je.id })))

    if (linesErr) {
      await supabase.from('journal_entries').delete().eq('id', je.id)
      return NextResponse.json({ error: linesErr.message }, { status: 500 })
    }

    // Mark all entries as posted
    const { error: updateErr } = await supabase
      .from('payroll_entries')
      .update({ status: 'posted', journal_entry_id: je.id })
      .eq('period_year', year)
      .eq('period_month', month)
      .eq('status', 'draft')

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    return NextResponse.json({ journalEntryId: je.id, entriesPosted: entries.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
