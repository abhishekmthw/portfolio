"use client";

import * as React from "react";
import { useReducedMotion } from "framer-motion";
import {
  Activity,
  BarChart2,
  Pause,
  Play,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A miniature, self-contained replica of the CrypSavvy main dashboard —
 * bot controls, stat cards, open positions, the portfolio curve and the live
 * event feed. Everything is simulated in this component: no network, no data
 * fetching, no shared state with the rest of the page.
 *
 * All seed values are constants so the first paint is deterministic; the random
 * walk only starts in an effect. Under prefers-reduced-motion the ticker stays
 * paused until the visitor presses Start.
 */

type Position = {
  symbol: string;
  bucket: "day" | "long";
  qty: number;
  entry: number;
  price: number;
  stop: number;
  take: number;
};

const SEED_POSITIONS: Position[] = [
  {
    symbol: "BTC/USDT",
    bucket: "long",
    qty: 0.00412,
    entry: 61_240,
    price: 62_180,
    stop: 59_420,
    take: 64_870,
  },
  {
    symbol: "AAVE/USDT",
    bucket: "day",
    qty: 2.34,
    entry: 141.8,
    price: 139.42,
    stop: 134.1,
    take: 152.6,
  },
];

const BALANCE = 1_240.55;

/** A gentle, fixed opening curve so the chart never renders empty. */
const SEED_CURVE = [
  1712, 1706, 1718, 1731, 1724, 1739, 1746, 1738, 1752, 1761, 1755, 1768, 1774,
  1769, 1781, 1793, 1788, 1802, 1811, 1806, 1819, 1827, 1822, 1834,
];

const EVENT_SCRIPT = [
  { type: "scan_complete", text: "Scanned 48 pairs · regime: bull", tone: "muted" },
  { type: "price_update", text: "BTC/USDT +0.4% · AAVE/USDT −0.2%", tone: "muted" },
  { type: "trade_buy", text: "BUY AAVE/USDT · $332.10 · day bucket", tone: "up" },
  { type: "price_update", text: "Trailing stop armed on BTC/USDT (+1R)", tone: "muted" },
  { type: "shift_suggestion", text: "Suggest day 25% / long 75%", tone: "warn" },
  { type: "trade_sell", text: "SELL XLM/USDT · +$41.28 · take_profit", tone: "up" },
  { type: "scan_complete", text: "Scanned 48 pairs · 2 positions open", tone: "muted" },
  { type: "bucket_drawdown", text: "Day bucket at 3.1% drawdown", tone: "warn" },
] as const;

type FeedItem = { id: number; type: string; text: string; tone: string; time: string };

const SEED_FEED: FeedItem[] = [
  { id: 2, type: "scan_complete", text: "Scanned 48 pairs · regime: bull", tone: "muted", time: "09:41:22" },
  { id: 1, type: "trade_buy", text: "BUY BTC/USDT · $256.30 · long bucket", tone: "up", time: "09:38:07" },
  { id: 0, type: "price_update", text: "Connected · streaming prices", tone: "muted", time: "09:37:55" },
];

const usd = (n: number, digits = 2) =>
  `$${n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;

const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

const clockAt = (tick: number) => {
  const total = 9 * 3600 + 41 * 60 + 30 + tick * 7;
  const h = Math.floor(total / 3600) % 24;
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
};

function StatCard({
  title,
  value,
  sub,
  positive,
  icon: Icon,
}: {
  title: string;
  value: string;
  sub: string;
  positive?: boolean;
  icon: React.ElementType;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border/60 bg-background/40 p-3">
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full bg-gradient-to-br blur-2xl",
          positive === undefined
            ? "from-brand/25 to-transparent"
            : positive
              ? "from-emerald-500/25 to-transparent"
              : "from-rose-500/25 to-transparent"
        )}
      />
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {title}
          </p>
          <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-foreground">
            {value}
          </p>
          <p
            className={cn(
              "mt-0.5 text-[10px]",
              positive === undefined
                ? "text-muted-foreground"
                : positive
                  ? "text-emerald-400"
                  : "text-rose-400"
            )}
          >
            {sub}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-lg border border-border/60 bg-background/60 p-1.5",
            positive === undefined
              ? "text-brand"
              : positive
                ? "text-emerald-400"
                : "text-rose-400"
          )}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
      </div>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const w = 300;
  const h = 84;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = w / Math.max(values.length - 1, 1);

  const points = values.map((v, i) => [i * step, h - ((v - min) / span) * (h - 10) - 5]);
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const last = points[points.length - 1];
  const up = values[values.length - 1] >= values[0];

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="h-24 w-full"
      role="img"
      aria-label="Simulated portfolio value over time"
    >
      <defs>
        <linearGradient id="crypsavvy-spark" x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0%"
            stopColor={up ? "rgb(52 211 153)" : "rgb(251 113 133)"}
            stopOpacity="0.35"
          />
          <stop
            offset="100%"
            stopColor={up ? "rgb(52 211 153)" : "rgb(251 113 133)"}
            stopOpacity="0"
          />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#crypsavvy-spark)" />
      <path
        d={line}
        fill="none"
        stroke={up ? "rgb(52 211 153)" : "rgb(251 113 133)"}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
      {last && (
        <circle
          cx={last[0]}
          cy={last[1]}
          r="2.5"
          fill={up ? "rgb(52 211 153)" : "rgb(251 113 133)"}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}

export function CrypSavvyPreview() {
  const reduce = useReducedMotion();
  const [running, setRunning] = React.useState(true);
  const [gateNotice, setGateNotice] = React.useState(false);
  const [tick, setTick] = React.useState(0);
  const [positions, setPositions] = React.useState(SEED_POSITIONS);
  const [curve, setCurve] = React.useState(SEED_CURVE);
  const [feed, setFeed] = React.useState(SEED_FEED);

  // Counter lives in a ref so the interval callback stays a pure scheduler —
  // no side effects inside a setState updater (they'd double-fire in StrictMode).
  const tickRef = React.useRef(0);

  React.useEffect(() => {
    if (!running || reduce) return;

    const id = window.setInterval(() => {
      const t = (tickRef.current += 1);
      setTick(t);

      setPositions((prev) =>
        prev.map((p) => {
          const drift = (Math.random() - 0.48) * 0.006;
          const next = Math.min(p.take, Math.max(p.stop, p.price * (1 + drift)));
          return { ...p, price: next };
        })
      );

      setCurve((prev) => {
        const last = prev[prev.length - 1];
        const next = last * (1 + (Math.random() - 0.47) * 0.006);
        return [...prev.slice(1), next];
      });

      // Push a new event every third tick so the feed stays readable.
      if (t % 3 === 0) {
        const script = EVENT_SCRIPT[(t / 3) % EVENT_SCRIPT.length];
        setFeed((prev) =>
          [{ id: t + 100, ...script, time: clockAt(t) }, ...prev].slice(0, 5)
        );
      }
    }, 1400);

    return () => window.clearInterval(id);
  }, [running, reduce]);

  const invested = positions.reduce((s, p) => s + p.qty * p.entry, 0);
  const marketValue = positions.reduce((s, p) => s + p.qty * p.price, 0);
  const portfolioValue = BALANCE + marketValue;
  const openPnl = marketValue - invested;
  const totalPnl = 186.42 + openPnl;
  const dailyPnl = 24.18 + openPnl * 0.35;

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-background/60">
      {/* App chrome — sidebar nav collapsed into a top strip at this size. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-card/60 px-3 py-2">
        <span className="flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-tight text-foreground">
          <span className="h-2 w-2 rounded-sm bg-brand" aria-hidden />
          CrypSavvy
        </span>
        <nav aria-hidden className="ml-1 hidden items-center gap-1 sm:flex">
          {["Dashboard", "Trades", "Signals", "Diagnostics"].map((item, i) => (
            <span
              key={item}
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px]",
                i === 0
                  ? "bg-brand/15 text-brand"
                  : "text-muted-foreground"
              )}
            >
              {item}
            </span>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <span
            className={cn(
              "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]",
              running
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : "border-border bg-muted/30 text-muted-foreground"
            )}
          >
            <span className="relative flex h-1.5 w-1.5">
              {running && !reduce && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              )}
              <span
                className={cn(
                  "relative inline-flex h-1.5 w-1.5 rounded-full",
                  running ? "bg-emerald-400" : "bg-muted-foreground"
                )}
              />
            </span>
            <Activity className="h-2.5 w-2.5" aria-hidden />
            {running ? "Live" : "Offline"}
          </span>
          <span className="rounded-full border border-border/60 bg-background/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            {running ? "Running" : "Stopped"} · Paper
          </span>
        </div>
      </div>

      <div className="space-y-3 p-3">
        {/* Bot controls — the only genuinely interactive bits. */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setRunning((r) => !r)}
            aria-pressed={running}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors",
              running
                ? "border-border/60 bg-background/60 text-muted-foreground hover:border-rose-400/60 hover:text-rose-400"
                : "border-transparent bg-brand text-brand-foreground hover:opacity-90"
            )}
          >
            {running ? (
              <>
                <Pause className="h-3 w-3" aria-hidden /> Stop bot
              </>
            ) : (
              <>
                <Play className="h-3 w-3" aria-hidden /> Start bot
              </>
            )}
          </button>

          <div className="inline-flex items-center rounded-full border border-border/60 bg-background/60 p-0.5">
            <span className="rounded-full bg-brand/15 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-brand">
              Paper
            </span>
            <button
              type="button"
              onClick={() => setGateNotice(true)}
              className="rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
            >
              Live
            </button>
          </div>

          <span className="ml-auto font-mono text-[10px] text-muted-foreground">
            Last scan {clockAt(tick)}
          </span>
        </div>

        {gateNotice && (
          <p
            role="status"
            className="rounded-lg border border-amber/40 bg-amber/10 px-2.5 py-1.5 text-[10px] text-amber"
          >
            Live trading is refused until the backtest + paper validation gate
            passes — the real app behaves exactly like this.
          </p>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <StatCard
            title="Balance"
            value={usd(BALANCE)}
            sub={`${positions.length} positions open`}
            icon={Wallet}
          />
          <StatCard
            title="Portfolio value"
            value={usd(portfolioValue)}
            sub="128 trades total"
            icon={BarChart2}
          />
          <StatCard
            title="Total P&L"
            value={usd(totalPnl)}
            sub="Win rate 58.6%"
            positive={totalPnl >= 0}
            icon={totalPnl >= 0 ? TrendingUp : TrendingDown}
          />
          <StatCard
            title="Today's P&L"
            value={usd(dailyPnl)}
            sub={`Avg ${pct(0.82)} per trade`}
            positive={dailyPnl >= 0}
            icon={dailyPnl >= 0 ? TrendingUp : TrendingDown}
          />
        </div>

        <div className="grid grid-cols-1 gap-2 lg:grid-cols-5">
          {/* Open positions */}
          <div className="rounded-xl border border-border/60 bg-background/40 p-3 lg:col-span-3">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-foreground">Open positions</p>
                <p className="text-[10px] text-muted-foreground">
                  Live allocation &amp; unrealised P&amp;L
                </p>
              </div>
              <span className="rounded-full border border-border/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                {positions.length} / 2
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[22rem] border-collapse text-left">
                <thead>
                  <tr className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                    <th className="pb-1 font-medium">Coin</th>
                    <th className="pb-1 text-right font-medium">Buy</th>
                    <th className="pb-1 text-right font-medium">Price</th>
                    <th className="pb-1 text-right font-medium">Value</th>
                    <th className="pb-1 text-right font-medium">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => {
                    const change = ((p.price - p.entry) / p.entry) * 100;
                    const profit = change >= 0;
                    return (
                      <tr key={p.symbol} className="border-t border-border/50">
                        <td className="py-1.5">
                          <div className="text-[11px] font-semibold text-foreground">
                            {p.symbol.split("/")[0]}
                          </div>
                          <div className="text-[9px] text-muted-foreground">
                            {p.bucket} · SL {usd(p.stop, 2)}
                          </div>
                        </td>
                        <td className="py-1.5 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
                          {usd(p.entry)}
                        </td>
                        <td className="py-1.5 text-right font-mono text-[10px] tabular-nums text-foreground">
                          {usd(p.price)}
                        </td>
                        <td className="py-1.5 text-right font-mono text-[10px] tabular-nums text-foreground">
                          {usd(p.qty * p.price)}
                        </td>
                        <td
                          className={cn(
                            "py-1.5 text-right font-mono text-[10px] tabular-nums",
                            profit ? "text-emerald-400" : "text-rose-400"
                          )}
                        >
                          {pct(change)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Portfolio curve */}
          <div className="rounded-xl border border-border/60 bg-background/40 p-3 lg:col-span-2">
            <div className="mb-1 flex items-baseline justify-between">
              <p className="text-xs font-semibold text-foreground">Portfolio value</p>
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                {usd(curve[curve.length - 1], 0)}
              </span>
            </div>
            <Sparkline values={curve} />
          </div>
        </div>

        {/* Live WebSocket feed */}
        <div className="rounded-xl border border-border/60 bg-background/40 p-3">
          <p className="mb-2 text-xs font-semibold text-foreground">Live events</p>
          <ul className="space-y-1">
            {feed.map((e) => (
              <li key={e.id} className="flex items-start gap-2 text-[10px] leading-relaxed">
                <span className="font-mono tabular-nums text-muted-foreground/70">
                  {e.time}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded px-1 font-mono",
                    e.tone === "up"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : e.tone === "warn"
                        ? "bg-amber/10 text-amber"
                        : "bg-muted/40 text-muted-foreground"
                  )}
                >
                  {e.type}
                </span>
                <span className="text-muted-foreground">{e.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-center text-[10px] text-muted-foreground/70">
          Simulated data — a UI replica of the live CrypSavvy dashboard.
        </p>
      </div>
    </div>
  );
}
