export type Project = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  highlights: string[];
  stack: string[];
  status: "in-development" | "live" | "archived";
  links?: {
    repo?: string;
    live?: string;
    case_study?: string;
  };
  accent?: string;
};

export const projects: Project[] = [
  {
    slug: "crypsavvy",
    name: "CrypSavvy",
    tagline: "Autonomous crypto trading bot for the Indian market.",
    description:
      "An end-to-end trading platform tailored to Indian crypto exchanges — automated strategy execution backed by a live web dashboard. The bot runs as a Python service on Railway and feeds a Next.js dashboard on Vercel.",
    highlights: [
      "Python trading engine + FastAPI server for strategy execution and live state.",
      "Next.js 14 dashboard with real-time portfolio, trades and PnL views.",
      "Split deployment: backend on Railway, frontend on Vercel — same repo, two roots.",
      "Built around the constraints of Indian exchanges and INR pairs.",
    ],
    stack: [
      "Python",
      "FastAPI",
      "Next.js 14",
      "TypeScript",
      "Tailwind CSS",
      "Railway",
      "Vercel",
    ],
    status: "in-development",
    accent: "from-emerald-500/20 via-emerald-500/5 to-transparent",
  },
];
