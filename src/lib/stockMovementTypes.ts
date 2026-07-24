// Movement types that INCREASE stock — everything else (out, transfer_out, *_reversed) decreases
// it. Shared between StockMovementsView and the Reorder Analysis stock-history reconstruction so
// the sign convention can't drift between the two.
export const INBOUND_MOVEMENT_TYPES = new Set(['in', 'stock_inbound', 'client_return_in', 'stocktake_in', 'transformation_in', 'transfer_in'])
