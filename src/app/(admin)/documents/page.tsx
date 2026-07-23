'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/lib/i18n/LanguageProvider'
import { getSignedUrl } from '@/lib/documents'
import { Folder, FileText, Download, ChevronRight, ChevronDown, Search, Calendar, Upload, X } from 'lucide-react'
import ExportBundleModal from '@/components/documents/ExportBundleModal'

interface DocumentFile {
  id: string
  folder_name: string
  file_name: string
  file_path: string
  order_id: string
  document_type: string
  version: number
  file_size: number
  created_at: string
  lineageKey?: string
}

interface FolderData {
  folder_name: string
  file_count: number
  last_updated: string
  document_types: string[]
  files: DocumentFile[]
  hasCancelled: boolean
}

const DOC_TYPE_LABEL: Record<string, string> = {
  so: 'SO', invoice: 'Invoice', so_do: 'SO(DO)', external: 'External',
  po: 'PO', stock_inbound: 'Stock In', client_return: 'Return', stocktake_diff: 'Stocktake',
  transformation: 'Transformation',
}

const DOC_TYPE_COLOR: Record<string, string> = {
  so: '#1C4B3C', invoice: '#6A1E2A', so_do: '#2D4E8A', external: '#92400E',
  po: '#B45309', stock_inbound: '#0E7490', client_return: '#BE185D', stocktake_diff: '#A16207',
  transformation: '#4338CA',
}

function formatBytes(bytes: number): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// Groups a folder's files by document identity — lineageKey when available (see loadDocuments:
// it follows promoted_from across a cancel-and-reissue cycle, since that mints a brand new
// order_id for what users consider the same logical invoice/credit-note/SO(DO)), falling back to
// order_id, then the file name — and splits each group into its latest version (shown at top
// level) and older ones (archived).
function splitLatestAndArchive(files: DocumentFile[]): { latest: DocumentFile[]; archived: DocumentFile[] } {
  const groups: Record<string, DocumentFile[]> = {}
  for (const file of files) {
    const key = file.lineageKey ?? file.order_id ?? file.file_name.replace(/ V\d+\.pdf$/, '')
    if (!groups[key]) groups[key] = []
    groups[key].push(file)
  }
  const latest: DocumentFile[] = []
  const archived: DocumentFile[] = []
  for (const group of Object.values(groups)) {
    const sorted = [...group].sort((a, b) => b.version - a.version)
    latest.push(sorted[0])
    archived.push(...sorted.slice(1))
  }
  latest.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  archived.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  return { latest, archived }
}

