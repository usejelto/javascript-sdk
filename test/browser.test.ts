import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { initialize } from '@jelto/analytics/browser'
import { initialize as defaultInitialize } from '@jelto/analytics'

const settings = { product: 'prd_8f3kq2m9x1', scriptUrl: 'https://jelto.example/jelto.js' }
class Script extends EventTarget {
  src = ''; async = true; nonce = ''; dataset: Record<string, string> = {}
}
function browser(t: { after(callback: () => void): void }) {
  const scripts: Script[] = []
  const host: Record<string, unknown> = {}
  const doc = { createElement: () => new Script(), querySelector: () => null, head: { append: (element: Script) => { scripts.push(element) } } }
  Object.defineProperty(globalThis, 'window', { value: host, configurable: true })
  Object.defineProperty(globalThis, 'document', { value: doc, configurable: true })
  t.after(() => { Reflect.deleteProperty(globalThis, 'window'); Reflect.deleteProperty(globalThis, 'document') })
  return { scripts, host, doc, load: () => { for (const script of scripts) script.dispatchEvent(new Event('load')) } }
}

test('browser and server imports do no DOM, storage or network work during SSR', async () => {
  const code = `for (const key of ['document','window','localStorage','sessionStorage']) Object.defineProperty(globalThis,key,{get(){throw Error('accessed '+key)}}); globalThis.fetch=()=>{throw Error('network')}; await import('@jelto/analytics'); await import('@jelto/analytics/browser'); await import('@jelto/analytics/server')`
  execFileSync(process.execPath, ['--input-type=module', '-e', code], { cwd: new URL('..', import.meta.url) })
  await assert.rejects(initialize(settings), /after mounting/)
  assert.equal(initialize, defaultInitialize)
})

test('identical initialization inserts one ordered tracker/helper set and conflicts fail', async t => {
  const { scripts, load } = browser(t)
  const options = { ...settings, nonce: 'csp-nonce', goals: true, domains: ['site.example', 'shop.example'], checkout: { memory: false, environment: 'test' as const, entryPages: [{ id: 'pricing', host: 'site.example', paths: ['/pricing/**'] }] } }
  const first = initialize(options)
  assert.equal(initialize({ ...options, product: settings.product }), first)
  await assert.rejects(initialize({ ...options, hash: true }), /different configuration/)
  assert.deepEqual(scripts.map(script => new URL(script.src).pathname), ['/jelto.crossdomain.js', '/jelto.js', '/jelto.goals.js', '/jelto.entry.js', '/jelto.checkout.js'])
  assert.ok(scripts.every(script => script.async === false && script.nonce === 'csp-nonce'))
  assert.deepEqual(scripts[0]!.dataset, { product: settings.product, domains: 'site.example,shop.example' })
  assert.deepEqual(scripts[3]!.dataset, { product: settings.product })
  assert.equal(scripts[4]!.dataset.paymentMemory, 'off')
  assert.deepEqual(JSON.parse(scripts[4]!.dataset.entryPages!), options.checkout.entryPages)
  load()
  const api = await first
  assert.equal((await initialize(options)), api)
  assert.deepEqual(api.checkoutMetadata(), {})
  assert.equal(api.context(), undefined)
})

test('methods delegate to the existing global dispatcher and follow a later checkout wrapper', async t => {
  const { scripts, host, load } = browser(t)
  const ready = initialize({ ...settings, scriptUrl: 'https://proxy.example/analytics/jelto.cookie.js', endpoint: 'https://proxy.example/v1/e', autoPageview: false, spa: false, hash: true, exclude: ['/private/**'], allowLocalhost: true, memory: true })
  const calls: unknown[][] = []
  host.jelto = (...args: unknown[]) => { calls.push(args); return args[0] === 'cohort' ? 'launch' : args[0] === 'context' ? { active: true, pageviewId: null, url: '' } : { cohort: 'launch', first: false } }
  load()
  const api = await ready
  api.pageview({ u: '/pricing' })
  api.track('signup', { plan: 'pro' }, { interactive: false })
  assert.equal(api.cohort(), 'launch')
  assert.deepEqual(api.context(), { active: true, pageviewId: null, url: '' })
  assert.deepEqual(api.attribution(), { cohort: 'launch', first: false })
  host.jelto = (...args: unknown[]) => { calls.push(['wrapped', ...args]) }
  host.jeltoCheckoutMetadata = () => ({ jelto_cohort: 'launch', jelto_entry_page: 'pricing' })
  api.payment({ session_id: 'cs_verified_return' })
  assert.deepEqual(api.checkoutMetadata(), { jelto_cohort: 'launch', jelto_entry_page: 'pricing' })
  assert.deepEqual(calls[0], ['pageview', { u: '/pricing' }])
  assert.deepEqual(calls[1], ['event', 'signup', { plan: 'pro' }, { interactive: false }])
  assert.deepEqual(calls.at(-1), ['wrapped', 'payment', { session_id: 'cs_verified_return' }])
  assert.deepEqual(scripts[0]!.dataset, { product: settings.product, endpoint: 'https://proxy.example/v1/e', autoPageview: 'off', spa: 'off', hash: '', exclude: '/private/**', allowLocalhost: '', memory: 'on' })
  assert.equal('identify' in api, false)
})

test('failed loading stays latched and existing installations never create a second collector', async t => {
  const { scripts, host } = browser(t)
  host.jelto = () => undefined
  await assert.rejects(initialize(settings), /already installed/)
  assert.equal(scripts.length, 0)
  delete host.jelto
  const ready = initialize(settings)
  scripts[0]!.dispatchEvent(new Event('error'))
  await assert.rejects(ready, /could not be loaded/)
  assert.equal(initialize(settings), ready)
  assert.equal(scripts.length, 1)
})
