/** Scoped API only. No browser collection, identify, or server visitor events. */
import type { StatsParams, StatsResponse, RealtimeParams, RealtimeResponse, HealthParams, HealthResponse, Envelope, EventsResponse, Funnel, FunnelDefinition, Payment } from './types.js'
export type * from './types.js'
export interface ServerOptions {
  endpoint: string
  product: string
  /** A server-held jk_ key; this value is never sent to the browser entry. */
  apiKey: string
}
export type APIResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: 'http_error' | 'network_error' | 'invalid_response'; body?: unknown; retryAfter?: string }
export interface RequestOptions { signal?: AbortSignal }
export interface ServerAnalytics {
  stats(params: StatsParams, options?: RequestOptions): Promise<APIResult<StatsResponse>>
  realtime(params?: RealtimeParams, options?: RequestOptions): Promise<APIResult<RealtimeResponse>>
  health(params?: HealthParams, options?: RequestOptions): Promise<APIResult<HealthResponse | Envelope>>
  events(options?: RequestOptions): Promise<APIResult<EventsResponse>>
  funnels(options?: RequestOptions): Promise<APIResult<Funnel[]>>
  createFunnel(funnel: FunnelDefinition, options?: RequestOptions): Promise<APIResult<Funnel>>
  updateFunnel(id: string, funnel: FunnelDefinition, options?: RequestOptions): Promise<APIResult<Funnel>>
  deleteFunnel(id: string, options?: RequestOptions): Promise<APIResult<null>>
  payment(payment: Payment, options?: RequestOptions): Promise<APIResult<null>>
}

/** No automatic retries. In particular, a lost createFunnel response is ambiguous. */
export function createClient(options: ServerOptions): ServerAnalytics {
  if (typeof window !== 'undefined') throw new TypeError('Jelto server credentials belong on the server')
  let endpoint: URL
  try { endpoint = new URL(options.endpoint) } catch { throw new TypeError('A Jelto API endpoint is required') }
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/' ||
    (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)))) {
    throw new TypeError('Jelto endpoint must be an HTTPS origin (HTTP loopback is allowed for development)')
  }
  if (!/^prd_[a-z0-9]{10}$/.test(options.product)) throw new TypeError('A public Jelto product key is required')
  if (!/^jk_[A-Za-z0-9_-]{43}$/.test(options.apiKey)) throw new TypeError('A server-held Jelto scoped API key is required')
  const product = options.product
  const key = options.apiKey
  const productPath = '/api/v1/products/' + encodeURIComponent(product)

  async function request<T>(path: string, method: string, query: Record<string, unknown> | undefined, body: unknown, opts?: RequestOptions): Promise<APIResult<T>> {
    const url = new URL(path, endpoint)
    for (const [name, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(name, name === 'filters' ? JSON.stringify(value) : Array.isArray(value) ? value.join(',') : String(value))
    }
    const headers: Record<string, string> = { Authorization: 'Bearer ' + key, Accept: 'application/json' }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    let response: Response
    try {
      response = await fetch(url.href, {
        method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer',
        signal: opts?.signal ?? AbortSignal.timeout(15000),
      })
    } catch { return { ok: false, status: 0, error: 'network_error' } }
    let data: unknown = null
    let invalid = false
    try {
      const text = await response.text()
      if (text) data = JSON.parse(text)
    } catch { invalid = true }
    if (!response.ok) {
      const retry = response.headers.get('Retry-After')
      return { ok: false, status: response.status, error: 'http_error', ...(!invalid && data !== null ? { body: data } : {}), ...(retry !== null ? { retryAfter: retry } : {}) }
    }
    if (invalid) return { ok: false, status: response.status, error: 'invalid_response' }
    return { ok: true, status: response.status, data: data as T }
  }
  return Object.freeze({
    stats: (params: StatsParams, opts?: RequestOptions) => request<StatsResponse>('/api/v1/stats', 'GET', { ...params, product }, undefined, opts),
    realtime: (params: RealtimeParams = {}, opts?: RequestOptions) => request<RealtimeResponse>('/api/v1/stats/realtime', 'GET', { ...params, product }, undefined, opts),
    health: (params: HealthParams = {}, opts?: RequestOptions) => request<HealthResponse | Envelope>('/api/v1/stats/health', 'GET', { ...params, product }, undefined, opts),
    events: (opts?: RequestOptions) => request<EventsResponse>(productPath + '/events', 'GET', undefined, undefined, opts),
    funnels: (opts?: RequestOptions) => request<Funnel[]>(productPath + '/funnels', 'GET', undefined, undefined, opts),
    createFunnel: (funnel: FunnelDefinition, opts?: RequestOptions) => request<Funnel>(productPath + '/funnels', 'POST', undefined, funnel, opts),
    updateFunnel: (id: string, funnel: FunnelDefinition, opts?: RequestOptions) => request<Funnel>(productPath + '/funnels/' + encodeURIComponent(id), 'PUT', undefined, funnel, opts),
    deleteFunnel: (id: string, opts?: RequestOptions) => request<null>(productPath + '/funnels/' + encodeURIComponent(id), 'DELETE', undefined, undefined, opts),
    payment: (payment: Payment, opts?: RequestOptions) => request<null>('/api/v1/payments', 'POST', undefined, payment, opts),
  })
}
