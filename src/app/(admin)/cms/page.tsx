'use client'
import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, AlertCircle, Wand2, Plus, ChevronDown, Loader2, Globe } from 'lucide-react'
import { useLanguage, useT } from '@/lib/i18n/LanguageProvider'
import type { CmsLabelWithTranslation, Language } from '@/lib/i18n/types'

const LANG_FLAGS: Record<string, string> = {
  fr: '🇫🇷', en: '🇬🇧', es: '🇪🇸', de: '🇩🇪', it: '🇮🇹', nl: '🇳🇱', pt: '🇵🇹',
}

export default function CmsPage() {
  const { languages, invalidateCache } = useLanguage()
  const t = useT()
  const queryClient = useQueryClient()

  const [selectedLang, setSelectedLang] = useState('en')
  const [selectedNamespace, setSelectedNamespace] = useState<string>('common')
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [translating, setTranslating] = useState(false)
  const [translateResult, setTranslateResult] = useState<string | null>(null)
  const [newLabelForm, setNewLabelForm] = useState(false)
  const [newLabel, setNewLabel] = useState({ namespace: '', key: '', description: '' })

  // Fetch available labels for selected namespace + lang
  const { data: labels = [], isLoading, refetch } = useQuery<CmsLabelWithTranslation[]>({
    queryKey: ['cms-labels', selectedNamespace, selectedLang],
    queryFn: async () => {
      const res = await fetch(`/api/cms/labels?namespace=${selectedNamespace}&lang=${selectedLang}`)
      if (!res.ok) throw new Error('Failed to fetch labels')
      return res.json()
    },
    staleTime: 0,
  })

  // Fetch distinct namespaces
  const { data: allLabels = [] } = useQuery<CmsLabelWithTranslation[]>({
    queryKey: ['cms-all-labels'],
    queryFn: async () => {
      const res = await fetch('/api/cms/labels')
      if (!res.ok) throw new Error('Failed to fetch labels')
      return res.json()
    },
    staleTime: 30_000,
  })

  const namespaces = Array.from(new Set(allLabels.map(l => l.namespace))).sort()

  // Reset edit values when namespace/lang changes
  useEffect(() => {
    setEditValues({})
    setSavedIds(new Set())
  }, [selectedNamespace, selectedLang])

  const getValue = (label: CmsLabelWithTranslation) => {
    if (editValues[label.id] !== undefined) return editValues[label.id]
    return label.translation?.value ?? ''
  }

  const isDirty = (label: CmsLabelWithTranslation) => {
    return editValues[label.id] !== undefined && editValues[label.id] !== (label.translation?.value ?? '')
  }

  const saveTranslation = async (labelId: string) => {
    const value = editValues[labelId]
    if (value === undefined) return

    setSavingIds(s => new Set(s).add(labelId))
    try {
      const res = await fetch('/api/cms/translations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label_id: labelId, lang_code: selectedLang, value }),
      })
      if (res.ok) {
        setSavedIds(s => new Set(s).add(labelId))
        setEditValues(v => { const n = { ...v }; delete n[labelId]; return n })
        invalidateCache(selectedLang)
        refetch()
        setTimeout(() => setSavedIds(s => { const n = new Set(s); n.delete(labelId); return n }), 2000)
      }
    } finally {
      setSavingIds(s => { const n = new Set(s); n.delete(labelId); return n })
    }
  }

  const handleAutoTranslate = async () => {
    setTranslating(true)
    setTranslateResult(null)
    try {
      const res = await fetch('/api/cms/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ namespace: selectedNamespace, from_lang: 'en', to_lang: selectedLang }),
      })
      const data = await res.json()
      if (res.ok) {
        setTranslateResult(`${data.translated} ${t('cms.translated_result')}`)
        invalidateCache(selectedLang)
        refetch()
      } else {
        setTranslateResult(`Error: ${data.error}`)
      }
    } finally {
      setTranslating(false)
    }
  }

  const handleAddLabel = async () => {
    if (!newLabel.namespace || !newLabel.key) return
    const res = await fetch('/api/cms/labels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newLabel),
    })
    if (res.ok) {
      setNewLabelForm(false)
      setNewLabel({ namespace: '', key: '', description: '' })
      queryClient.invalidateQueries({ queryKey: ['cms-all-labels'] })
      if (newLabel.namespace === selectedNamespace) refetch()
    }
  }

  const activeLanguages: Language[] = languages.length > 0
    ? languages
    : [{ code: 'en', name: 'English', is_default: true, is_active: true }]

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Globe className="h-6 w-6 text-gray-400" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('cms.page_title')}</h1>
            <p className="text-sm text-gray-500">{allLabels.length} {t('cms.labels_count')}</p>
          </div>
        </div>
        <button
          onClick={() => setNewLabelForm(!newLabelForm)}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
        >
          <Plus className="h-4 w-4" /> {t('cms.new_label')}
        </button>
      </div>

      {/* New label form */}
      {newLabelForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
          <h2 className="font-semibold text-gray-900 mb-4 text-sm">{t('cms.new_label')}</h2>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div>
              <label className="text-xs text-gray-400">{t('cms.label_namespace')}</label>
              <input
                value={newLabel.namespace}
                onChange={e => setNewLabel(f => ({ ...f, namespace: e.target.value.toLowerCase() }))}
                placeholder="ex: common"
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400">{t('cms.label_key')}</label>
              <input
                value={newLabel.key}
                onChange={e => setNewLabel(f => ({ ...f, key: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                placeholder="ex: save_button"
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400">{t('cms.label_description')}</label>
              <input
                value={newLabel.description}
                onChange={e => setNewLabel(f => ({ ...f, description: e.target.value }))}
                placeholder="Usage context..."
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAddLabel}
              className="px-4 py-1.5 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-700">
              {t('cms.create')}
            </button>
            <button onClick={() => setNewLabelForm(false)}
              className="px-4 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-4 p-4 border-b border-gray-100">
          {/* Namespace selector */}
          <div className="relative">
            <select
              value={selectedNamespace}
              onChange={e => setSelectedNamespace(e.target.value)}
              className="h-9 pl-3 pr-8 rounded-lg border border-gray-200 text-sm focus:outline-none appearance-none bg-white font-medium"
            >
              {namespaces.map(ns => (
                <option key={ns} value={ns}>{ns}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-2.5 h-4 w-4 text-gray-400 pointer-events-none" />
          </div>

          {/* Language tabs */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {activeLanguages.map(l => (
              <button
                key={l.code}
                onClick={() => setSelectedLang(l.code)}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  selectedLang === l.code
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {LANG_FLAGS[l.code] ?? ''} {l.code.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* Auto-translate */}
          {selectedLang !== 'en' && (
            <button
              onClick={handleAutoTranslate}
              disabled={translating}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50"
            >
              {translating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {t('cms.auto_translate')} (EN → {selectedLang.toUpperCase()})
            </button>
          )}
        </div>

        {translateResult && (
          <div className="px-4 py-2 bg-violet-50 text-violet-700 text-sm border-b border-violet-100">
            {translateResult}
          </div>
        )}

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> {t('common.loading')}
          </div>
        ) : labels.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">
            {t('cms.no_labels')}: <strong>{selectedNamespace}</strong>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-xs font-medium text-gray-400 uppercase bg-gray-50">
                <th className="text-left px-4 py-3 w-40">{t('cms.col_key')}</th>
                <th className="text-left px-4 py-3 w-48 hidden md:table-cell">{t('cms.col_description')}</th>
                <th className="text-left px-4 py-3">{t('cms.col_translation')} ({selectedLang.toUpperCase()})</th>
                <th className="px-4 py-3 w-24 text-center">{t('cms.col_status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {labels.map(label => (
                <tr key={label.id} className={`hover:bg-gray-50 ${isDirty(label) ? 'bg-amber-50/50' : ''}`}>
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-xs text-gray-600">{label.key}</span>
                  </td>
                  <td className="px-4 py-2.5 hidden md:table-cell">
                    <span className="text-xs text-gray-400">{label.description ?? '—'}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      value={getValue(label)}
                      onChange={e => setEditValues(v => ({ ...v, [label.id]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') saveTranslation(label.id) }}
                      onBlur={() => { if (isDirty(label)) saveTranslation(label.id) }}
                      className="w-full h-8 rounded border border-transparent bg-transparent px-2 text-sm focus:outline-none focus:border-gray-300 focus:bg-white hover:border-gray-200 hover:bg-white transition-colors"
                      placeholder={t('cms.no_translation_placeholder')}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {savingIds.has(label.id) ? (
                      <Loader2 className="h-4 w-4 animate-spin text-gray-400 mx-auto" />
                    ) : savedIds.has(label.id) ? (
                      <Check className="h-4 w-4 text-green-500 mx-auto" />
                    ) : label.translation?.is_auto_translated ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 text-xs">
                        <Wand2 className="h-3 w-3" /> auto
                      </span>
                    ) : label.translation ? (
                      <Check className="h-4 w-4 text-gray-300 mx-auto" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-amber-400 mx-auto" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
