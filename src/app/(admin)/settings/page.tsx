'use client'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { Check, Globe } from 'lucide-react'
import { useState } from 'react'

const LANG_FLAGS: Record<string, string> = {
  fr: '🇫🇷', en: '🇬🇧', es: '🇪🇸', de: '🇩🇪', it: '🇮🇹', nl: '🇳🇱', pt: '🇵🇹',
}

export default function SettingsPage() {
  const { lang, setLang, languages } = useLanguage()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [pendingLang, setPendingLang] = useState<string | null>(null)

  const handleLangChange = async (code: string) => {
    if (code === lang) return
    setPendingLang(code)
    setSaving(true)
    setSaved(false)
    await setLang(code)
    setSaving(false)
    setSaved(true)
    setPendingLang(null)
    setTimeout(() => setSaved(false), 2000)
  }

  const displayLangs = languages.length > 0
    ? languages
    : [
        { code: 'fr', name: 'Français', is_default: true, is_active: true },
        { code: 'en', name: 'English',  is_default: false, is_active: true },
        { code: 'es', name: 'Español',  is_default: false, is_active: true },
        { code: 'de', name: 'Deutsch',  is_default: false, is_active: true },
      ]

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Paramètres</h1>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-1">
          <Globe className="h-4 w-4 text-gray-400" />
          <h2 className="font-semibold text-gray-900">Langue de l'interface</h2>
        </div>
        <p className="text-sm text-gray-400 mb-4">
          Choisissez la langue d'affichage du CRM. Ce choix est enregistré dans votre profil.
        </p>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {displayLangs.map(l => {
            const isSelected = l.code === lang
            const isPending = pendingLang === l.code
            return (
              <button
                key={l.code}
                onClick={() => handleLangChange(l.code)}
                disabled={saving}
                className={`flex items-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium transition-all ${
                  isSelected
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-200 text-gray-700 hover:border-gray-400 hover:bg-gray-50'
                } disabled:opacity-60`}
              >
                <span className="text-base">{LANG_FLAGS[l.code] ?? ''}</span>
                <span>{l.name}</span>
                {isSelected && !isPending && (
                  <Check className="h-3.5 w-3.5 ml-auto" />
                )}
              </button>
            )
          })}
        </div>

        {saved && (
          <p className="mt-3 text-sm text-green-600 flex items-center gap-1">
            <Check className="h-4 w-4" /> Langue mise à jour
          </p>
        )}
      </div>
    </div>
  )
}
