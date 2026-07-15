// "Aged" stays the DB/data key (warehouse enum value, packs_aged/units_aged columns) —
// only the on-screen label changes.
export const WAREHOUSE_LABELS: Record<string, string> = {
  Aged: 'Central Ageing',
}

export const warehouseLabel = (w?: string | null): string => {
  if (!w) return w ?? ''
  return WAREHOUSE_LABELS[w] ?? w
}
