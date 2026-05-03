# CLAUDE.md — portfolio

This file gives Claude Code the context it needs to work on Abhishek Mathew's personal portfolio site without re-discovering it from scratch.

## What this is

A single-page personal portfolio. Next.js 14.2 (App Router) + TypeScript + Tailwind + shadcn/ui-style primitives + framer-motion + next-themes. Deploys cleanly to Vercel as a fully static page.

There is exactly one route: [app/page.tsx](app/page.tsx). It composes a stack of section components and that's the whole site.

## The data-first rule (read this before editing)

**For any content change — name, role, bullet, skill, project, link — edit the matching file in [data/](data/), not the section component.** The section components in [components/sections/](components/sections/) are deliberately thin renderers around the data. Putting strings into JSX is the wrong place and will scatter facts across the codebase.

| File | What it owns |
|---|---|
| [data/profile.ts](data/profile.ts) | Name, title, location, email, phone, GitHub/LinkedIn, hero summary, About paragraphs, spoken languages |
| [data/skills.ts](data/skills.ts) | Skill groups (`category` + `items[]`) — order in the array == order on the page |
| [data/experience.ts](data/experience.ts) | Work history. `current: true` paints the "Current" badge; `remote: true` appends "· Remote" to the location |
| [data/projects.ts](data/projects.ts) | Project cards. `status` is `"in-development" \| "live" \| "archived"`. Optional `links.{repo,live,case_study}` surface buttons. `accent` is a Tailwind gradient classlist for the card glow |
| [data/education.ts](data/education.ts) | Two arrays: `education[]` (degrees) and `accomplishments[]` (certifications) |
| [data/navigation.ts](data/navigation.ts) | Anchor links in the navbar |

To add a new project, append an entry to `data/projects.ts`. Don't touch [components/sections/projects.tsx](components/sections/projects.tsx) unless the rendering itself needs to change.

## Layout & wiring

```
app/
  layout.tsx          ThemeProvider (dark default), Inter font, metadata sourced from profile.ts
  page.tsx            Imports each section and renders them in order
  globals.css         Tailwind layers + CSS vars for light/dark + brand color
components/
  navbar.tsx          Fixed, blurs on scroll, mobile menu
  footer.tsx
  theme-provider.tsx  next-themes wrapper
  theme-toggle.tsx    Sun/moon button (uses mounted-flag to avoid hydration mismatch)
  section-heading.tsx Shared eyebrow + title + description block
  ui/                 button.tsx, card.tsx, badge.tsx — shadcn-style primitives
  sections/           hero, about, skills, experience, projects, education, contact
data/                 (described above)
lib/utils.ts          cn() helper (clsx + tailwind-merge)
```

The page renders sections in a fixed order in [app/page.tsx](app/page.tsx): Hero → About → Skills → Experience → Projects → Education → Contact. Reorder there.

## Conventions

- **Path alias**: `@/*` resolves to the project root (see [tsconfig.json](tsconfig.json)). Imports look like `@/components/ui/button`, `@/data/profile`.
- **Class composition**: always use `cn(...)` from [lib/utils.ts](lib/utils.ts) — never string-concatenate Tailwind classes.
- **Theme tokens**: components reference HSL CSS variables (`bg-background`, `text-muted-foreground`, `border-border`, `text-brand`). The variable values are in [app/globals.css](app/globals.css) — change the look there, not by overriding colors per component.
- **Default theme is dark** ([app/layout.tsx](app/layout.tsx) sets `defaultTheme="dark"`). The toggle still works for light mode, so light styles must keep working.
- **Animations**: framer-motion lives behind `"use client"` boundaries (Hero, Projects). Keep server components free of motion imports.
- **shadcn-style**: when adding a new primitive (e.g. dialog, tooltip), add it under `components/ui/` following the same `cva` + `forwardRef` pattern as [components/ui/button.tsx](components/ui/button.tsx). [components.json](components.json) is configured if you want to use the shadcn CLI.

## Commands

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build (run this to validate types)
npm run start    # serve the production build
npm run lint     # next lint
```

There is no test runner. The cheapest "did I break it" check is `npm run build` — it type-checks and lint-checks in one pass.

When iterating locally, the parent folder also runs `infillx-ai` and `intelligen-ai` on port 3000 by default. If you have one of those running, start the portfolio on a different port: `npm run dev -- -p 3001`.

## Deploying

- **Vercel**: import the repo (once it has one), framework preset = Next.js, no env vars required. The site is fully static.
- **Metadata**: page `<title>` and OG tags come from [data/profile.ts](data/profile.ts) via [app/layout.tsx](app/layout.tsx).

## Things to be careful about

- Don't put Markdown into the data files — values are rendered as plain strings. If you need rich text, extend the type and update the renderer.
- Don't add a project image without also adding `next/image` config — there's no `images` block in [next.config.mjs](next.config.mjs) yet, so external URLs will fail to optimize. Either pull images into [public/](public/) or whitelist remote hosts first.
- Don't downgrade Next.js below 14.2.x — earlier 14.x series has an unpatched advisory ([blog post](https://nextjs.org/blog/security-update-2025-12-11)).
- The phone number in [data/profile.ts](data/profile.ts) is rendered as a `tel:` link — keep it in human format (`+91 90086 95776`), the contact section strips the spaces.
- Section IDs (`#about`, `#skills`, `#experience`, `#projects`, `#education`, `#contact`, `#top`) are referenced by the navbar in [data/navigation.ts](data/navigation.ts). Renaming a section ID means updating both ends.

## What NOT to do

- Don't move resume content into JSX. Edit `data/*.ts` instead.
- Don't `git init` here without the user asking — this folder lives inside a parent that intentionally holds multiple independent repos.
- Don't fork the section components into per-project variants. The Projects section is one renderer driven by an array; new projects = new array entries.
