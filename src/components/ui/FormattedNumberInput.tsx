'use client'

import { useState } from 'react'

// A plain <input type="number"> can never show thousand separators while staying editable —
// browsers reject any value string containing a comma as invalid and just blank the field. This
// renders as a text input instead: comma-formatted while blurred, raw digits while focused (so
// typing isn't fighting a comma jumping around under the cursor).
export default function FormattedNumberInput({
  value, onChange, className, placeholder = '0',
}: {
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
}) {
  const [focused, setFocused] = useState(false)
  const numeric = value.replace(/,/g, '')
  const display = focused ? numeric : (numeric ? Number(numeric).toLocaleString('en-US') : '')

  return (
    <input
      type="text"
      inputMode="decimal"
      value={display}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={e => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
      placeholder={placeholder}
      className={className}
    />
  )
}
