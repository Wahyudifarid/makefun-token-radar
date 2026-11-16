# Token Launch Radar

A token launch radar for make.fun's `token-radar-01` bounty. It reads a sealed
DefiLlama snapshot, ranks every protocol that could plausibly launch a token by
an implied value, and hands in a dashboard a reader can use: a sortable,
filterable board, a detail view with the model breakdown and a farm plan for
every protocol, and the live-token market the model is priced from.

## The model

Implied value = TVL x category multiple x growth x maturity.

- **Category multiple**: the median market-cap-to-TVL ratio of the live-token
  protocols in the same category, taken from the snapshot itself, shrunk
  toward the global median by comparables count: (n x category median + 3 x
  global) / (n + 3). A category with no live comparables is priced from its
  group median (yield-and-credit, trading, staking, money or real-world) or
  the global median. Each live ratio is capped at the snapshot's upper Tukey
  fence (Q3 + 1.5 x IQR) before any median is taken, so one extreme protocol
  cannot price a whole category. Every row's detail view states which of the
  three priced it.
- **Growth**: the 7-day TVL change, clamped to -60%..+120% and half-weighted.
- **Maturity**: 0.60 rising to 1.00 over a protocol's first three years with no
  token (365 days when the listing date is unknown).

The board ranks every rankable pre-token protocol: the 40 on the snapshot's
watchlist plus every other pre-token protocol that is not an exchange, not a
wrapped / staked / bridged product, and not a versioned pool. Wrapped, staked
and bridged products, exchanges and versioned pools are left out — they are
not launches waiting to happen.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
```

That writes `out/board.json`, `out/data.js`, `out/dashboard/`,
`out/screenshots/` and `out/dossier.json`. Open `out/dashboard/index.html`
in a browser (it reads `../data.js`, no network) or serve `out/` over HTTP.

## Layout

- `main.ts` — entrypoint: reads the snapshot, writes the board, the data and
  the dossier.
- `lib/model.ts` — the model, the farm plans and the snapshot parsing.
- `dashboard/` — the static page: `index.html`, `app.css`, `app.js`.
- `vendor/makefun-board.ts` — make.fun's dossier library, copied from the kit
  as its header instructs.
- `screenshots/` — the three screenshots: the board, a detail view and a
  filtered view.
