/**
 * Project cards.
 *
 * The card is deliberately brief — `tagline`, `summary`, `cardHighlights`,
 * `metrics` and `cardStack` are all that render on it. Everything else
 * (`overview`, `sections`, the full `stack`) only appears inside the modal that
 * opens when the card is clicked. `preview` names an interactive UI demo
 * registered in components/sections/projects.tsx.
 */

export type ProjectMetric = {
  label: string;
  value: string;
};

export type ProjectSection = {
  title: string;
  points: string[];
};

export type Project = {
  slug: string;
  name: string;
  tagline: string;
  /** One or two lines, shown on the card. */
  summary: string;
  /** Three short bullets, shown on the card. */
  cardHighlights: string[];
  /** Small stat row on the card. */
  metrics?: ProjectMetric[];
  /** Paragraphs at the top of the modal. */
  overview: string[];
  /** Grouped detail, rendered as headed bullet lists in the modal. */
  sections: ProjectSection[];
  /** Full stack — modal. */
  stack: string[];
  /** Subset of `stack` shown on the card; falls back to the first few of `stack`. */
  cardStack?: string[];
  status: "in-development" | "live" | "archived";
  links?: {
    repo?: string;
    live?: string;
    case_study?: string;
  };
  /** Label for the primary live link button (defaults to "Visit"). */
  liveLabel?: string;
  /** Key of an interactive UI preview rendered inside the modal. */
  preview?: "crypsavvy";
  accent?: string;
};

export const projects: Project[] = [
  {
    slug: "crypsavvy",
    name: "CrypSavvy",
    tagline: "Autonomous, multi-tenant crypto trading bot.",
    summary:
      "A Python trading engine and a real-time Next.js dashboard. Each user gets an isolated bot trading USDT pairs on CoinDCX — and live trading stays hard-gated until a backtest and paper run say it's earned.",
    cardHighlights: [
      "Per-user bot workers over one shared market scanner.",
      "Day / long capital buckets with drawdown circuit-breakers.",
      "Diagnostics export written to be pasted into Claude Code.",
    ],
    metrics: [
      { label: "backend tests", value: "141" },
      { label: "universe scan", value: "5 min" },
      { label: "price loop", value: "~15s" },
    ],
    overview: [
      "CrypSavvy is a crypto trading bot I designed, built and operate end to end. It trades USDT-quoted pairs on CoinDCX: users split their capital across a day-trading and a long-term bucket, and a regime-aware strategy ensemble trades inside each bucket's budget with ATR-based stops, fractional-Kelly sizing and per-bucket drawdown circuit-breakers.",
      "The backend is a single Python process doing three jobs at once — a shared market scanner that ranks the USDT universe every five minutes plus a ~15s price monitor, one bot worker thread per active user, and a FastAPI server serving REST and WebSocket to the dashboard. The frontend is a Next.js 14 App Router dashboard on Vercel; the backend runs on Fly.io in Mumbai, close to the exchange.",
      "The part I'm most pleased with isn't the strategy — it's the feedback loop. When a paper run lost money, I didn't guess: I shipped a diagnostics layer, read the real trade data, and traced the loss to a single execution bug.",
    ],
    sections: [
      {
        title: "Trading engine",
        points: [
          "Regime detection (bull / bear / sideways) selects the strategy ensemble; a composite score gates every signal.",
          "ATR-R trailing stop arms at +1R and trails 2–3×ATR, with a hard cap on stop distance per bucket.",
          "Fractional-Kelly sizing over a rolling 30-trade window, damped on negative edge, and restart-safe.",
          "Churn controls: re-entry and stop-out cooldowns plus a per-symbol daily trade cap, all seeded back on restart.",
        ],
      },
      {
        title: "Validation gate",
        points: [
          "Live mode is refused until a walk-forward backtest returns GO and a paper run backs it up.",
          "A --profile legacy|improved runner A/Bs strategy changes and prints an exit-reason histogram.",
          "Backtest and paper trader share the same pure exit helpers, so their behaviour can't silently diverge — pinned by parity tests.",
        ],
      },
      {
        title: "Diagnostics, and a loss I actually explained",
        points: [
          "Per-trade analytics: planned-vs-realized R, MAE/MFE (the clipped-winner signal), churn, daily Sharpe, edge by hour.",
          "The data showed a 0.58:1 payoff ratio and zero take-profit hits across 119 trades — the exits, not the entries, were the problem.",
          "Root cause: the live bot scored signals on the still-forming candle and chased intrabar breakouts that reverted by the close. Fixed by deciding on closed candles only, which restored backtest/live parity.",
          "The whole report exports as markdown or JSON — 'Copy for Claude' puts it on the clipboard, ready to drive the next strategy round in Claude Code.",
        ],
      },
      {
        title: "Real-time dashboard",
        points: [
          "WebSocket price events patch the TanStack Query cache in place instead of refetching, so P&L updates exchange-style; polling is only a fallback.",
          "Views for positions, trades, signals, capital allocation and diagnostics, with a first-run onboarding wizard.",
          "Bot start/stop and paper/live switching from the UI, with a confirmation step before anything touches real funds.",
        ],
      },
      {
        title: "Security & multi-tenancy",
        points: [
          "Per-user exchange API keys are envelope-encrypted (KEK → DEK) at rest — never environment variables, never in the browser bundle.",
          "Clerk JWTs verified against cached JWKS; WebSockets connect with a single-use ticket so the JWT never lands in a URL.",
          "Per-IP rate limiting, and user-scoped repositories as the only place tenant queries are written.",
        ],
      },
    ],
    stack: [
      "Python",
      "FastAPI",
      "SQLAlchemy",
      "Alembic",
      "PostgreSQL",
      "Supabase",
      "Next.js 14",
      "TypeScript",
      "TanStack Query",
      "WebSockets",
      "Tailwind CSS",
      "shadcn/ui",
      "Recharts",
      "Clerk",
      "Docker",
      "Fly.io",
      "Vercel",
    ],
    cardStack: [
      "Python",
      "FastAPI",
      "PostgreSQL",
      "Next.js 14",
      "TypeScript",
      "Fly.io",
    ],
    status: "live",
    links: {
      live: "https://cryp-savvy.abhishekmthw.com",
      repo: "https://github.com/abhishekmthw/cryp-savvy",
    },
    liveLabel: "Open CrypSavvy",
    preview: "crypsavvy",
    accent: "from-emerald-500/20 via-emerald-500/5 to-transparent",
  },
];
