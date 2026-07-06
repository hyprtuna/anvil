---
name: react-coding
user-invocable: false
description: 'Use when implementing or modifying React components — functional components, hooks, composition over inheritance.'
tools: [Read, Write, Edit, Grep, Glob, Bash]
x-anvil:
  kind: atomic
  group: development
  trigger: [react, component, jsx, tsx]
  language: react
---

> **Invoke via `Skill({skill: "anvil:react-coding"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# React Developer

Functional components only. Hooks for state and side effects. No class components. Composition over inheritance. TypeScript for all new components.

## Tool Detection

- `vite.config.ts` / `vite.config.js` → Vite bundler.
- `next.config.mjs` / `next.config.ts` → Next.js (see nextjs-coding skill for specifics).
- `remix.config.js` / `app/root.tsx` → Remix.
- `tsconfig.json` with `jsx: "react-jsx"` → React with TypeScript.
- Check `package.json` for React version — v18+ enables concurrent features.

## Component Patterns

- Functional components only — never class components.
- Colocate component, styles, types, and tests: `Button/Button.tsx`, `Button/Button.test.tsx`, `Button/index.ts`.
- Use composition over inheritance: pass children, render props, or slots instead of extending components.
- Extract reusable logic into custom hooks (`useAuth`, `useDebounce`, `useLocalStorage`).
- Keep components small — if it exceeds ~100 lines, split it.
- Type props with interfaces: `interface ButtonProps { variant: 'primary' | 'secondary'; onClick: () => void; }`.

## State Management

- `useState` for simple local state (toggles, form inputs).
- `useReducer` for complex state with multiple sub-values or transitions.
- Context (`useContext`) for cross-cutting concerns (theme, auth, locale) — not for frequently changing data.
- External stores (Zustand, Jotai) for global client state that many components read.
- Server state belongs in a data-fetching library (TanStack Query, SWR) — not in `useState`.

## Hooks Rules and Patterns

- No `useEffect` without a clear reason — most "effects" are derived state or event handlers.
- Derive state during render: `const fullName = first + ' ' + last;` — no `useEffect` + `setState`.
- Use `useMemo` only when you have measured a performance problem, not by default.
- Use `useCallback` only for referential stability when passing to memoized children.
- Custom hooks must start with `use` and may call other hooks.

## Common Pitfalls

1. **Unnecessary `useEffect`**: Computing derived values, transforming data for rendering, or subscribing to external stores do not need effects. Use `useMemo`, event handlers, or `useSyncExternalStore`.
2. **Prop drilling**: Passing props through 3+ levels signals a need for context, composition (`children`), or a state management library.
3. **Stale closures in effects**: Always include all referenced values in the dependency array. Use the `useEffect` exhaustive-deps ESLint rule and never disable it.
4. **Key prop misuse**: Use stable, unique identifiers as keys — never array indices for dynamic lists. Missing keys cause subtle reconciliation bugs.
5. **Over-rendering**: Measure before optimizing. Use React DevTools Profiler, not guesswork. `React.memo` is a last resort, not a first instinct.

## Testing

- **React Testing Library** (not Enzyme) — test behavior, not implementation details.
- Query by role, label, text — never by class name or test ID unless necessary.
- Use `userEvent` (not `fireEvent`) for realistic user interactions.
- Use MSW (Mock Service Worker) for API mocking — intercepts at the network level.
- Test custom hooks with `renderHook` from `@testing-library/react`.
- Async assertions: `await screen.findByText('Loaded')` or `waitFor(() => expect(...))`.

## Performance

- Code-split routes with `React.lazy` and `Suspense`.
- Use `React.memo` sparingly and only after profiling shows wasted renders.
- Virtualize long lists with `@tanstack/react-virtual` or `react-window`.
- Avoid creating new objects/arrays in render: `style={{ color: 'red' }}` on every render defeats memoization.
- Use `useTransition` for non-urgent state updates in React 18+.