export default function DocumentsPage() {
  const supabase = createClient()
  const t = useT()
  const [folders, setFolders] = useState<FolderData[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [expandedArchives, setExpandedArchives] = useState<Set<string>>(new Set())
  const [downloading, setDownloading] = useState<string | null>(null)
  const [uploadingFolder, setUploadingFolder] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadLabel, setUploadLabel] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingFolder, setPendingFolder] = useState<string | null>(null)

  useEffect(() => { loadDocuments() }, [])

  const loadDocuments = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('document_files')
      .select('*')
      .order('created_at', { ascending: false })

    if (error || !data) { setLoading(false); return }

    const folderMap: Record<string, FolderData> = {}
    for (const file of data) {
      if (!folderMap[file.folder_name]) {
        folderMap[file.folder_name] = {
          folder_name: file.folder_name,
          file_count: 0,
          last_updated: file.created_at,
          document_types: [],
          files: [],
          hasCancelled: false,
        }
      }
      const folder = folderMap[file.folder_name]
      folder.file_count++
      folder.files.push(file)
      if (!folder.document_types.includes(file.document_type)) {
        folder.document_types.push(file.document_type)
      }
      if (new Date(file.created_at) > new Date(folder.last_updated)) {
        folder.last_updated = file.created_at
      }
    }

    // Surface cancellation status on the folder — files themselves never disappear when a
    // SO/SO(DO)/Invoice/Return is cancelled, so this is the only place that shows it changed.
    const orderIds = Array.from(new Set(
      data.map((f: DocumentFile) => f.order_id).filter(Boolean)
    ))
    if (orderIds.length > 0) {
      const { data: orders } = await supabase
        .from('sales_orders')
        .select('id, status, document_type, promoted_from, linked_order_id')
        .in('id', orderIds)
      const statusMap: Record<string, string> = {}
      // Cancelling and reissuing an invoice/credit-note/SO(DO) mints a brand new sales_orders row
      // (new id) sharing the same promoted_from root — group those together so the reissued file
      // is recognized as superseding the cancelled one instead of showing up as its own "latest".
      const lineageKeyMap: Record<string, string> = {}
      for (const o of (orders ?? []) as any[]) {
        statusMap[o.id] = o.status
        lineageKeyMap[o.id] = o.promoted_from
          ? `${o.promoted_from}:${o.document_type}:${!!o.linked_order_id}`
          : o.id
      }
      for (const file of data as DocumentFile[]) {
        if (file.order_id) file.lineageKey = lineageKeyMap[file.order_id]
      }
      for (const folder of Object.values(folderMap)) {
        folder.hasCancelled = folder.files.some(f => statusMap[f.order_id] === 'cancelled')
      }
    }

    setFolders(Object.values(folderMap))
    setLoading(false)
  }

  const toggleFolder = (folderName: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(folderName)) next.delete(folderName)
      else next.add(folderName)
      return next
    })
  }

  const toggleArchive = (folderName: string) => {
    setExpandedArchives(prev => {
      const next = new Set(prev)
      if (next.has(folderName)) next.delete(folderName)
      else next.add(folderName)
      return next
    })
  }

  const handleDownload = async (file: DocumentFile) => {
    setDownloading(file.id)
    const win = window.open('', '_blank')
    if (!win) {
      // Most browsers silently drop this window.open when popups are blocked — with nothing
      // shown, a blocked click looks identical to a working one that's just slow, so the user
      // has no way to tell they need to allow popups instead of clicking again.
      alert('Download blocked by your browser\'s popup blocker. Please allow popups for this site and try again.')
      setDownloading(null)
      return
    }
    try {
      const url = await getSignedUrl(supabase, file.file_path)
      if (url) {
        win.location.href = url
      } else {
        win.close()
        alert('Could not generate a download link for this file. Please try again or contact support.')
      }
    } finally {
      setDownloading(null)
    }
  }

  const openUploadModal = (folderName: string) => {
    setPendingFolder(folderName)
    setUploadLabel('')
    setUploadingFolder(folderName)
  }

  const closeUploadModal = () => {
    setUploadingFolder(null)
    setPendingFolder(null)
    setUploadLabel('')
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !pendingFolder) return

    setUploading(true)
    try {
      const label = uploadLabel.trim() || file.name
      const safeName = label.replace(/[#\[\]*?/\\]/g, '_')
      const fileName = safeName.endsWith('.pdf') ? safeName : safeName
      const filePath = `${pendingFolder}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file, { contentType: file.type, upsert: true })

      if (uploadError) {
        alert('Upload error: ' + uploadError.message)
        return
      }

      await supabase.from('document_files').insert({
        folder_name: pendingFolder,
        file_name: fileName,
        file_path: filePath,
        order_id: null,
        document_type: 'external',
        version: 1,
        file_size: file.size,
      })

      closeUploadModal()
      await loadDocuments()
      setExpandedFolders(prev => new Set(prev).add(pendingFolder!))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const filtered = folders.filter(f =>
    f.folder_name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ maxWidth: '1100px' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#111827', marginBottom: '6px' }}>{t('documents.page_title')}</h1>
          <p style={{ fontSize: '14px', color: '#6B7280' }}>All generated PDFs — versioned on each save</p>
        </div>
        <ExportBundleModal />
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: t('documents.total_folders'), value: folders.length, icon: <Folder size={18} color="#1C4B3C" /> },
          { label: t('documents.total_files'), value: folders.reduce((s, f) => s + f.file_count, 0), icon: <FileText size={18} color="#6A1E2A" /> },
          { label: 'Last Activity', value: folders[0] ? formatDate(folders[0].last_updated).split(',')[0] : '—', icon: <Calendar size={18} color="#2D4E8A" /> },
        ].map((stat, i) => (
          <div key={i} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {stat.icon}
            </div>
            <div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#111827', lineHeight: 1 }}>{stat.value}</div>
              <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '3px' }}>{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '20px' }}>
        <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
        <input
          type="text"
          placeholder="Search folders..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', maxWidth: '400px', height: '40px', paddingLeft: '40px', paddingRight: '16px', borderRadius: '10px', border: '1px solid #E5E7EB', background: '#fff', fontSize: '14px', outline: 'none', color: '#111827' }}
        />
      </div>

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" style={{ display: 'none' }} onChange={handleFileUpload} />

      {/* Upload modal */}
      {uploadingFolder && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '28px', width: '440px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#111827', margin: 0 }}>{t('documents.add_external')}</h3>
                <p style={{ fontSize: '12px', color: '#6B7280', marginTop: '3px' }}>{uploadingFolder}</p>
              </div>
              <button onClick={closeUploadModal} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9CA3AF' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                {t('documents.file_label')}
              </label>
              <input
                type="text"
                placeholder="e.g. PO from Brands International 24-06-2026"
                value={uploadLabel}
                onChange={e => setUploadLabel(e.target.value)}
                style={{ width: '100%', height: '40px', borderRadius: '10px', border: '1px solid #E5E7EB', padding: '0 14px', fontSize: '14px', outline: 'none', color: '#111827', boxSizing: 'border-box' }}
              />
              <p style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '4px' }}>Leave empty to use the original filename</p>
            </div>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{ width: '100%', height: '44px', borderRadius: '10px', border: '2px dashed #E5E7EB', background: '#F9FAFB', cursor: uploading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', fontSize: '14px', fontWeight: 500, color: '#374151', transition: 'all 0.15s' }}
            >
              <Upload size={18} color="#6B7280" />
              {uploading ? t('common.uploading') : 'Choose file to upload'}
            </button>

            <p style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '10px', textAlign: 'center' }}>
              PDF, Word, Excel, or images accepted
            </p>
          </div>
        </div>
      )}

      {/* Folders list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#9CA3AF', fontSize: '14px' }}>{t('common.loading')}</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#9CA3AF', fontSize: '14px' }}>
          {search ? t('documents.no_folders') : t('documents.no_documents')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.map(folder => {
            const isExpanded = expandedFolders.has(folder.folder_name)
            return (
              <div key={folder.folder_name} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: '12px', overflow: 'hidden' }}>
                {/* Folder header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px' }}>
                  <div onClick={() => toggleFolder(folder.folder_name)} style={{ color: '#6B7280', flexShrink: 0, cursor: 'pointer' }}>
                    {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  </div>
                  <div onClick={() => toggleFolder(folder.folder_name)} style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0, cursor: 'pointer' }}>
                    <Folder size={20} color="#F59E0B" fill="#FEF3C7" style={{ flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {folder.folder_name}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '2px' }}>
                        {folder.file_count} file{folder.file_count !== 1 ? 's' : ''} · Last updated {formatDate(folder.last_updated)}
                      </div>
                    </div>
                  </div>

                  {/* Doc type badges */}
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    {folder.hasCancelled && (
                      <span style={{ padding: '2px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, color: '#B91C1C', background: '#FEE2E2' }}>
                        Cancelled
                      </span>
                    )}
                    {folder.document_types.map(dt => (
                      <span key={dt} style={{ padding: '2px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, color: '#fff', background: DOC_TYPE_COLOR[dt] ?? '#6B7280' }}>
                        {DOC_TYPE_LABEL[dt] ?? dt}
                      </span>
                    ))}
                  </div>

                  {/* Upload button */}
                  <button
                    onClick={e => { e.stopPropagation(); openUploadModal(folder.folder_name) }}
                    title="Add external document"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '8px', border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 500, color: '#374151', flexShrink: 0, transition: 'background 0.15s' }}
                  >
                    <Upload size={13} />
                    Add
                  </button>
                </div>

                {/* Files list */}
                {isExpanded && (() => {
                  const { latest, archived } = splitLatestAndArchive(folder.files)
                  const archiveExpanded = expandedArchives.has(folder.folder_name)
                  const FileRow = ({ file, dim, last }: { file: DocumentFile; dim?: boolean; last?: boolean }) => (
                    <div key={file.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: dim ? '10px 18px 10px 84px' : '10px 18px 10px 52px', borderBottom: last ? 'none' : '1px solid #F9FAFB', background: dim ? '#F9FAFB' : '#fff' }}>
                      <FileText size={16} color={dim ? '#D1D5DB' : (DOC_TYPE_COLOR[file.document_type] ?? '#6B7280')} style={{ flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: dim ? 400 : 500, color: dim ? '#9CA3AF' : '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {file.file_name}
                        </div>
                        <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '1px' }}>
                          {formatDate(file.created_at)} · {formatBytes(file.file_size)}
                        </div>
                      </div>
                      <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, color: dim ? '#9CA3AF' : (DOC_TYPE_COLOR[file.document_type] ?? '#6B7280'), background: dim ? '#F3F4F6' : '#F3F4F6', flexShrink: 0 }}>
                        {file.document_type === 'external' ? 'EXT' : `V${file.version}`}
                      </span>
                      <button
                        onClick={() => handleDownload(file)}
                        disabled={downloading === file.id}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #E5E7EB', background: downloading === file.id ? '#F3F4F6' : '#fff', cursor: downloading === file.id ? 'not-allowed' : 'pointer', flexShrink: 0 }}
                        title="Open"
                      >
                        <Download size={14} color={downloading === file.id ? '#9CA3AF' : '#374151'} />
                      </button>
                    </div>
                  )
                  return (
                    <div style={{ borderTop: '1px solid #F3F4F6' }}>
                      {latest.map((file, i) => (
                        <FileRow key={file.id} file={file} last={archived.length === 0 && i === latest.length - 1} />
                      ))}
                      {archived.length > 0 && (
                        <div>
                          <div onClick={() => toggleArchive(folder.folder_name)}
                            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 18px 10px 52px', cursor: 'pointer', background: '#FAFAFA', borderTop: '1px solid #F3F4F6' }}>
                            {archiveExpanded ? <ChevronDown size={14} color="#9CA3AF" /> : <ChevronRight size={14} color="#9CA3AF" />}
                            <Folder size={15} color="#D1D5DB" style={{ flexShrink: 0 }} />
                            <span style={{ fontSize: '12px', fontWeight: 500, color: '#9CA3AF' }}>
                              Archive · {archived.length} older version{archived.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          {archiveExpanded && archived.map((file, i) => (
                            <FileRow key={file.id} file={file} dim last={i === archived.length - 1} />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}