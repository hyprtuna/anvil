---
name: csharp-coding
user-invocable: false
description: 'Use when implementing or modifying C# / .NET code — modern C#, nullable reference types, async/await, EF Core.'
tools: [Read, Write, Edit, Grep, Glob, Bash]
x-anvil:
  kind: atomic
  group: development
  trigger: [csharp, c#, dotnet, .net, aspnet]
  language: csharp
---

> **Invoke via `Skill({skill: "anvil:csharp-coding"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# C# / .NET Developer

Modern C# on .NET 8+. Nullable reference types enabled project-wide. Treat nullable warnings as errors. Async all the way down.

## Language Version

- Target C# 12+ features: primary constructors, collection expressions, `required` members.
- Use file-scoped namespaces (`namespace Foo;` not `namespace Foo { }`).
- Prefer pattern matching (`is`, `switch` expressions) over type checks and casts.
- Use `record` types for immutable data, `record struct` for small value types.
- Use `global using` directives in a single `GlobalUsings.cs` to reduce per-file noise.

## Nullable Reference Types

- `<Nullable>enable</Nullable>` in every `.csproj`. No exceptions.
- Treat `CS8600`..`CS8605` warnings as errors (`<TreatWarningsAsErrors>true</TreatWarningsAsErrors>`).
- Use `[NotNullWhen]`, `[MemberNotNull]`, and `[MaybeNullWhen]` attributes to express contracts.
- Never suppress nullable warnings with `!` (null-forgiving operator) unless the intent is documented.

## Async / Await

- Every I/O method is `async Task<T>`. Never use `.Result` or `.Wait()` — deadlocks lurk.
- Accept `CancellationToken` as the last parameter on all async public APIs.
- Use `ConfigureAwait(false)` in library code (not needed in ASP.NET Core top-level).
- Prefer `ValueTask<T>` for hot paths that usually complete synchronously.
- Use `IAsyncEnumerable<T>` for streaming results from database queries or HTTP responses.

## Entity Framework Core

- One `DbContext` per unit of work (scoped lifetime in DI).
- Define entity configurations in `IEntityTypeConfiguration<T>` classes, not in `OnModelCreating`.
- Always use migrations (`dotnet ef migrations add <Name>`) — never hand-edit the database schema.
- Prefer `.AsNoTracking()` for read-only queries.
- Use `ExecuteUpdateAsync` / `ExecuteDeleteAsync` for bulk operations (EF Core 7+).
- Write LINQ queries that translate to SQL — verify with `.ToQueryString()` in development.

## API Patterns

- Minimal APIs for lightweight endpoints; controller-based for complex domains.
- Always return `Results.Ok()` / `Results.NotFound()` / `Results.Problem()` — never throw from endpoints.
- Use `TypedResults` for OpenAPI metadata generation.
- Validate incoming DTOs with FluentValidation or `[Required]` / `[Range]` data annotations.
- Use `IResult` filter pipelines for cross-cutting concerns (auth, logging, validation).

## Dependency Injection

- Constructor injection only — no service locator (`IServiceProvider.GetService<T>()` in app code).
- Register services with the correct lifetime: `Transient` for stateless, `Scoped` for per-request, `Singleton` for shared state.
- Use `IOptions<T>` / `IOptionsSnapshot<T>` for configuration binding.
- Prefer interface segregation: inject `IEmailSender`, not `SmtpEmailService`.

## Testing

- xUnit for test framework. One test class per production class.
- FluentAssertions for readable assertions (`result.Should().BeEquivalentTo(expected)`).
- NSubstitute for mocking interfaces — never mock concrete classes.
- Use `WebApplicationFactory<Program>` for integration testing ASP.NET Core APIs.
- Test database interactions against a real database (SQLite in-memory or Testcontainers).
- Name tests: `MethodName_Scenario_ExpectedResult`.

## Project Structure

- One `.sln` at repo root. One `.csproj` per bounded context or layer.
- Follow clean architecture layers: `Domain` -> `Application` -> `Infrastructure` -> `Api`.
- Keep `Domain` free of framework dependencies (no EF Core, no ASP.NET references).
- Use `Directory.Build.props` for shared MSBuild properties across projects.
- Run `dotnet format` before committing. Enforce with `.editorconfig`.
