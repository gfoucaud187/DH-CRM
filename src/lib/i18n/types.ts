export type TranslationMap = Record<string, string>

export interface Language {
  code: string
  name: string
  is_default: boolean
  is_active: boolean
}

export interface CmsLabel {
  id: string
  namespace: string
  key: string
  description: string | null
}

export interface CmsLabelWithTranslation extends CmsLabel {
  translation: {
    value: string
    is_auto_translated: boolean
    updated_at: string
  } | null
}

export interface CmsTranslation {
  label_id: string
  lang_code: string
  value: string
  is_auto_translated: boolean
  updated_at: string
}
