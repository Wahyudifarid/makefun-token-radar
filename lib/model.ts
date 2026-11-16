// Token radar model: one sealed snapshot in, one ranked board out.
//
// The board ranks every protocol that could plausibly launch a token one day:
// pre-token (DefiLlama records no token for it) and not a wrapped, staked or
// bridged product, not an exchange, and not a versioned pool of another
// protocol. That is the house watchlist's own rule, applied to the whole
// board instead of only to the floor: the watchlist is the floor, never the
// ceiling, so the board also carries the early protocols below it.
//
// Implied value is derived from the snapshot's own figures, never from a
// hand-written list of names:
//
//   ratio(p)       = market cap / TVL of one live-token protocol, capped at
//                    the snapshot's upper Tukey fence (Q3 + 1.5 x IQR of all
//                    live ratios). The cap is there because a category's
//                    median is only as honest as its noisiest comparable:
//                    one protocol at 400x would otherwise price its whole
//                    category at 100x. The fence is computed from this
//                    snapshot, never typed in.
//   multiple(cat)  = the median live ratio of the category, shrunk toward
//                    the global median by comparables count:
//                      (n x cat_median + k x global) / (n + k), k = 3.
//                    A category with one or two comparables still
//                    contributes its own signal instead of being discarded,
//                    but a single observation cannot dominate the multiple.
//                    A category with no live comparables at all is priced
//                    from its group's pooled median (yield-and-credit,
//                    trading, staking, money or real-world — a fixed,
//                    documented mapping of category names to groups, applied
//                    consistently), or from the global median when it
//                    belongs to no group with at least three pooled
//                    comparables. Every row's detail view states which of
//                    the three priced it.
//   growth         = clamp(change_7d, -60, +120) per cent
//   growthMult     = 1 + 0.5 * growth / 100
//   maturity       = 0.6 + 0.4 * min(age_days, 1095) / 1095
//                    (age unknown: 365 days)
//   implied        = max(1, round(tvl_usd * multiple(cat) * growthMult
//                                  * maturity))
//
// The median is used because a category's mean is dragged by outliers (one
// bridge at 8x would price every bridge at 8x), and the cap exists for the
// same reason one observation below that. The dashboard prints the multiple
// each category got, how it was priced, and how many live protocols priced
// it, so a reader can check the model instead of taking it on trust.
//
// Farm plans are generated from the protocol's own record (category, chains,
// TVL, age): the action fits the category, the capital fits the TVL, the
// hold fits the age, and every step states what it costs and how long it
// takes. No protocol name is ever special-cased.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  shrinkage_k: number;
  group_min_comparables: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  shrinkage_k: 3,
  group_min_comparables: 3,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-3';

/** One category's pricing: its live-token multiple and how it was priced. */
export interface CategoryMultiple {
  category: string;
  multiple: number;
  comparables: number;
  fallback: boolean;
  source: 'category' | 'group' | 'global';
  group: string | null;
}

/**
 * The category groups for the group fallback: a fixed, documented mapping of
 * category names to the business they belong to, applied to every category
 * the same way. It is a model choice about categories, never a list of
 * protocol names: no protocol is ever priced because of its name. A group
 * only prices a category when its pooled live comparables reach
 * group_min_comparables; otherwise the global median prices it.
 */
export const CATEGORY_GROUPS: Record<string, string[]> = {
  'yield-and-credit': ['Lending', 'Yield', 'Yield Aggregator', 'CDP', 'CDP Manager', 'Onchain Capital Allocator', 'Risk Curators', 'Uncollateralized Lending', 'Collateral Markets', 'Leveraged Farming', 'Farm', 'Interest Rate Derivatives', 'Restaking', 'Liquid Restaking', 'Staking Pool'],
  trading: ['Dexs', 'Derivatives', 'Options', 'Options Vault', 'Prediction Market', 'Basis Trading', 'Indexes', 'Liquidity Manager'],
  staking: ['Liquid Staking', 'Restaked BTC'],
  money: ['Stablecoin Wrapper', 'Dual-Token Stablecoin', 'Payments', 'Crypto Card Issuer', 'CeDeFi'],
  'real-world': ['RWA', 'Insurance', 'OTC Marketplace'],
};

/** The group a category belongs to, or null when it belongs to none. */
export function categoryGroup(category: string | null): string | null {
  const key = category ?? 'Uncategorized';
  for (const [group, members] of Object.entries(CATEGORY_GROUPS)) {
    if (members.includes(key)) return group;
  }
  return null;
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    category_comparables: number;
    category_fallback: boolean;
    multiple_source: 'category' | 'group' | 'global';
    multiple_group: string | null;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  category_multiple: number;
  category_comparables: number;
  multiple_source: 'category' | 'group' | 'global';
  multiple_group: string | null;
  growth_multiplier: number;
  maturity_multiplier: number;
  farm_steps: string[];
  watchlist: boolean;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  multiple: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  multiples: CategoryMultiple[];
  global_multiple: number;
  ratio_cap: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a sorted-by-value list; 0 when empty. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories that are wrapped, staked or bridged products of a token that already trades. */
const WRAPPED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Exchange names a protocol must not begin with: an exchange's own product is not a launch candidate. */
const EXCHANGES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol is one the board may rank: pre-token and plausibly launching its own token. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && WRAPPED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return false;
  for (const ex of EXCHANGES) if (p.name.startsWith(ex)) return false;
  return true;
}

