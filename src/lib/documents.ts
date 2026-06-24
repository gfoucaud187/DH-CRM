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
  const year = new Date(so.created_at).getFullYear()
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
 * Récupère le prochain numéro de version pour un document
 */
export async function getNextVersion(
  supabase: any,
  orderId: string,
  documentType: string
): Promise<number> {
  const { data } = await supabase
    .from('document_files')
    .select('version')
    .eq('order_id', orderId)
    .eq('document_type', documentType)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data ? data.version + 1 : 1
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