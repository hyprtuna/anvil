---
name: java-coding
user-invocable: false
description: 'Use when implementing or modifying modern Java code — Java 21+, records, sealed classes, no null.'
tools: [Read, Write, Edit, Grep, Glob, Bash]
x-anvil:
  kind: atomic
  group: development
  trigger: [java, implement]
  language: java
---

> **Invoke via `Skill({skill: "anvil:java-coding"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Java Developer

Modern Java (17+). Records for value types. Sealed classes for closed hierarchies. No null where `Optional` works. Maven or Gradle based on project config.

## Tool Detection

- `pom.xml` present -> Maven project. Use `mvn compile`, `mvn test`, `mvn package`.
- `build.gradle` or `build.gradle.kts` -> Gradle project. Use `./gradlew build`, `./gradlew test`.
- `.mvn/` directory -> Maven wrapper present; prefer `./mvnw` over system `mvn`.
- `gradlew` script present -> use `./gradlew` over system `gradle`.
- Check `pom.xml` `<java.version>` or `build.gradle` `sourceCompatibility` for the target Java version.

## Modern Java Features (17+)

- **Records**: Use for immutable data carriers. `record Point(int x, int y) {}` replaces boilerplate POJOs.
- **Sealed classes**: `sealed interface Shape permits Circle, Rectangle {}` for closed type hierarchies.
- **Pattern matching**: `if (obj instanceof String s)` — no cast needed. Use in switch expressions.
- **Text blocks**: Triple-quoted `"""` strings for JSON, SQL, multi-line content. Preserve indentation with `.stripIndent()`.
- **Switch expressions**: `var result = switch (day) { case MON -> "start"; default -> "other"; };` — prefer over statement switches.

## Null Safety

- Return `Optional<T>` instead of null from methods. Never use `Optional` as a method parameter or field.
- Use `Optional.map()`, `.flatMap()`, `.orElseThrow()` — never `.get()` without `.isPresent()` check.
- Annotate with `@NonNull` / `@Nullable` (from JetBrains, Eclipse, or Jakarta) for IDE and static analysis support.
- Collections should never be null — return empty collections (`List.of()`, `Map.of()`, `Collections.emptyList()`).

## Common Pitfalls

- **null returns**: Returning null forces callers to null-check. Use `Optional` or throw a domain exception.
- **Checked exception overuse**: Don't declare `throws Exception`. Use unchecked exceptions for programming errors, checked only for recoverable conditions.
- **Mutable collections by default**: `new ArrayList<>(List.of(...))` if mutation is needed; prefer `List.of()`, `Map.of()` for immutable.
- **equals/hashCode contract**: Always override both together. Use `Objects.equals()` and `Objects.hash()`. Records handle this automatically.
- **Resource leaks**: Always use try-with-resources for `AutoCloseable` types (`InputStream`, `Connection`, `PreparedStatement`).

## Dependency Injection

- Constructor injection only. Final fields. No `@Autowired` on fields.
- Prefer `record`-style constructors: all dependencies as constructor parameters, assigned to final fields.
- Use `@Component`, `@Service`, `@Repository` for Spring-managed beans. `@Configuration` + `@Bean` for third-party types.
- Interface segregation: inject `UserRepository`, not `UserRepositoryImpl`.

## Streams and Collections

- Prefer streams for collection transformations: `.stream().filter().map().collect()`.
- Avoid side effects in stream pipelines. No `.forEach()` with mutation — use a for-loop instead.
- Use `Collectors.toUnmodifiableList()`, `Collectors.toUnmodifiableMap()` for immutable results.
- For simple cases, prefer `List.of()`, `Map.of()`, `Set.of()` over streams.

## Testing

- JUnit 5 (`@Test`, `@DisplayName`, `@Nested`) for test structure.
- AssertJ for fluent assertions: `assertThat(result).isEqualTo(expected)`, `assertThat(list).hasSize(3).contains("a")`.
- `@ParameterizedTest` with `@ValueSource`, `@CsvSource`, `@MethodSource` for data-driven tests.
- Mockito for mocking: `@Mock`, `@InjectMocks`, `when(...).thenReturn(...)`. Never mock value objects.
- Testcontainers for integration tests with real databases, message brokers, etc.
- Name tests descriptively: `shouldReturnEmptyWhenUserNotFound()`, not `testGetUser()`.

## Project Structure

- Maven standard layout: `src/main/java/`, `src/main/resources/`, `src/test/java/`, `src/test/resources/`.
- Package naming: `com.company.project.module` — reverse domain, lowercase, no underscores.
- One public class per file. File name matches class name exactly.
- Keep `main()` thin: bootstrap the framework (Spring Boot `SpringApplication.run()`), nothing else.
- Multi-module projects: parent `pom.xml` with `<modules>`, each module is a separate Maven project.

## Safety Rules

1. **`Optional<T>` not null** — return `Optional` from finder methods; use `.map()`, `.orElseThrow()`, never `.get()` without `.isPresent()`. Never use `Optional` as a field type or method parameter.
2. **Records for value types** — use `record OrderSummary(Long id, BigDecimal total) {}` instead of boilerplate POJOs; records enforce immutability automatically.
3. **Sealed classes for closed hierarchies** — `sealed interface PaymentMethod permits CreditCard, BankTransfer {}` makes switch exhaustiveness checkable at compile time.
4. **Constructor injection only** — `@Autowired` on constructor, not on fields. Final fields. One constructor per component.
5. **Parameterized queries always** — use `PreparedStatement` or a query-builder API. Never concatenate user input into SQL strings.
6. **Try-with-resources for `AutoCloseable`** — every `InputStream`, `Connection`, and `PreparedStatement` must be wrapped in a `try` resource block.
7. **Domain exceptions extend `RuntimeException`** — include the ID or key in the message (`"Order not found: id=" + id`); never catch-and-swallow without logging.
8. **Immutable collections by default** — use `List.of()`, `Map.of()`, `Set.of()`; create a mutable copy only when mutation is needed.
9. **Secrets from environment variables** — `System.getenv("API_KEY")` validated at startup with `Objects.requireNonNull`.
10. **Dependency scanning** — use OWASP Dependency-Check or Snyk in CI; run `mvn dependency:tree` to audit transitive deps.

## Anti-patterns

- Returning `null` from methods — use `Optional` or throw a domain exception.
- `@Autowired` on fields — breaks testability; use constructor injection.
- `catch (Exception e) {}` swallowing exceptions silently.
- `new ArrayList<>()` when `List.of()` suffices — prefer immutable unless mutation is required.
- Stack traces or SQL errors in API responses — log server-side; surface generic messages to clients.
- `equals` without `hashCode` (and vice versa) — override both together or use `record`.
- Broad `throws Exception` on method signatures — declare specific checked exceptions or switch to unchecked.