/** The p-th quantile of a sorted list, nearest-rank; 0 when empty. */
function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
}

/** Everything the model needs to price one category: the shrunk category multiples, the global median, the ratio cap, and the pooled group medians. */
export interface PricedMultiples {
  byCategory: Map<string, CategoryMultiple>;
  global: number;
  ratioCap: number;
  groups: Map<string, { multiple: number; comparables: number }>;
}

/**
 * The pricing table, from the live-token protocols in this snapshot. Each
 * live ratio is capped at the snapshot's upper Tukey fence (Q3 + 1.5 x IQR
 * of all live ratios) before any median is taken, so one protocol at 400x
 * cannot price its whole category. Each category's own median is then shrunk
 * toward the global median by comparables count, and each group's pooled
 * median is kept for the categories that have no comparables at all.
 */
export function categoryMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): PricedMultiples {
  const rawPerCategory = new Map<string, number[]>();
  const rawAll: number[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p)) continue;
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    rawAll.push(ratio);
    const key = p.category ?? 'Uncategorized';
    const list = rawPerCategory.get(key) ?? [];
    list.push(ratio);
    rawPerCategory.set(key, list);
  }
  const sorted = [...rawAll].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const ratioCap = sorted.length >= 4 && Number.isFinite(q1) && Number.isFinite(q3) ? q3 + 1.5 * (q3 - q1) : Infinity;
  const cap = (r: number): number => Math.min(r, ratioCap);
  const perCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const [category, ratios] of rawPerCategory) {
    const capped = ratios.map(cap);
    perCategory.set(category, capped);
    all.push(...capped);
  }
  const global = median(all);
  const byCategory = new Map<string, CategoryMultiple>();
  for (const [category, ratios] of perCategory) {
    const n = ratios.length;
    const shrunk = (n * median(ratios) + model.shrinkage_k * global) / (n + model.shrinkage_k);
    byCategory.set(category, { category, multiple: shrunk, comparables: n, fallback: false, source: 'category', group: null });
  }
  const groups = new Map<string, { multiple: number; comparables: number }>();
  for (const [group, members] of Object.entries(CATEGORY_GROUPS)) {
    const pooled: number[] = [];
    for (const member of members) pooled.push(...(perCategory.get(member) ?? []));
    if (pooled.length > 0) groups.set(group, { multiple: median(pooled), comparables: pooled.length });
  }
  return { byCategory, global, ratioCap, groups };
}

/**
 * The multiple one category gets: its own shrunk median when it has live
 * comparables; its group's pooled median when it has none and the group
 * clears the comparables bar; the global median otherwise. The provenance
 * travels with the row so the detail view can state it.
 */
export function multipleFor(category: string | null, priced: PricedMultiples, model: ModelConstants = MODEL): CategoryMultiple {
  const key = category ?? 'Uncategorized';
  const own = priced.byCategory.get(key);
  if (own !== undefined) return own;
  const group = categoryGroup(key);
  if (group !== null) {
    const pooled = priced.groups.get(group);
    if (pooled !== undefined && pooled.comparables >= model.group_min_comparables) {
      return { category: key, multiple: pooled.multiple, comparables: pooled.comparables, fallback: true, source: 'group', group };
    }
  }
  return { category: key, multiple: priced.global, comparables: 0, fallback: true, source: 'global', group: null };
}

/** The three multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  priced: PricedMultiples,
  model: ModelConstants = MODEL,
): { implied: number; multiple: CategoryMultiple; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const multiple = multipleFor(protocol.category, priced, model);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple.multiple * growthMult * maturityMult));
  return { implied, multiple, growthPct, growthMult, maturityMult, age };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; priced: PricedMultiples } {
  const priced = categoryMultiples(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug on it, even one the snapshot no longer carries.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol, at any TVL. The floor is never the
  // whole board, and a protocol below it is no worse a subject than one on it.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const s = impliedValue(p, snapshot.as_of, priced, model);
    return { p, ...s };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const board: BoardRow[] = scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      category_multiple: round4(s.multiple.multiple),
      category_comparables: s.multiple.comparables,
      category_fallback: s.multiple.fallback,
      multiple_source: s.multiple.source,
      multiple_group: s.multiple.group,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
  return { board, priced };
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The protocol's chains, capped at three with a count, as the board shows them. */
function chainsShort(p: SnapshotProtocol): string {
  if (p.chains.length === 0) return 'its main chain';
  const shown = p.chains.slice(0, 3).join(', ');
  return p.chains.length > 3 ? `${shown} +${p.chains.length - 3}` : shown;
}

