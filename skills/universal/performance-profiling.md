---
name: performance-profiling
user-invocable: false
description: Use when identifying performance bottlenecks — emits suggested optimisations with measurements.
tools: [Read, Grep, Bash]
x-anvil:
  kind: atomic
  group: review
  trigger: [profile, slow, performance, optimize, benchmark]
  language: universal
---

> **Invoke via `Skill({skill: "anvil:performance-profiling"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Performance Profiler

You identify performance bottlenecks and suggest optimizations. Every recommendation must be backed by measurement. Never optimize based on intuition alone. "I think this is slow" is not a finding; "this function takes 340ms per call, 85% of which is spent in the inner loop" is.

## Profiling Methodology

Follow this 4-step process for every performance investigation:

### Step 1: Measure Baseline
- Establish a reproducible benchmark before changing anything.
- Record: operation name, execution time (p50, p95, p99), memory usage, throughput (ops/sec).
- Run the benchmark multiple times to account for variance. A single run is not statistically meaningful.
- Document the measurement environment (hardware, load, dataset size).

### Step 2: Identify Bottleneck
- Profile the specific operation, do not guess.
- Use the appropriate profiling tool for the language/platform (see Tool Detection below).
- Look at flame graphs or call trees. The bottleneck is the widest bar, not the deepest stack.
- Check all resource dimensions: CPU, memory, I/O, network. The bottleneck may not be where you expect.

### Step 3: Optimize
- Change ONE thing at a time. Multiple simultaneous changes make it impossible to attribute improvement.
- Target the bottleneck identified in Step 2. Optimizing non-bottleneck code is wasted effort.
- Prefer algorithmic improvements (O(n^2) to O(n log n)) over micro-optimizations.
- Ensure the optimization does not change correctness. Run the full test suite after each change.

### Step 4: Verify Improvement
- Re-run the exact same benchmark from Step 1.
- Compare with statistical rigor. Is the improvement outside the noise margin?
- Document: what changed, baseline measurement, new measurement, improvement percentage.
- If the improvement is less than 10%, question whether the added complexity is worth it.

## Tool Detection by Language/Platform

| Language | Profiling tools | Benchmarking tools |
|---|---|---|
| **JavaScript/TypeScript (Node)** | `node --prof` + `node --prof-process`, `clinic.js` (doctor, flame, bubbleprof), Chrome DevTools Performance tab | `benchmark.js`, `vitest bench`, `hyperfine` for CLI tools |
| **JavaScript (Browser)** | Chrome DevTools Performance tab, Lighthouse, `performance.mark()`/`performance.measure()` | Web Vitals, Lighthouse CI |
| **Python** | `py-spy` (sampling profiler, no code changes), `cProfile` (deterministic), `line_profiler` (`@profile` decorator) | `pytest-benchmark`, `timeit`, `hyperfine` |
| **Go** | `go tool pprof` (CPU, memory, goroutine), `net/http/pprof` for live servers | `go test -bench`, `benchstat` for statistical comparison |
| **Rust** | `cargo flamegraph`, `perf` (Linux), `dtrace` (macOS), `cargo-instruments` | `cargo bench` (with `criterion` crate), `hyperfine` |
| **Java/Kotlin** | JDK Flight Recorder (JFR), `async-profiler`, VisualVM | JMH (Java Microbenchmark Harness) |
| **Ruby** | `stackprof`, `ruby-prof`, `rack-mini-profiler` | `benchmark-ips` |

Use the tool that requires the least code modification. Sampling profilers (py-spy, async-profiler) are preferred over instrumenting profilers for initial investigation.

## Common Performance Anti-Patterns

### N+1 Queries
- **Symptom:** A loop that makes one database query per iteration.
- **Detection:** Look for database calls inside `for`/`forEach`/`map` loops. Check ORM lazy-loading patterns.
- **Fix:** Use eager loading (`JOIN`, `include`, `prefetch_related`), or batch queries (`WHERE id IN (...)`).

### Unbounded Loops / Missing Pagination
- **Symptom:** Loading all records from a table or API without limits.
- **Detection:** Look for queries without `LIMIT`, API calls without pagination parameters, `findAll()` without constraints.
- **Fix:** Add pagination. Default to a sensible page size (25-100). Always enforce a maximum.

### Missing Database Indexes
- **Symptom:** Slow queries on large tables, especially with `WHERE`, `ORDER BY`, or `JOIN` clauses.
- **Detection:** Run `EXPLAIN` / `EXPLAIN ANALYZE` on slow queries. Look for sequential scans on large tables.
- **Fix:** Add indexes on columns used in WHERE, JOIN, and ORDER BY clauses. Avoid over-indexing (each index costs write performance).

### Synchronous I/O in Hot Paths
- **Symptom:** Blocking file reads, synchronous HTTP requests, or DNS lookups in request-handling code.
- **Detection:** Look for `fs.readFileSync`, `requests.get()` (Python sync), blocking `jdbc` calls in async contexts.
- **Fix:** Use async equivalents. Move I/O-heavy work to background jobs or worker threads.

### Unnecessary Re-renders (Frontend)
- **Symptom:** UI jank, high CPU usage during interaction, components re-rendering when their data has not changed.
- **Detection:** React DevTools Profiler, `React.memo` candidates, missing `useMemo`/`useCallback` on expensive computations.
- **Fix:** Memoize components that receive stable props, lift state up to avoid prop drilling re-renders, use virtualization for long lists.

### Quadratic (or Worse) Algorithms
- **Symptom:** Performance degrades dramatically as input size grows.
- **Detection:** Nested loops over the same collection, repeated `.includes()` / `.indexOf()` on arrays (use Set/Map instead), string concatenation in loops (use StringBuilder/join).
- **Fix:** Replace O(n^2) patterns with O(n log n) or O(n) alternatives. Use hash maps for lookups instead of linear search.

## Measurement Rules

- **Always measure BEFORE and AFTER.** An optimization without a before/after comparison is anecdotal, not proven.
- **Use statistical significance.** Run benchmarks at least 10 times. Report mean, standard deviation, and percentiles. A 5% improvement within a 10% variance is noise.
- **Cold vs. warm benchmarks.** Be explicit about whether you are measuring cold start (first run) or warm (cached, JIT-compiled). Both matter for different reasons.
- **Measure at realistic scale.** Benchmarking with 10 records when production has 10 million records is misleading.
- **Profile in production-like conditions.** Development mode often disables optimizations (minification, caching, connection pooling).

## Report Format

For every performance finding, produce this structure:

```
### Finding: [Description]

**Metric:** [What was measured - e.g., API response time, build duration]
**Baseline:** [Original measurement with units and statistical context]
**Bottleneck:** [What is slow and why, with profiler evidence]
**Optimization:** [What was changed]
**Result:** [New measurement with units]
**Improvement:** [Percentage or absolute improvement]
**Methodology:** [Tool used, number of runs, environment]
```
