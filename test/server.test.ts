import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createClient } from '@jelto/analytics/server'

const settings = { endpoint: 'https://jelto.example', product: 'prd_8f3kq2m9x1', apiKey: 'jk_' + 'a'.repeat(43) }

test('scoped reads preserve envelopes, ranges and membership filters without filling values', async t => {
  const old = globalThis.fetch
  const requests: { url: URL; init: RequestInit }[] = []
  const body = { metric: 'visitors', range: { from: '2026-08-01', to: '2026-08-31', tz: 'Europe/Istanbul', reference_day: '2026-08-31' }, total: { state: 'below_floor' }, rows: [{ key: '/secret', label: '/secret', value: { state: 'withheld', reason: 'privacy_floor' } }] }
  globalThis.fetch = async (input, init) => { requests.push({ url: new URL(String(input)), init: init! }); return Response.json(body) }
  t.after(() => { globalThis.fetch = old })
  const client = createClient(settings)
  const filters = [{ op: 'has_done' as const, event: { name: 'signup', filters: [{ dim: 'prop:plan', op: 'in' as const, vals: ['pro', 'team'] }] } }]
  const result = await client.stats({ from_at: '2026-08-01T10:00:00Z', until_at: '2026-08-01T11:00:00Z', metric: 'visitors', filters, companions: ['pageviews'], include_imported: false })
  assert.deepEqual(result, { ok: true, status: 200, data: body })
  assert.deepEqual(JSON.parse(requests[0]!.url.searchParams.get('filters')!), filters)
  assert.equal(requests[0]!.url.searchParams.get('from_at'), '2026-08-01T10:00:00Z')
  assert.equal(requests[0]!.url.searchParams.has('from'), false)
  assert.equal(requests[0]!.url.searchParams.get('include_imported'), 'false')
  assert.equal(requests[0]!.url.searchParams.get('companions'), 'pageviews')
  assert.equal(requests[0]!.url.searchParams.get('product'), settings.product)
  assert.equal(requests[0]!.init.credentials, 'omit')
  assert.equal(requests[0]!.init.redirect, 'error')
  assert.equal(requests[0]!.init.referrerPolicy, 'no-referrer')
  assert.equal(new Headers(requests[0]!.init.headers).get('authorization'), 'Bearer ' + settings.apiKey)
  assert.equal('value' in (result as { data: typeof body }).data.total, false)
})

test('every helper targets only the existing endpoint and method', async t => {
  const old = globalThis.fetch
  const calls: { path: string; method: string }[] = []
  globalThis.fetch = async (input, init) => {
    calls.push({ path: new URL(String(input)).pathname, method: init!.method! })
    return new Response(null, { status: 204 })
  }
  t.after(() => { globalThis.fetch = old })
  const client = createClient(settings)
  const funnel = { name: 'Signup', steps: [{ kind: 'page' as const, value: '/' }, { kind: 'goal' as const, value: 'signup' }] }
  await client.realtime({ dimension: 'country', filters: [{ dim: 'source', op: 'is', vals: ['launch'] }] })
  await client.health({ window: '7d' })
  await client.events()
  await client.funnels()
  await client.createFunnel(funnel)
  await client.updateFunnel('123', funnel)
  await client.deleteFunnel('123')
  assert.deepEqual(calls, [
    { path: '/api/v1/stats/realtime', method: 'GET' }, { path: '/api/v1/stats/health', method: 'GET' },
    { path: `/api/v1/products/${settings.product}/events`, method: 'GET' },
    { path: `/api/v1/products/${settings.product}/funnels`, method: 'GET' },
    { path: `/api/v1/products/${settings.product}/funnels`, method: 'POST' },
    { path: `/api/v1/products/${settings.product}/funnels/123`, method: 'PUT' },
    { path: `/api/v1/products/${settings.product}/funnels/123`, method: 'DELETE' },
  ])
  assert.equal('track' in client, false)
  assert.equal('identify' in client, false)
})

test('payment transaction IDs, decimal strings and refund links travel verbatim without retries', async t => {
  const old = globalThis.fetch
  const sent: Record<string, unknown>[] = []
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), settings.endpoint + '/api/v1/payments')
    sent.push(JSON.parse(String(init!.body)))
    return new Response(null, { status: sent.length === 1 ? 201 : 200 })
  }
  t.after(() => { globalThis.fetch = old })
  const client = createClient(settings)
  const payment = { amount: '-29.9000', currency: 'USD', transaction_id: 'refund/provider:001', refund_of: 'charge/provider:001', occurred_at: '2026-09-06T12:00:00Z', cohort: 'launch~email', jt: 'first' as const, entry_page: 'pricing' }
  assert.deepEqual(await client.payment(payment), { ok: true, status: 201, data: null })
  assert.deepEqual(await client.payment(payment), { ok: true, status: 200, data: null })
  assert.deepEqual(sent, [payment, payment])
})

test('HTTP, malformed JSON and network failures preserve distinctions and never retry funnel creation', async t => {
  const old = globalThis.fetch
  let count = 0
  globalThis.fetch = async () => { count++; return Response.json({ error: 'rate_limited', field: 'name' }, { status: 429, headers: { 'Retry-After': '120' } }) }
  t.after(() => { globalThis.fetch = old })
  const client = createClient(settings)
  const funnel = { name: 'Signup', steps: [{ kind: 'page' as const, value: '/' }, { kind: 'goal' as const, value: 'signup' }] }
  assert.deepEqual(await client.createFunnel(funnel), { ok: false, status: 429, error: 'http_error', body: { error: 'rate_limited', field: 'name' }, retryAfter: '120' })
  assert.equal(count, 1)
  globalThis.fetch = async () => { count++; throw new Error('private network information') }
  assert.deepEqual(await client.createFunnel(funnel), { ok: false, status: 0, error: 'network_error' })
  assert.equal(count, 2)
  globalThis.fetch = async () => new Response('malformed')
  assert.deepEqual(await client.events(), { ok: false, status: 200, error: 'invalid_response' })
  globalThis.fetch = async () => new Response(null, { status: 404 })
  assert.deepEqual(await client.events(), { ok: false, status: 404, error: 'http_error' })
})

test('credential/endpoint failures reveal no input and aborted requests do not retry', async t => {
  const old = globalThis.fetch
  t.after(() => { globalThis.fetch = old })
  for (const endpoint of ['https://user:secret@jelto.example', 'https://jelto.example/?secret', 'https://jelto.example/#secret', 'http://public.example', 'file:///secret', 'https://jelto.example/path']) {
    assert.throws(() => createClient({ ...settings, endpoint }), error => error instanceof TypeError && !error.message.includes('secret'))
  }
  assert.throws(() => createClient({ ...settings, apiKey: settings.product }), TypeError)
  assert.throws(() => createClient({ ...settings, product: '../other' }), TypeError)
  const controller = new AbortController()
  controller.abort()
  let count = 0
  globalThis.fetch = async (_url, init) => { count++; assert.equal(init!.signal, controller.signal); throw new Error('aborted') }
  const client = createClient({ ...settings, endpoint: 'http://127.0.0.1:8080' })
  assert.deepEqual(await client.funnels({ signal: controller.signal }), { ok: false, status: 0, error: 'network_error' })
  assert.equal(count, 1)
})