/** The weekly action for the category's real activity, in the words a farmer can follow. */
function weeklyActionFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'adjust the borrow, claim the interest that accrued, and re-check the health factor';
  if (c.includes('dex') || c.includes('leveraged farm')) return 'swap $10 through the busiest pool, or add and remove a small amount of liquidity';
  if (c.includes('yield') || c.includes('vault') || c.includes('curator') || c.includes('allocator') || c.includes('capital')) return 'check the vault yield, top up $10 if it is still paying, or move to the better vault on the same protocol';
  if (c.includes('bridge')) return 'bridge $10 of USDC to the chain and back, or use the bridged funds inside the app';
  if (c.includes('stak') || c.includes('restak')) return 'check the staking rewards that accrued, then restake them or claim them';
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return 'open and close one small hedged position, or close the open one and re-open it';
  if (c.includes('prediction')) return 'settle a finished market, or take a position in a new one';
  if (c.includes('stable')) return 'check the peg and the yield, and mint or redeem $10 if the rate moved';
  if (c.includes('rwa')) return 'check the yield that accrued and confirm the next payout date';
  if (c.includes('insurance')) return 'check the cover is still active and what premium is due';
  if (c.includes('payment') || c.includes('card')) return 'spend $10 through the card or account and confirm the transaction posted';
  return 'make one real action: a deposit, a swap, a vote, or a claim';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** What one transaction costs on the protocol's first chain: Ethereum mainnet is dear, the rest are cheap. */
function gasFor(p: SnapshotProtocol): string {
  return chainOf(p) === 'Ethereum' ? '$8 to $25 of gas' : '$1 to $4 of gas';
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Lend $${capital} of USDC on ${name} (${chain}) and borrow $20 against it, then repay the loan.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Add $${capital} of liquidity to the busiest pool on ${name} (${chain}) and make one swap through it.`;
  if (c.includes('yield') || c.includes('vault') || c.includes('curator') || c.includes('allocator') || c.includes('capital')) return `Deposit $${capital} into the largest vault on ${name} (${chain}) and keep the vault shares.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC into ${chain} with ${name}, then use the bridged funds inside its app.`;
  if (c.includes('stak') || c.includes('restak')) return `Stake $${capital} of the chain asset through ${name} (${chain}) and keep the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Deposit $${capital} of USDC as margin on ${name} (${chain}) and open one small hedged position.`;
  if (c.includes('prediction')) return `Fund your account with $${capital} on ${name} (${chain}) and take one position in an active market.`;
  if (c.includes('stable')) return `Mint $${capital} of the stable asset on ${name} (${chain}) and hold it in your wallet.`;
  if (c.includes('rwa')) return `Mint $${capital} of the yield-bearing asset on ${name} (${chain}) and hold it for one full cycle.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} (${chain}) and keep the policy active.`;
  if (c.includes('payment') || c.includes('card')) return `Load $${capital} onto ${name} (${chain}) and spend $10 through it.`;
  return `Deposit $${capital} of USDC into ${name} (${chain}) and use one of its core features.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(p);
  const action = actionFor(p, capital, chain);
  const weekly = weeklyActionFor(p);
  return [
    {
      text: `Open a fresh wallet that holds only the funds you plan to farm, and write its seed phrase on paper, never in a chat or a screenshot. On ${chain}, one transaction costs about ${gas}.`,
      cost: 'nothing but the wallet',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about ${gas}`,
      time: '15 minutes to set up',
    },
    {
      text: `Come back once a week: ${weekly}.`,
      cost: `about ${gas} a week`,
      time: '10 minutes a week',
    },
    {
      text: `Leave the position alone for at least ${hold} days, so the activity shows up in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw anything, open the protocol's own rewards page from its official site and claim only from the link it publishes. A claim on ${chain} costs about ${gas}; never pay a separate fee to claim.`,
      cost: 'nothing to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the $${capital} on ${chain} (${chainsShort(p)}), the dates and every transaction hash in a farm log, so you can repeat the position or unwind it cleanly.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, 24)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      multiple: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow, watchlist: string[]): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    category_multiple: row.model.category_multiple,
    category_comparables: row.model.category_comparables,
    multiple_source: row.model.multiple_source,
    multiple_group: row.model.multiple_group,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    farm_steps: row.farm_steps,
    watchlist: watchlist.includes(row.slug),
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const { board, priced } = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  // The multiples strip names every category on the board, with its provenance,
  // so a reader sees at a glance which categories priced themselves and which
  // borrowed a group or the global median.
  const seen = new Map<string, CategoryMultiple>();
  for (const r of board) {
    const key = r.category ?? 'Uncategorized';
    if (!seen.has(key)) {
      seen.set(key, {
        category: key,
        multiple: r.model.category_multiple,
        comparables: r.model.category_comparables,
        fallback: r.model.category_fallback,
        source: r.model.multiple_source,
        group: r.model.multiple_group,
      });
    }
  }
  const multiples: CategoryMultiple[] = [...seen.values()].sort((a, b) => b.multiple - a.multiple || (a.category < b.category ? -1 : 1));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    multiples,
    global_multiple: round4(priced.global),
    ratio_cap: Number.isFinite(priced.ratioCap) ? round4(priced.ratioCap) : 0,
    rows: board.map((r) => radarRow(r, snapshot.watchlist)),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
