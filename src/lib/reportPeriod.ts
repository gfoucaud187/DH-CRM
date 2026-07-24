// Business rule: October, November and December 2025 are folded into January 2026 across every
// report, chart, and year-based cutoff in the app — the underlying activity for that transition
// quarter was all actually processed in 2026, so nothing should show up attributed to 2025
// anywhere in reporting.
const FOLD_YEAR = 2025
const FOLD_START_MONTH = 9 // October (0-indexed)
const FOLD_INTO_YEAR = 2026
const FOLD_INTO_MONTH = 0 // January

function isFoldedDate(d: Date): boolean {
  return d.getFullYear() === FOLD_YEAR && d.getMonth() >= FOLD_START_MONTH
}

// The (year, month) a date should be bucketed/reported under, after folding Oct-Dec 2025 into
// Jan 2026. `month` is 0-indexed, matching Date#getMonth().
export function reportPeriod(date: Date | string): { year: number; month: number } {
  const d = typeof date === 'string' ? new Date(date) : date
  if (isFoldedDate(d)) return { year: FOLD_INTO_YEAR, month: FOLD_INTO_MONTH }
  return { year: d.getFullYear(), month: d.getMonth() }
}

// Effective calendar year for year-based cutoffs (YTD, targets-by-year, "this year" dashboards).
export function reportYear(date: Date | string): number {
  return reportPeriod(date).year
}

// `${year}-${month}` bucket key for month-trend charts — collapses all of Oct/Nov/Dec 2025 and
// Jan 2026 into the single "2026-0" bucket.
export function reportMonthKey(date: Date | string): string {
  const { year, month } = reportPeriod(date)
  return `${year}-${month}`
}

// The actual DB-column cutoff to use when querying "everything for effective year X" — for the
// year the fold lands in, this reaches back to include the folded Q4 of the prior year; for any
// other year it's just Jan 1 of that year, same as before.
export function reportYearStart(year: number): string {
  if (year === FOLD_INTO_YEAR) return `${FOLD_YEAR}-${String(FOLD_START_MONTH + 1).padStart(2, '0')}-01`
  return `${year}-01-01`
}

// The actual DB-column cutoff for the END of effective year X — for FOLD_YEAR itself, this pulls
// back to Sep 30 instead of Dec 31, since Oct/Nov/Dec now belong to FOLD_INTO_YEAR's report
// instead. Without this, selecting FOLD_YEAR would double-count that quarter alongside whatever
// query already pulled it in as part of FOLD_INTO_YEAR.
export function reportYearEnd(year: number): string {
  if (year === FOLD_YEAR) {
    const lastDay = new Date(FOLD_YEAR, FOLD_START_MONTH, 0).getDate() // day before FOLD_START_MONTH
    return `${FOLD_YEAR}-${String(FOLD_START_MONTH).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  }
  return `${year}-12-31`
}

// Fractional months elapsed in the calendar year, for pacing a target/pro-rata against "how far
// into the year are we". The fold only changes which bucket a transaction's REVENUE lands in —
// annual targets are still ordinary 12-month targets, so pacing stays plain calendar time
// (Month 7 of 12 in July is still Month 7 of 12) regardless of which year is selected.
export function reportMonthsElapsed(now: Date = new Date()): number {
  return now.getMonth() + now.getDate() / 31
}

// The `n` most recent DISTINCT reporting periods ending at `from` (default: today), oldest
// first — for trailing-month trend charts. A naive "walk back n calendar months" loop would
// produce 4 separate slots for Oct/Nov/Dec 2025 + Jan 2026 that all carry the exact same
// (already-folded) totals; this instead keeps consuming raw calendar months until n DISTINCT
// folded periods have been collected, so that quarter collapses into the single Jan 2026 slot
// the fold is meant to produce instead of showing as duplicate/repeated bars.
export function trailingReportPeriods(n: number, from: Date = new Date()): { year: number; month: number }[] {
  const collected: { year: number; month: number }[] = []
  let lastKey: string | null = null
  const d = new Date(from.getFullYear(), from.getMonth(), 1)
  let safety = 0
  while (collected.length < n && safety < n + 12) {
    const p = reportPeriod(d)
    const key = `${p.year}-${p.month}`
    if (key !== lastKey) { collected.push(p); lastKey = key }
    d.setMonth(d.getMonth() - 1)
    safety++
  }
  return collected.reverse()
}
