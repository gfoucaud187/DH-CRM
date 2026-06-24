'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getSignedUrl } from '@/lib/documents'
import { Folder, FileText, Download, ChevronRight, ChevronDown, Search, Calendar, Package } from 'lucide-react'

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
}

interface Folder {
  folder_name: string
  file_count: number
  last_updated: string
  document_types: string[]
  files: DocumentFile[]
}

const DOC_TYPE_LABEL: Record<string, string> = {
  so: 'SO',
  invoice: 'Invoice',
  so_do: 'SO(DO)',
}

const DOC_TYPE_COLOR: Record<string, string> = {
  so:      '#1C4B3C',
  invoice: '#6A1E2A',
  so_do:   '#2D4E8A',
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

export default function DocumentsPage() {
  const supabase = createClient()
  const [folders, setFolders] = useState<Folder[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [downloading, setDownloading] = useState<string | null>(null)

  useEffect(() => {
    loadDocuments()
  }, [])

  const loadDocuments = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('document_files')
      .select('*')
      .order('created_at', { ascending: false })

    if (error || !data) { setLoading(false); return }

    // Group by folder
    const folderMap: Record<string, Folder> = {}
    for (const file of data) {
      if (!folderMap[file.folder_name]) {
        folderMap[file.folder_name] = {
          folder_name: file.folder_name,
          file_count: 0,
          last_updated: file.created_at,
          document_types: [],
          files: [],
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

  const handleDownload = async (file: DocumentFile) => {
    setDownloading(file.id)
    try {
      const url = await getSignedUrl(supabase, file.file_path)
      if (url) {
        window.open(url, '_blank')
      }
    } finally {
      setDownloading(null)
    }
  }

  const filtered = folders.filter(f =>
    f.folder_name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ maxWidth: '1100px' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#111827', marginBottom: '6px' }}>
          Documents
        </h1>
        <p style={{ fontSize: '14px', color: '#6B7280' }}>
          All generated PDFs — automatically versioned on each modification
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Total Folders', value: folders.length, icon: <Folder size={18} color="#1C4B3C" /> },
          { label: 'Total Files',   value: folders.reduce((s, f) => s + f.file_count, 0), icon: <FileText size={18} color="#6A1E2A" /> },
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
          style={{
            width: '100%',
            maxWidth: '400px',
            height: '40px',
            paddingLeft: '40px',
            paddingRight: '16px',
            borderRadius: '10px',
            border: '1px solid #E5E7EB',
            background: '#fff',
            fontSize: '14px',
            outline: 'none',
            color: '#111827',
          }}
        />
      </div>

      {/* Folders list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#9CA3AF', fontSize: '14px' }}>
          Loading documents…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#9CA3AF', fontSize: '14px' }}>
          {search ? 'No folders match your search.' : 'No documents yet. They will appear here automatically when orders are created.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.map(folder => {
            const isExpanded = expandedFolders.has(folder.folder_name)
            return (
              <div key={folder.folder_name} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: '12px', overflow: 'hidden' }}>
                {/* Folder header */}
                <div
                  onClick={() => toggleFolder(folder.folder_name)}
                  style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px', cursor: 'pointer', userSelect: 'none' }}
                >
                  <div style={{ color: '#6B7280', flexShrink: 0 }}>
                    {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  </div>
                  <Folder size={20} color="#F59E0B" fill="#FEF3C7" style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {folder.folder_name}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '2px' }}>
                      {folder.file_count} file{folder.file_count !== 1 ? 's' : ''} · Last updated {formatDate(folder.last_updated)}
                    </div>
                  </div>
                  {/* Doc type badges */}
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    {folder.document_types.map(dt => (
                      <span key={dt} style={{
                        padding: '2px 10px',
                        borderRadius: '999px',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#fff',
                        background: DOC_TYPE_COLOR[dt] ?? '#6B7280',
                      }}>
                        {DOC_TYPE_LABEL[dt] ?? dt}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Files list */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid #F3F4F6' }}>
                    {folder.files.map((file, i) => (
                      <div key={file.id} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '10px 18px 10px 52px',
                        borderBottom: i < folder.files.length - 1 ? '1px solid #F9FAFB' : 'none',
                        background: i % 2 === 0 ? '#FAFAFA' : '#fff',
                      }}>
                        <FileText size={16} color={DOC_TYPE_COLOR[file.document_type] ?? '#6B7280'} style={{ flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 500, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {file.file_name}
                          </div>
                          <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '1px' }}>
                            {formatDate(file.created_at)} · {formatBytes(file.file_size)}
                          </div>
                        </div>
                        {/* Version badge */}
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 600,
                          color: DOC_TYPE_COLOR[file.document_type] ?? '#6B7280',
                          background: '#F3F4F6',
                          flexShrink: 0,
                        }}>
                          V{file.version}
                        </span>
                        {/* Download */}
                        <button
                          onClick={() => handleDownload(file)}
                          disabled={downloading === file.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            border: '1px solid #E5E7EB',
                            background: downloading === file.id ? '#F3F4F6' : '#fff',
                            cursor: downloading === file.id ? 'not-allowed' : 'pointer',
                            flexShrink: 0,
                            transition: 'background 0.15s',
                          }}
                          title="Download"
                        >
                          <Download size={14} color={downloading === file.id ? '#9CA3AF' : '#374151'} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}