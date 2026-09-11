# @jelto/analytics

Typed wrappers for Jelto's existing browser tracker and scoped server API. Both
entry points can be imported during SSR without DOM, storage or network access.
Node 22 or later is required for the server entry.

## Install locally

Version 1.0.0 is prepared for release; registry publication is not yet available.
From this package's source root, use Node.js 24 and run `npm ci` and
`make package`. In the consuming application, install the resulting tarball:

```sh
npm install /absolute/path/to/jelto-analytics-1.0.0.tgz
```

See the [integration guide](https://jelto.io/docs/sdk/analytics) for setup.

## Browser

Call `initialize` after mounting. Use this instead of adding an HTML tracker tag.
The SDK loads the existing bundles; their exclusions, consent choices, SPA
handling, transport and privacy behavior remain authoritative.

```ts
import { initialize } from '@jelto/analytics/browser'

const analytics = await initialize({
  product: 'prd_8f3kq2m9x1',
  scriptUrl: 'https://your-jelto-host.example/jelto.js',
  goals: true,
})
analytics.track('signup', { plan: 'pro' })
analytics.pageview({ u: '/pricing' }) // optional; automatic pageviews are on
const label = analytics.cohort()
```

The default `@jelto/analytics` export is the same browser entry. Identical repeated
initialization returns the same promise; conflicting options or an existing HTML
installation fail before inserting another tracker. A failed script load remains
latched until a page reload to prevent partial initialization from duplicating
collection. Script URLs must end in `jelto.js` or `jelto.cookie.js`. An `http:`
scriptUrl is accepted but is only safe on loopback/dev, since the browser's
mixed-content blocking on an HTTPS page is the only defence against it. Choosing the
cookie bundle is explicit; `memory: true` separately enables first-touch memory.
Use `nonce` for nonce-based CSP. Managed proxy URLs and an explicit `endpoint`
are supported.

Optional `domains` loads the cohort-only cross-domain helper before the core.
Both hosts must be registered; visitor cookies remain host-only. `goals: true`
loads explicit form-submit and visibility goals. Form goals report validated
browser submissions, not successful server processing, and read only declared
`data-jelto-event-*` attributes.

```ts
const analytics = await initialize({
  product: 'prd_8f3kq2m9x1',
  scriptUrl: 'https://your-jelto-host.example/jelto.js',
  domains: ['site.example', 'shop.example'],
  checkout: {
    memory: false,
    environment: 'live',
    entryPages: [{ id: 'pricing', host: 'site.example', paths: ['/pricing/**'] }],
  },
})
const metadata = analytics.checkoutMetadata()
// Pass declared cohort/entry group metadata to your server-side checkout.
analytics.payment({ session_id: 'cs_returned_session' })
```

Populating `payment()`'s optional `email` transmits the end user's email address
from the browser to Jelto's attribution endpoint; only pass it when that is intended.

The SDK orders cross-domain → core → goals → entry → checkout. Entry metadata
contains a configured group ID, never the page path. Checkout memory defaults to
30 minutes in the current tab; set `checkout.memory: false` for no storage.
Lemon Squeezy and Polar links can carry entry metadata. Stripe's existing
`jl1_`/`jf1_` reference format carries only the cohort: use server-created metadata
or a verified return claim for entry attribution. Missing context stays unknown.

`context()` describes the current page lifecycle. There is no `identify` API.

## Server

```ts
import { createClient } from '@jelto/analytics/server'

const jelto = createClient({
  endpoint: 'https://your-jelto-host.example',
  product: 'prd_8f3kq2m9x1',
  apiKey: process.env.JELTO_API_KEY!,
})
const result = await jelto.stats({
  from: '2026-09-01', to: '2026-09-06', metric: 'visitors',
})
if (result.ok) console.log(result.data.total)
```

Keep the `jk_` key on your server. `createClient` refuses browser execution and
requires HTTPS, except HTTP loopback during development. It omits cookies and
referrers and refuses redirects. Requests default to a 15-second timeout; pass
`{ signal }` to any method for caller-controlled cancellation.

| Methods | Required key scope |
| --- | --- |
| `stats`, `realtime`, `health`, `events` | `analytics:read` |
| `funnels` | `funnels:read` |
| `createFunnel`, `updateFunnel`, `deleteFunnel` | `funnels:write` |
| `payment` | `payments:write` |

Results preserve the API body without replacing absent, floored or unavailable
numbers with zero. HTTP failures include the original parsed `body` and optional
`retryAfter` header. Network and malformed-response failures are distinct.
No request automatically retries, especially non-idempotent funnel creation.

```ts
await jelto.payment({
  amount: '29.9000', currency: 'USD',
  transaction_id: 'provider_charge_123', occurred_at: new Date().toISOString(),
  cohort: 'launch~email', entry_page: 'pricing', revenue_type: 'initial',
})
```

Amounts and transaction IDs are sent verbatim. Reuse the same transaction ID
when retrying a payment: the server returns 201 for new facts and 200 for a
duplicate. App `install_id` and web `cohort` are mutually exclusive in the type.
This package adds no arbitrary server visitor-event ingestion. For optional
crawler reporting use the separate `@jelto/crawler` package.

Run `npm ci`, `npm run check`, `npm run conformance` (twice for certification),
and `npm pack --dry-run` to verify the package locally. Publication is separate.

## Repository CI and releases

The component-owned workflows become active when this directory is the
repository root. CI runs local package tests; release CI additionally requires
conformance twice and the configured contracts pin where applicable.
See [RELEASING.md](https://github.com/usejelto/javascript-sdk/blob/main/RELEASING.md) for initial publication, trusted publishing,
version tags, and retries. Publishing stays disabled until explicitly configured.

## Community and license

Questions, bug reports and documentation improvements are welcome. See
[Support](https://github.com/usejelto/javascript-sdk/blob/main/SUPPORT.md),
[Contributing](https://github.com/usejelto/javascript-sdk/blob/main/CONTRIBUTING.md),
[Code of Conduct](https://github.com/usejelto/javascript-sdk/blob/main/CODE_OF_CONDUCT.md), and
[Security policy](https://github.com/usejelto/javascript-sdk/blob/main/SECURITY.md).
Until the public repository is available, these files are also included in the
source root; contact [taha@jelto.io](mailto:taha@jelto.io) for help.

Jelto-owned software and associated documentation use the [MIT license](LICENSE).
Third-party materials retain their own terms, including the Contributor Covenant
attribution. Jelto names, logos, mascots and original brand artwork are excluded
from the software license; no trademark rights are granted.
