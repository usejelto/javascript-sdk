/** Wire envelopes are preserved exactly, including absent values and floors. */
export interface Envelope {
  state: 'ok' | 'below_floor' | 'different_populations' | 'not_applicable' | 'no_checkins_yet' | 'withheld' | 'inconsistent' | 'query_failed' | 'geo_unavailable' | 'beyond_retention' | 'mixed_currency' | 'mixed_identity' | 'fx_incomplete'
  value?: number
  n?: number
  d?: number
  reason?: string
  error?: string
  identity_model?: 'server' | 'cookie'
}
export interface SimpleFilter { dim: string; op: 'is' | 'is_not' | 'contains' | 'contains_not' | 'in' | 'gte' | 'lte'; vals: string[] }
export type Filter = SimpleFilter | { op: 'has_done' | 'has_not_done'; event: { name: string; filters: SimpleFilter[] } }
export type DateRange = { from: string; to: string; from_at?: never; until_at?: never } | { from_at: string; until_at: string; from?: never; to?: never }
export type StatsParams = DateRange & {
  metric: string; dimension?: string; surface?: 'web' | 'app'; compare?: 'none' | 'previous' | 'year'
  filters?: Filter[]; companions?: string[]; limit?: number; tz?: string
  reporting_currency?: string; payment_kind?: 'refund'; include_imported?: boolean; include_renewals?: boolean
}
export interface Row { key: string; label: string; value: Envelope; compare?: Envelope; companions?: Record<string, Envelope> }
export interface StatsResponse {
  metric: string; companions?: string[]; surface?: 'web' | 'app'; dimension?: string
  range: { from: string; to: string; tz: string; reference_day: string; from_at?: string; until_at?: string }
  total: Envelope; conversion?: Envelope; compare?: Envelope; delta?: { abs: number; rel?: number }
  rows?: Row[]; total_rows?: number
  meta?: { warnings?: { code: string; message: string; dimension?: string }[]; [key: string]: unknown }
}
export interface RealtimeParams { filters?: SimpleFilter[]; dimension?: string; limit?: number }
export interface RealtimeResponse { visitors_5m: Envelope; rows?: Row[]; total_rows?: number }
export interface HealthParams { window?: '24h' | '7d' | '30d'; by?: 'reason' | 'client_ver'; from?: string; to?: string; tz?: string }
export interface HealthResponse {
  state: 'ok'; window: '24h' | '7d' | '30d'; rejection_grouping: 'reason' | 'client_ver'
  streams: { surface: 'web' | 'app'; event: string; last_write: string | null; idle_budget_h?: number; state?: 'ok' | 'stale' | 'absent' }[]
  rejections: Record<string, number>; geo: Record<string, number>; archive: Record<string, number>
  bots: { operator: string; category: string; event: string; count: number; sample_uas: string[]; more_uas: boolean }[]
  bots_span: 'window' | 'range'
  bots_by_day?: { days: string[]; series: { operator: string; category: string; counts: number[] }[] }
  unknown_events: { name: string; count: number }[]; queries_failed: number
  kill_switches: { scope: 'web' | 'app'; until: string }[]
  surface_activity?: { web: 'never' | 'outside_range' | 'in_range'; app: 'never' | 'outside_range' | 'in_range' }
}
export interface EventsResponse { schema: { event: string; allowed_props: string[] }[]; unknown_seen?: { name: string; count: number }[] }
export interface FunnelStep { kind: 'page' | 'goal'; value: string; label?: string; hostname?: string; match?: 'equals' | 'starts_with' }
export interface FunnelDefinition { name: string; steps: FunnelStep[] }
export interface Funnel extends FunnelDefinition { id: string }
export type Payment = {
  /** Decimal string is sent verbatim, including trailing zeroes. */
  amount: string; currency: string; transaction_id: string; occurred_at: string; refund_of?: string
  revenue_type?: 'initial' | 'renewal' | 'unknown'
} & ({ cohort?: string; jt?: 'first'; entry_page?: string; install_id?: never } | { install_id: string; cohort?: never; jt?: never; entry_page?: never })
