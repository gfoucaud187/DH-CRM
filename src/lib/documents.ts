// src/lib/documents.ts
import { COUNTRIES } from '@/lib/countries'

/**
 * Convertit un nom de pays ou code ISO en code ISO 2 lettres
 */
export function toISO(countryInput: string): string {
  if (!countryInput) return ''
  const upper = countryInput.toUpperCase()
  const byCode = COUNTRIES.find(c => c.code === upper)
  if (byCode) return byCode.code
  const byName = COUNTRIES.find(c =>
    c.name.toLowerCase() === countryInput.toLowerCase()
  )
  return byName?.code ?? countryInput.slice(0, 2).toUpperCase()
}

function extractNumeric(orderNumber: string): string {
  const match = orderNumber.match(/(\d+)$/)
  return match ? match[1] : orderNumber
}

// Document numbers embed their own 2-digit year (e.g. "SO25-061", "PO26-014") — that's the
// year the folder should follow, not created_at (which is just when the row was inserted,
// and can be much later than the document's own year when re-entering historical records).
function extractYear(docNumber: string, fallbackDate: string): number {
  const match = docNumber.match(/(\d{2})-/)
  if (match) return 2000 + parseInt(match[1], 10)
  return new Date(fallbackDate).getFullYear()
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

/**
 * Supprime les accents d'une chaîne
 */
function removeAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * Sanitize un nom de dossier pour Supabase Storage
 * - Supprime les accents
 * - Remplace les caractères interdits : # [ ] * ? .
 */
function sanitizeFolder(s: string): string {
  return removeAccents(s)
    .replace(/[#\[\]*?.]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Sanitize un nom de fichier pour Supabase Storage
 * - Supprime les accents
 * - Remplace les caractères interdits : # [ ] * ? (garde le point pour l'extension)
 */
function sanitizeFile(s: string): string {
  return removeAccents(s)
    .replace(/[#\[\]*?]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Génère le nom du dossier pour un SO
 * Ex: "2026-061 to Eurotab France T1"
 */
export function getFolderName(so: {
  order_number: string
  customer_name: string
  warehouse: string
  created_at: string
}): string {
  if (!so || !so.order_number) return 'unknown'
  const year = extractYear(so.order_number, so.created_at)
  const num = extractNumeric(so.order_number)
  const customer = (so.customer_name ?? 'Unknown').trim()
  const warehouse = so.warehouse ?? ''
  return `${year}-${num} to ${customer} ${warehouse}`.trim()
}

/**
 * Génère le nom de fichier pour un SO ou SO(DO)
 * Ex: "20260623 - SO26-061 (T1) to Eurotab France V1.pdf"
 */
export function getSOFileName(so: {
  order_number: string
  customer_name: string
  warehouse: string
  created_at: string
}, version: number): string {
  const date = formatDate(so.created_at)
  const num = so.order_number
  const warehouse = so.warehouse ?? ''
  const customer = so.customer_name.trim()
  return `${date} - ${num} (${warehouse}) to ${customer} V${version}.pdf`
}

/**
 * Génère le nom de fichier pour une Invoice
 * Ex: "20260623 - INV26-039 to Alföld-Tabak Kft (SO26-060 Central) V1.pdf"
 */
export function getInvoiceFileName(invoice: {
  order_number: string
  customer_name: string
  created_at: string
}, sourceDoc: {
  order_number: string
  warehouse: string
}, version: number): string {
  const date = formatDate(invoice.created_at)
  const invNum = invoice.order_number
  const customer = invoice.customer_name.trim()
  const soNum = sourceDoc.order_number
  const warehouse = (sourceDoc.warehouse ?? '').trim()
  const warehousePart = warehouse ? ` ${warehouse}` : ''
  return `${date} - ${invNum} to ${customer} (${soNum}${warehousePart}) V${version}.pdf`
}

/**
 * Retourne le chemin Storage complet — dossier et fichier sanitizés
 */
export function getFilePath(folderName: string, fileName: string): string {
  return `${sanitizeFolder(folderName)}/${sanitizeFile(fileName)}`
}

/**
 * Stock Inbound — reçu de réception d'une commande fournisseur
 * Dossier distinct de celui des Orders (clients)
 */
export function getStockInboundFolderName(po: { po_number: string; partner_name: string; created_at: string }): string {
  const year = extractYear(po.po_number, po.created_at)
  return `${year}-${po.po_number} from ${po.partner_name}`.trim()
}

export function getStockInboundFileName(po: { po_number: string; partner_name: string }, version: number): string {
  const date = formatDate(new Date().toISOString())
  return `${date} - ${po.po_number} Stock Inbound from ${po.partner_name} V${version}.pdf`
}

/**
 * Purchase Order document — shares the Stock Inbound folder (same supplier shipment)
 */
export function getPurchaseOrderFileName(po: { po_number: string; partner_name: string }, version: number): string {
  const date = formatDate(new Date().toISOString())
  return `${date} - ${po.po_number} Purchase Order to ${po.partner_name} V${version}.pdf`
}

/**
 * Client Return — avoir/retour lié à un SO ou Invoice d'origine
 */
export function getClientReturnFolderName(ret: { order_number: string; customer_name: string; created_at: string }): string {
  const year = extractYear(ret.order_number, ret.created_at)
  const num = extractNumeric(ret.order_number)
  return `${year}-${num} return from ${ret.customer_name}`.trim()
}

export function getClientReturnFileName(ret: { order_number: string; customer_name: string; created_at: string }, version: number): string {
  const date = formatDate(ret.created_at)
  return `${date} - ${ret.order_number} Client Return from ${ret.customer_name} V${version}.pdf`
}

/**
 * Stocktake Difference — session de comptage physique
 */
export function getStocktakeFolderName(ev: { event_number: string; warehouse: string; created_at: string }): string {
  const year = extractYear(ev.event_number, ev.created_at)
  return `${year}-${ev.event_number} stocktake ${ev.warehouse}`.trim()
}

export function getStocktakeFileName(ev: { event_number: string; warehouse: string }, version: number): string {
  const date = formatDate(new Date().toISOString())
  return `${date} - ${ev.event_number} Stocktake Difference ${ev.warehouse} V${version}.pdf`
}

export function getTransformationFolderName(tr: { transformation_number: string; warehouse: string; created_at: string }): string {
  const year = extractYear(tr.transformation_number, tr.created_at)
  return `${year}-${tr.transformation_number} transformation ${tr.warehouse}`.trim()
}

export function getTransformationFileName(tr: { transformation_number: string; warehouse: string }, version: number): string {
  const date = formatDate(new Date().toISOString())
  return `${date} - ${tr.transformation_number} Transformation ${tr.warehouse} V${version}.pdf`
}

/**
 * Récupère le prochain numéro de version pour un document. Accepts either a single order id or
 * a whole lineage of ids — cancelling and reissuing an invoice/credit-note/SO(DO) mints a brand
 * new sales_orders row (new id) for what users consider the same logical document, so versioning
 * has to look across every id in that lineage or it silently restarts at V1 and orphans the prior
 * versions instead of continuing/superseding them. See getInvoiceVersionLineageIds.
 */
export async function getNextVersion(
  supabase: any,
  orderId: string | string[],
  documentType: string
): Promise<number> {
  const orderIds = Array.isArray(orderId) ? orderId : [orderId]
  const { data } = await supabase
    .from('document_files')
    .select('version')
    .in('order_id', orderIds)
    .eq('document_type', documentType)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data ? data.version + 1 : 1
}

/**
 * Sibling sales_orders ids sharing the same promoted_from root and the same "linked" shape as
 * `order` — i.e. every cancel-and-reissue cycle of the same logical invoice/credit-note/SO(DO).
 * Falls back to just [order.id] when there's no promoted_from (a plain root SO, which isn't known
 * to go through this new-id-per-reissue pattern).
 */
export async function getInvoiceVersionLineageIds(supabase: any, order: any): Promise<string[]> {
  if (!order.promoted_from) return [order.id]
  const isLinked = !!order.linked_order_id
  const { data } = await supabase
    .from('sales_orders')
    .select('id, linked_order_id')
    .eq('promoted_from', order.promoted_from)
    .eq('document_type', order.document_type)

  const siblings = ((data ?? []) as any[])
    .filter(s => !!s.linked_order_id === isLinked)
    .map(s => s.id)

  return siblings.length > 0 ? siblings : [order.id]
}

/**
 * Sauvegarde un PDF dans Supabase Storage et enregistre les métadonnées
 */
export async function saveDocumentVersion({
  supabase,
  pdfBlob,
  orderId,
  folderName,
  fileName,
  documentType,
}: {
  supabase: any
  pdfBlob: Blob
  orderId: string
  folderName: string
  fileName: string
  documentType: 'so' | 'invoice' | 'so_do'
}): Promise<{ success: boolean; error?: string; path?: string }> {
  try {
    const filePath = getFilePath(folderName, fileName)

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, pdfBlob, {
        contentType: 'application/pdf',
        upsert: false,
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return { success: false, error: uploadError.message }
    }

    const version = await getNextVersion(supabase, orderId, documentType)
    const { error: dbError } = await supabase
      .from('document_files')
      .insert({
        folder_name: folderName,
        file_name: fileName,
        file_path: filePath,
        order_id: orderId,
        document_type: documentType,
        version,
        file_size: pdfBlob.size,
      })

    if (dbError) {
      console.error('DB insert error:', dbError)
      return { success: false, error: dbError.message }
    }

    return { success: true, path: filePath }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

/**
 * Liste tous les fichiers d'un dossier
 */
export async function getFolderFiles(supabase: any, folderName: string) {
  const { data, error } = await supabase
    .from('document_files')
    .select('*')
    .eq('folder_name', folderName)
    .order('created_at', { ascending: false })

  return { data: data ?? [], error }
}

/**
 * Liste tous les dossiers groupés
 */
export async function getAllFolders(supabase: any) {
  const { data, error } = await supabase
    .from('document_files')
    .select('folder_name, document_type, created_at, version, file_name')
    .order('created_at', { ascending: false })

  if (!data) return { data: [], error }

  const folders: Record<string, {
    folder_name: string
    file_count: number
    last_updated: string
    document_types: string[]
  }> = {}

  for (const f of data) {
    if (!folders[f.folder_name]) {
      folders[f.folder_name] = {
        folder_name: f.folder_name,
        file_count: 0,
        last_updated: f.created_at,
        document_types: [],
      }
    }
    folders[f.folder_name].file_count++
    if (!folders[f.folder_name].document_types.includes(f.document_type)) {
      folders[f.folder_name].document_types.push(f.document_type)
    }
  }

  return { data: Object.values(folders), error }
}

/**
 * Génère une URL signée pour télécharger un fichier (1h)
 */
export async function getSignedUrl(supabase: any, filePath: string): Promise<string | null> {
  const { data } = await supabase.storage
    .from('documents')
    .createSignedUrl(filePath, 3600)

  return data?.signedUrl ?? null
}