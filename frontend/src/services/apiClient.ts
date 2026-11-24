const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000'
let csrfToken = ''

export function setCsrfToken(token: string) { csrfToken = token }
export function getCsrfToken() { return csrfToken }

export async function apiClient(path: string, options: RequestInit = {}) {
  const method = (options.method || 'GET').toUpperCase()
  const headers = new Headers(options.headers || {})
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) headers.set('X-CSRF-Token', csrfToken)

  const response = await fetch(`${apiUrl}${path}`, { ...options, method, headers, credentials: 'include' })
  const body = await response.json().catch(() => ({ success: false }))
  if (response.status === 401) {
    setCsrfToken('')
    window.dispatchEvent(new CustomEvent('restaurant:unauthorized'))
  }
  if (!response.ok) throw new Error(body.error?.message || 'Request failed')
  return body.data
}

export const getApiUrl = () => apiUrl
