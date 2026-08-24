const TOKEN_KEY = 'forno.token'
const LOCATION_KEY = 'forno.location'
/** Survives logout: the venue PC stays bound to its own account. */
const DEVICE_KEY = 'forno.device'

export const store = {
  get token() {
    return localStorage.getItem(TOKEN_KEY)
  },
  set token(v) {
    v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY)
  },
  get locationId() {
    const v = Number(localStorage.getItem(LOCATION_KEY))
    return Number.isFinite(v) && v > 0 ? v : null
  },
  set locationId(v) {
    v ? localStorage.setItem(LOCATION_KEY, String(v)) : localStorage.removeItem(LOCATION_KEY)
  },
  get device() {
    try {
      return JSON.parse(localStorage.getItem(DEVICE_KEY) || 'null')
    } catch {
      return null
    }
  },
  set device(v) {
    v ? localStorage.setItem(DEVICE_KEY, JSON.stringify(v)) : localStorage.removeItem(DEVICE_KEY)
  }
}

export class ApiError extends Error {
  constructor(status, payload) {
    super(payload?.error || `HTTP ${status}`)
    this.status = status
    this.payload = payload
    this.code = payload?.error
    this.conflict = payload?.conflict
  }
}

/** Fires when the token is rejected, so the shell can bounce back to login. */
export const onUnauthorized = { handler: null }

export async function api(path, { method = 'GET', body, locationId, signal } = {}) {
  const headers = { 'content-type': 'application/json' }
  if (store.token) headers.authorization = `Bearer ${store.token}`
  const lid = locationId ?? store.locationId
  if (lid) headers['x-location-id'] = String(lid)

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    signal,
    body: body === undefined ? undefined : JSON.stringify(body)
  })

  if (res.status === 401) {
    onUnauthorized.handler?.()
    throw new ApiError(401, { error: 'unauthorized' })
  }
  const text = await res.text()
  const payload = text ? JSON.parse(text) : null
  if (!res.ok) throw new ApiError(res.status, payload)
  return payload
}

export const get = (p, o) => api(p, o)
export const post = (p, body, o) => api(p, { ...o, method: 'POST', body })
export const patch = (p, body, o) => api(p, { ...o, method: 'PATCH', body })
export const put = (p, body, o) => api(p, { ...o, method: 'PUT', body })
export const del = (p, o) => api(p, { ...o, method: 'DELETE' })
