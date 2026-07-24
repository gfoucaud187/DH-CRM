'use client'

import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'

export default function SortableHeader<T extends string>({ label, col, sortCol, sortDir, onSort, align = 'right' }: {
  label: string; col: T; sortCol: T; sortDir: 'asc' | 'desc'; onSort: (col: T) => void; align?: 'left' | 'right'
}) {
  const active = sortCol === col
  const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <th className={`px-3 py-3 font-medium ${align === 'left' ? 'text-left px-4' : 'text-right'}`}>
      <button onClick={() => onSort(col)}
        className={`flex items-center gap-1 hover:text-gray-900 transition-colors ${align === 'left' ? '' : 'ml-auto'} ${active ? 'text-gray-900' : 'text-gray-600'}`}>
        {label}
        <Icon size={12} className={active ? 'text-gray-700' : 'text-gray-300'} />
      </button>
    </th>
  )
}
