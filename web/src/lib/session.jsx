import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { get, post, store, onUnauthorized } from './api'

const SessionContext = createContext(null)
const THEME_KEY = 'forno.theme'

export function SessionProvider({ children }) {
  const [user, setUser] = useState(null)
  const [locations, setLocations] = useState([])
  const [locationId, setLocationIdState] = useState(store.locationId)
  const [booting, setBooting] = useState(true)
  const [theme, setThemeState] = useState(() => localStorage.getItem(THEME_KEY) || 'light')

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const setTheme = useCallback((next) => {
    localStorage.setItem(THEME_KEY, next)
    setThemeState(next)
  }, [])

  const signOut = useCallback(() => {
    store.token = null
    setUser(null)
    // The device binding survives sign-out on purpose: the terminal belongs to
    // its venue, so the next person only has to type the password.
  }, [])

  useEffect(() => {
    onUnauthorized.handler = signOut
    return () => {
      onUnauthorized.handler = null
    }
  }, [signOut])

  const loadLocations = useCallback(async (me) => {
    const list = await get('/locations')
    setLocations(list)
    setLocationIdState((current) => {
      const valid = current && list.some((l) => l.id === current)
      const next = valid ? current : me?.location_id || list[0]?.id || null
      store.locationId = next
      return next
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!store.token) {
        setBooting(false)
        return
      }
      try {
        const me = await get('/auth/me')
        if (cancelled) return
        setUser(me)
        await loadLocations(me)
      } catch {
        store.token = null
      } finally {
        if (!cancelled) setBooting(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadLocations])

  const signIn = useCallback(
    async (username, password) => {
      const res = await post('/auth/login', { username, password })
      store.token = res.token
      store.device = {
        username: res.user.username,
        display_name: res.user.display_name,
        role: res.user.role,
        location_id: res.user.location_id,
        location_name: res.user.location_name
      }
      store.locationId = res.user.location_id
      setLocationIdState(res.user.location_id)
      setUser(res.user)
      await loadLocations(res.user)
      return res.user
    },
    [loadLocations]
  )

  const setLocationId = useCallback((id) => {
    store.locationId = id
    setLocationIdState(id)
  }, [])

  const value = useMemo(() => {
    const location = locations.find((l) => l.id === locationId) || null
    return {
      user,
      booting,
      locations,
      locationId,
      location,
      setLocationId,
      signIn,
      signOut,
      device: store.device,
      forgetDevice: () => {
        store.device = null
      },
      isOwner: user?.role === 'owner',
      /** True while an admin is working in a venue that is not their own. */
      isAway: Boolean(user && user.location_id && locationId && user.location_id !== locationId),
      theme,
      setTheme
    }
  }, [user, booting, locations, locationId, setLocationId, signIn, signOut, theme, setTheme])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export const useSession = () => {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside SessionProvider')
  return ctx
}
