---
name: ruby-coding
user-invocable: false
description: 'Use when implementing or modifying Ruby code — idiomatic Ruby, blocks, enumerables, rubocop.'
tools: [Read, Write, Edit, Grep, Glob, Bash]
x-anvil:
  kind: atomic
  group: development
  trigger: [ruby, rb, implement]
  language: ruby
---

> **Invoke via `Skill({skill: "anvil:ruby-coding"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Ruby Developer

Idiomatic Ruby on 3.x+. Prefer blocks and Enumerable methods over manual loops. Guard clauses over nested conditionals. All code passes RuboCop with project config.

## Idioms and Patterns

- Use `each`, `map`, `select`, `reject`, `reduce` — never write `for` loops.
- Prefer `&:method_name` shorthand: `users.map(&:name)` not `users.map { |u| u.name }`.
- Use blocks for resource management: `File.open(path) { |f| f.read }` auto-closes.
- Understand procs vs lambdas: lambdas check arity and `return` exits the lambda; procs don't.
- Use `freeze` on string constants: `SEPARATOR = ",".freeze` to prevent mutation.
- Prefer `Symbol#to_proc` and duck typing over `is_a?` checks.
- Use `Struct` or `Data` (Ruby 3.2+) for simple value objects instead of full classes.
- Use `then`/`yield_self` for pipeline-style transformations.

## Tool Detection

- `Gemfile` / `Gemfile.lock` → Bundler for dependency management.
- `.rubocop.yml` → RuboCop for linting and formatting. Run `rubocop -a` for autocorrect.
- `Rakefile` → Rake for task automation.
- `.ruby-version` / `.tool-versions` → version management (rbenv / asdf).
- `config.ru` → Rack-based web application (Rails, Sinatra, Hanami).

## Common Pitfalls

1. **Monkey patching**: Never reopen core classes (`String`, `Array`) in application code. Use Refinements if you must extend core classes.
2. **`method_missing` abuse**: Always define `respond_to_missing?` alongside it. Prefer explicit method definitions or `define_method` over `method_missing`.
3. **Mutable string surprise**: Strings are mutable by default. Use `# frozen_string_literal: true` magic comment at the top of every file.
4. **Implicit return confusion**: The last expression is the return value. Be intentional — don't accidentally return a hash assignment or `puts` (which returns `nil`).
5. **Thread safety**: Avoid shared mutable state. Ruby's GVL does not protect against race conditions in I/O-bound concurrent code. Use `Mutex`, `Concurrent::Hash`, or Ractors (Ruby 3+).

## Testing

- **RSpec** preferred: `describe` for the class/method, `context` for scenarios, `it` for assertions.
- Use `let` (lazy) and `let!` (eager) for test data setup. Avoid instance variables in tests.
- Use `factory_bot` for building test objects — never fixtures for complex data.
- Use `shoulda-matchers` for one-liner model/controller validations.
- Use `simplecov` for coverage reporting. Aim for meaningful coverage, not 100%.
- Use `webmock` or `vcr` for HTTP stubbing — never hit external APIs in tests.
- Name test files `*_spec.rb` in `spec/` directory mirroring `lib/` or `app/` structure.

## Metaprogramming

- Use sparingly and only when it eliminates significant duplication.
- Prefer `define_method` over `eval`-based metaprogramming.
- Always document dynamically generated methods with YARD `@!method` directives.
- `class_eval` and `instance_eval` are code smells in application code — acceptable in DSLs and frameworks.

## Project Structure

- **Gems**: `lib/<gem_name>/` for source, `spec/` for tests, `<gem_name>.gemspec` at root.
- **Rails**: `app/models/`, `app/controllers/`, `app/services/`, `spec/` for tests.
- **Service objects**: Extract complex business logic into `app/services/` — keep models and controllers thin.
- Keep `Gemfile` organized by group (`:development`, `:test`, `:production`).
