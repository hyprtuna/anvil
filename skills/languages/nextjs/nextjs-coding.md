---
name: nextjs-coding
user-invocable: false
description: 'Use when implementing or modifying Next.js apps — App Router, Server Components, minimal `use client`.'
tools: [Read, Write, Edit, Grep, Glob, Bash]
x-anvil:
  kind: atomic
  group: development
  trigger: [nextjs, next.js, next, app router]
  language: nextjs
---

> **Invoke via `Skill({skill: "anvil:nextjs-coding"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Next.js Developer

App Router by default (Next.js 13.4+). Server Components are the default — add `'use client'` only for components that need browser APIs, event handlers, or state. Minimize the client boundary to leaf components.

## Tool Detection

- `next.config.mjs` / `next.config.ts` / `next.config.js` → Next.js project.
- `app/` directory → App Router (modern). `pages/` directory → Pages Router (legacy).
- `middleware.ts` at root → Next.js middleware in use.
- Check `package.json` for Next.js version — 14+ has stable Server Actions; 15+ has React 19 support.
- `.env.local` → environment variables (client-exposed must be prefixed `NEXT_PUBLIC_`).

## Server vs Client Components

- Server Components (default): can `async/await`, directly access databases, read files, use secrets. Zero JS shipped to client.
- Client Components (`'use client'`): needed for `useState`, `useEffect`, `onClick`, browser APIs.
- Push `'use client'` as deep as possible — wrap only the interactive leaf, not the whole page.
- Server Components can import Client Components, but not vice versa. Pass server data to client components as props.

## Data Fetching

- In Server Components: `fetch()` or direct database calls at the component level. No `useEffect` for initial data.
- `fetch()` in Server Components is extended with caching: `fetch(url, { cache: 'force-cache' })` (default), `{ cache: 'no-store' }` for dynamic.
- Use `generateStaticParams` for static generation of dynamic routes.
- Revalidate with `revalidatePath` or `revalidateTag` in Server Actions.
- For client-side data fetching (after initial load), use TanStack Query or SWR.

## Routing and Layouts

- File-system routing in `app/`: `app/dashboard/page.tsx` → `/dashboard`.
- `layout.tsx` for shared UI that persists across child navigations (nav, sidebar).
- `loading.tsx` for Suspense fallbacks — show skeletons, not spinners.
- `error.tsx` for error boundaries per route segment.
- `not-found.tsx` for custom 404 pages.
- Route groups `(groupName)/` for organizing without affecting URL structure.
- Parallel routes `@slot/` for rendering multiple pages in the same layout.

## Server Actions

- Use `'use server'` for mutations (form submissions, data writes). Define in separate files or inline in Server Components.
- Validate all inputs — Server Actions are public HTTP endpoints. Use Zod for validation.
- Call `revalidatePath` or `revalidateTag` after mutations to refresh cached data.
- Use `useActionState` (React 19) or `useFormStatus` for pending states in forms.
- Return serializable data only — no class instances, functions, or Dates.

## Common Pitfalls

1. **Overusing `'use client'`**: Most components don't need client-side JS. Fetching data, rendering lists, showing formatted text — all Server Components.
2. **Client-side fetching when server fetch works**: If the data is needed at render time, fetch it in a Server Component. Reserve client fetching for user-triggered updates.
3. **Missing `loading.tsx` / `error.tsx`**: Every route segment that fetches data should have these. Without them, the entire page hangs or crashes.
4. **Ignoring ISR**: For content that changes infrequently, use `revalidate` instead of always fetching fresh. `export const revalidate = 3600;` at the page level.
5. **Environment variable leaks**: Never prefix secrets with `NEXT_PUBLIC_`. Only values safe for the browser get that prefix.

## Testing

- Configure Jest with `next/jest` for proper module resolution and transforms.
- React Testing Library for component tests — same patterns as React skill.
- Playwright or Cypress for E2E tests covering server-rendered pages and navigation.
- Test Server Actions by calling them directly as functions in test files.
- Mock `next/navigation` (`useRouter`, `usePathname`) in component tests.

## Performance

- Use `next/image` for all images — automatic optimization, lazy loading, and responsive sizing.
- Use `next/font` for font loading — eliminates layout shift.
- Use `next/link` for client-side navigation — prefetches linked routes.
- Analyze bundle with `@next/bundle-analyzer`. Keep client JS minimal.
- Use `dynamic(() => import(...))` for heavy client components that aren't needed on first paint.
