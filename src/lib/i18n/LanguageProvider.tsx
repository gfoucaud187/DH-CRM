'use client'
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Language, TranslationMap } from './types'

interface LanguageContextValue {
  lang: string
  setLang: (lang: string) => Promise<void>
  t: (key: string) => string
  languages: Language[]
  isLoading: boolean
  invalidateCache: (lang?: string) => void
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'en',
  setLang: async () => {},
  t: (key) => key,
  languages: [],
  isLoading: false,
  invalidateCache: () => {},
})

export function useLanguage() {
  return useContext(LanguageContext)
}

export function useT() {
  return useContext(LanguageContext).t
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const supabase = createClient()
  const [lang, setLangState] = useState('en')
  const [languages, setLanguages] = useState<Language[]>([])
  const [translations, setTranslations] = useState<TranslationMap>({})
  const [isLoading, setIsLoading] = useState(true)

  const loadTranslations = useCallback(async (targetLang: string) => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/cms/translations?lang=${targetLang}`, { cache: 'no-store' })
      if (res.ok) {
        const map: TranslationMap = await res.json()
        setTranslations(map)
      }
    } catch {}
    setIsLoading(false)
  }, [])

  useEffect(() => {
    async function init() {
      const { data: langs } = await supabase
        .from('languages')
        .select('*')
        .eq('is_active', true)
        .order('name')
      if (langs) setLanguages(langs)

      let userLang = 'en'
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('preferred_lang')
          .eq('id', user.id)
          .single()
        if (profile?.preferred_lang) userLang = profile.preferred_lang
      } else {
        userLang = (typeof window !== 'undefined' && localStorage.getItem('preferred_lang')) || 'en'
      }

      setLangState(userLang)
      await loadTranslations(userLang)
    }
    init()
  }, [])

  const setLang = useCallback(async (newLang: string) => {
    setLangState(newLang)
    if (typeof window !== 'undefined') {
      localStorage.setItem('preferred_lang', newLang)
    }
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase
        .from('user_profiles')
        .update({ preferred_lang: newLang })
        .eq('id', user.id)
    }
    await loadTranslations(newLang)
  }, [loadTranslations])

  const invalidateCache = useCallback((targetLang?: string) => {
    loadTranslations(targetLang ?? lang)
  }, [lang, loadTranslations])

  const t = useCallback((key: string): string => {
    return translations[key] ?? key
  }, [translations])

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, languages, isLoading, invalidateCache }}>
      {children}
    </LanguageContext.Provider>
  )
}
