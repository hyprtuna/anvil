---
name: java-patterns-rules
user-invocable: false
description: 'Use when editing Java code — Optional over null, streams over loops where natural, immutability by default, dependency injection via constructor.'
tools: []
paths: ['**/*.java']
license: MIT
x-anvil:
  kind: meta
  group: rules
  language: java
---

> **Invoke via `Skill({skill: "anvil:java-patterns-rules"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Java Patterns

**Announce:** I'm using the java-patterns-rules skill to inject Java pattern guidance for this edit.

## Status

Ready to apply.

## Rules

- **`Optional<T>` for absence at API boundaries** — never return `null` from a public method; never accept `null` as a meaningful argument value.
- **Streams for declarative pipelines** — use `Stream.map/filter/collect` when the loop body is a pipeline; loops stay for stateful or short-circuit logic.
- **Immutability by default** — `final` fields, immutable collections (`List.copyOf`, `Map.copyOf`), records over mutable POJOs.
- **Constructor injection** — DI via constructor, never field-level `@Autowired` (Spring) or setter injection. Constructor params declare the dependency contract.
- **Builder pattern for >3 ctor params** — beyond 3 parameters, hand-rolled builder or `record` + factory method.
- **Don't extend; compose or use interfaces** — concrete inheritance is the last resort; favor `default` methods on interfaces and explicit composition.
- **Pattern matching for type tests** — `switch (x) { case Foo f -> ... case Bar b -> ... }` over `instanceof` chains.
- **Try-with-resources for `Closeable`** — never manual `try/finally` for resources.

## Why

Returning `null` forces every caller to either check or risk NPE — `Optional` makes presence explicit at the type level. Field injection hides dependencies and prevents `final` fields, which is half the point of immutable services. Pattern matching is exhaustive when the input is a sealed type. Try-with-resources guarantees release even on exception.

## Done — status: DONE
