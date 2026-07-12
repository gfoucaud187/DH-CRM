'use client'
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Language, TranslationMap } from './types'

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

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

function cacheKey(lang: string) { return `cms_cache_${lang}` }
function cacheTsKey(lang: string) { return `cms_cache_${lang}_ts` }

function loadCache(lang: string): TranslationMap | null {
  try {
    const ts = localStorage.getItem(cacheTsKey(lang))
    if (!ts || Date.now() - Number(ts) > CACHE_TTL_MS) return null
    const raw = localStorage.getItem(cacheKey(lang))
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveCache(lang: string, map: TranslationMap) {
  try {
    localStorage.setItem(cacheKey(lang), JSON.stringify(map))
    localStorage.setItem(cacheTsKey(lang), String(Date.now()))
  } catch {}
}

function clearCache(lang?: string) {
  try {
    if (lang) {
      localStorage.removeItem(cacheKey(lang))
      localStorage.removeItem(cacheTsKey(lang))
    } else {
      // clear all cms caches
      const keys = Object.keys(localStorage).filter(k => k.startsWith('cms_cache_'))
      keys.forEach(k => localStorage.removeItem(k))
    }
  } catch {}
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const supabase = createClient()
  const [lang, setLangState] = useState('en')
  const [languages, setLanguages] = useState<Language[]>([])
  const [translations, setTranslations] = useState<TranslationMap>({})
  const [isLoading, setIsLoading] = useState(true)

  const loadTranslations = useCallback(async (targetLang: string) => {
    setIsLoading(true)
    const cached = loadCache(targetLang)
    if (cached) {
      setTranslations(cached)
      setIsLoading(false)
      return
    }
    try {
      const res = await fetch(`/api/cms/translations?lang=${targetLang}`)
      if (res.ok) {
        const map: TranslationMap = await res.json()
        saveCache(targetLang, map)
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
    clearCache(targetLang)
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
