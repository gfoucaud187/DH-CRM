import * as XLSX from 'xlsx'

const EXCEL_EXTENSIONS = ['.xlsx', '.xls', '.csv']
const EXCEL_MEDIA_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
]

function isExcelFile(file: File): boolean {
  const name = file.name?.toLowerCase() ?? ''
  return EXCEL_EXTENSIONS.some(ext => name.endsWith(ext)) || EXCEL_MEDIA_TYPES.includes(file.type)
}

/**
 * Builds the Anthropic Messages API content block(s) for an uploaded file.
 * PDFs and images go through as document/image blocks (native vision/document support).
 * Excel/CSV files have no such native support — they're parsed to CSV text server-side
 * and sent as a plain text block instead, covering every sheet in the workbook.
 */
export async function buildFileContentBlocks(file: File): Promise<any[]> {
  const bytes = await file.arrayBuffer()

  if (isExcelFile(file)) {
    const workbook = XLSX.read(bytes, { type: 'array' })
    const csvParts = workbook.SheetNames.map(name => {
      const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name])
      return `Sheet: ${name}\n${csv}`
    })
    return [{ type: 'text', text: csvParts.join('\n\n') }]
  }

  const base64 = Buffer.from(bytes).toString('base64')
  const mediaType = file.type || 'application/pdf'
  const isPdf = mediaType === 'application/pdf'
  return [{
    type: isPdf ? 'document' : 'image',
    source: { type: 'base64', media_type: mediaType, data: base64 },
  }]
}
