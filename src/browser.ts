/** Importing this module is safe during SSR. Only initialize touches the DOM. */
export type Props = Record<string, string | number | boolean>
export interface PageContext { active: boolean; pageviewId: string | null; url: string }
export interface Attribution { cohort: string; first: boolean }
export interface CheckoutMetadata { jelto_cohort?: string; jelto_jt?: 'first'; jelto_entry_page?: string; jelto_pageview?: string }
export interface EntryPageGroup { id: string; host: string; paths: string[] }
export interface PaymentClaim {
  session_id?: string; order_id?: string; checkout_id?: string
  /** Populating this transmits the end user's email address from the browser to Jelto's attribution endpoint. */
  email?: string
  provider?: 'stripe' | 'lemon_squeezy' | 'polar'; environment?: 'live' | 'test'
}
export interface BrowserOptions {
  product: string
  /** Exact hosted or managed-proxy URL ending in jelto.js or jelto.cookie.js. */
  scriptUrl: string
  endpoint?: string
  autoPageview?: boolean
  spa?: boolean
  hash?: boolean
  exclude?: string[]
  fileTypes?: string[]
  allowLocalhost?: boolean
  /** Optional first-touch memory; separate from choosing the cookie bundle. */
  memory?: boolean
  /** Loads explicit form and visibility goals. Tagged clicks are in the core. */
  goals?: boolean
  /** Registered hosts only. The server independently enforces this list. */
  domains?: string[]
  checkout?: { memory?: boolean; environment?: 'live' | 'test'; entryPages?: EntryPageGroup[] }
  /** Applied to every loaded script for nonce-based CSP. */
  nonce?: string
}
export interface BrowserAnalytics {
  pageview(options?: { u?: string; r?: string }): void
  track(name: string, props?: Props, options?: { interactive?: boolean }): void
  cohort(): string | undefined
  attribution(): Attribution | undefined
  context(): PageContext | undefined
  checkoutMetadata(): CheckoutMetadata
  payment(claim: PaymentClaim): void
}
type API = (command: string, ...args: unknown[]) => unknown
type TrackerWindow = Window & { jelto?: API; jeltoCheckoutMetadata?: () => CheckoutMetadata }
type Installation = { key: string; ready: Promise<BrowserAnalytics> }
const installations = new WeakMap<Document, Installation>()

function sourceURL(value: string): URL {
  let url: URL
  try { url = new URL(value) } catch { throw new TypeError('Jelto scriptUrl must be an absolute HTTP(S) URL') }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash || !/\/jelto(?:\.cookie)?\.js$/.test(url.pathname)) {
    throw new TypeError('Jelto scriptUrl must end in jelto.js or jelto.cookie.js without credentials, query or fragment')
  }
  return url
}

function configuration(options: BrowserOptions): { url: URL; attrs: Record<string, string>; key: string } {
  if (!/^prd_[a-z0-9]{10}$/.test(options.product)) throw new TypeError('A public Jelto product key is required')
  const url = sourceURL(options.scriptUrl)
  const attrs: Record<string, string> = { product: options.product }
  if (options.endpoint !== undefined) attrs.endpoint = options.endpoint
  if (options.autoPageview === false) attrs.autoPageview = 'off'
  if (options.spa === false) attrs.spa = 'off'
  if (options.hash) attrs.hash = ''
  if (options.exclude !== undefined) attrs.exclude = options.exclude.join(',')
  if (options.fileTypes !== undefined) attrs.fileTypes = options.fileTypes.join(',')
  if (options.allowLocalhost) attrs.allowLocalhost = ''
  if (options.memory) attrs.memory = 'on'
  // Construct every field in a stable order; object insertion order supplied by
  // callers must not make an otherwise identical initialization conflict.
  const groups = options.checkout?.entryPages?.map(group => [group.id, group.host, group.paths]) ?? []
  const key = JSON.stringify([url.href, attrs, !!options.goals, options.domains ?? [],
    !!options.checkout, options.checkout?.memory !== false, options.checkout?.environment ?? 'live', groups, options.nonce ?? ''])
  return { url, attrs, key }
}

/**
 * Use instead of an HTML tracker tag. One document can initialize once; repeated
 * identical calls share the same promise and never insert another collector.
 * The existing snippet remains responsible for exclusions, privacy and transport.
 */
export function initialize(options: BrowserOptions): Promise<BrowserAnalytics> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.reject(new TypeError('Initialize Jelto in the browser after mounting'))
  // Every failure path rejects the returned promise; a bad product or
  // scriptUrl must not throw synchronously out of an async caller's await.
  let parsed: { url: URL; attrs: Record<string, string>; key: string }
  try { parsed = configuration(options) } catch (error) { return Promise.reject(error) }
  const { url, attrs, key } = parsed
  const previous = installations.get(document)
  if (previous) {
    if (previous.key !== key) return Promise.reject(new TypeError('Jelto was initialized with different configuration'))
    return previous.ready
  }
  if (document.querySelector('script[data-product][src$="jelto.js"],script[data-product][src$="jelto.cookie.js"]') || typeof (window as TrackerWindow).jelto === 'function') {
    return Promise.reject(new TypeError('Jelto is already installed; use one installation method per document'))
  }

  const scripts: HTMLScriptElement[] = []
  const loads: Promise<void>[] = []
  const script = (name: string, data: Record<string, string>) => {
    const element = document.createElement('script')
    element.src = new URL(name, url).href
    // Classic dynamic scripts with async=false execute in insertion order.
    element.async = false
    if (options.nonce) element.nonce = options.nonce
    for (const [name, value] of Object.entries(data)) element.dataset[name] = value
    loads.push(new Promise<void>((resolve, reject) => {
      element.addEventListener('load', () => resolve(), { once: true })
      element.addEventListener('error', () => reject(new Error('A Jelto script could not be loaded')), { once: true })
    }))
    scripts.push(element)
  }
  if (options.domains?.length) script('jelto.crossdomain.js', { product: options.product, domains: options.domains.join(',') })
  script(url.pathname.split('/').at(-1)!, attrs)
  if (options.goals) script('jelto.goals.js', {})
  if (options.checkout?.entryPages?.length) script('jelto.entry.js', { product: options.product })
  if (options.checkout) {
    const data: Record<string, string> = { environment: options.checkout.environment ?? 'live' }
    if (options.checkout.memory === false) data.paymentMemory = 'off'
    if (options.checkout.entryPages) data.entryPages = JSON.stringify(options.checkout.entryPages.map(({ id, host, paths }) => ({ id, host, paths })))
    script('jelto.checkout.js', data)
  }
  const host = window as TrackerWindow
  const call: API = (command, ...args) => host.jelto?.(command, ...args)
  const ready = Promise.all(loads).then((): BrowserAnalytics => Object.freeze({
    pageview: (value?: { u?: string; r?: string }) => { call('pageview', value) },
    track: (name: string, props?: Props, eventOptions?: { interactive?: boolean }) => { call('event', name, props, eventOptions) },
    cohort: () => call('cohort') as string | undefined,
    attribution: () => call('attribution') as Attribution | undefined,
    context: () => call('context') as PageContext | undefined,
    checkoutMetadata: () => host.jeltoCheckoutMetadata?.() ?? {},
    payment: (claim: PaymentClaim) => { call('payment', claim) },
  }))
  // Keep a failed initialization latched: retrying a partly loaded core would
  // risk duplicate pageviews/listeners. The caller can reload to try again.
  installations.set(document, { key, ready })
  for (const element of scripts) document.head.append(element)
  return ready
}
