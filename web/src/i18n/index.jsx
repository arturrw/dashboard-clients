import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { dict, LANGUAGES } from './dictionary'

const LANG_KEY = 'forno.lang'
const I18nContext = createContext(null)

const detect = () => {
  const saved = localStorage.getItem(LANG_KEY)
  if (saved && dict[saved]) return saved
  const nav = navigator.language?.slice(0, 2)
  return dict[nav] ? nav : 'lv'
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(detect)

  const setLang = useCallback((next) => {
    localStorage.setItem(LANG_KEY, next)
    document.documentElement.lang = next
    setLangState(next)
  }, [])

  const value = useMemo(() => {
    const table = dict[lang] || {}
    const fallback = dict.en

    /** t('cal.moveBody', { from, to }) — English fills any untranslated key. */
    const t = (key, vars) => {
      let out = table[key] ?? fallback[key] ?? key
      if (vars) {
        for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v))
      }
      return out
    }

    const locale = lang === 'lv' ? 'lv-LV' : lang === 'ru' ? 'ru-RU' : 'en-GB'

    return { lang, setLang, t, locale, languages: LANGUAGES }
  }, [lang, setLang])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export const useI18n = () => {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider')
  return ctx
}

/** Picks the service name matching the active language, falling back to English. */
export const serviceName = (service, lang) =>
  (lang === 'lv' && service?.name_lv) || (lang === 'ru' && service?.name_ru) || service?.name_en || ''
