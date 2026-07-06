---
name: cpp-coding
user-invocable: false
description: 'Use when implementing or modifying modern C++ code — C++20/23, RAII, smart pointers, CMake, value semantics.'
tools: [Read, Write, Edit, Grep, Glob, Bash]
x-anvil:
  kind: atomic
  group: development
  trigger: [cpp, c++, cmake, clang]
  language: cpp
---

> **Invoke via `Skill({skill: "anvil:cpp-coding"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Modern C++ Developer

C++20 minimum, C++23 where supported. RAII everywhere. No manual `new`/`delete`. Value semantics by default. `const` by default. Sanitizers in CI.

## Language Standard

- Target C++20 as baseline: concepts, ranges, coroutines, `std::format`, three-way comparison.
- Use C++23 features when the toolchain supports them: `std::expected`, `std::print`, deducing `this`, `std::flat_map`.
- Set the standard in CMake: `set(CMAKE_CXX_STANDARD 20)` with `CMAKE_CXX_STANDARD_REQUIRED ON`.
- Enable `-Wall -Wextra -Wpedantic -Werror` in debug builds. Use `/W4 /WX` on MSVC.

## RAII and Resource Management

- Every resource (memory, file handle, socket, lock) is owned by an RAII wrapper.
- No raw `new` / `delete`. Use `std::make_unique<T>()` and `std::make_shared<T>()`.
- Prefer `std::unique_ptr` for single ownership, `std::shared_ptr` only when ownership is genuinely shared.
- Use `std::span<T>` for non-owning views into contiguous memory.
- Follow the Rule of Zero: if your class manages no resources directly, declare no special members.
- Follow the Rule of Five only when writing low-level resource wrappers.

## Value Semantics and Const Correctness

- Prefer value types over pointer/reference types. Pass small types by value, large types by `const&`.
- Return by value — rely on copy elision (NRVO) and move semantics.
- Mark everything `const` unless mutation is required: variables, member functions, parameters.
- Use `constexpr` and `consteval` for compile-time computation where possible.
- Prefer `enum class` over plain `enum` for type safety.

## Move Semantics

- Implement move constructors and move assignment for types that manage resources.
- Use `std::move` to transfer ownership — but never `std::move` a `const` object.
- After moving from an object, leave it in a valid but unspecified state.
- Prefer pass-by-value + `std::move` for sink parameters: `void setName(std::string name) { m_name = std::move(name); }`.

## CMake Build System

- One top-level `CMakeLists.txt`. Use `add_subdirectory()` for sub-projects.
- Define libraries as targets with `target_include_directories`, `target_link_libraries`, `target_compile_features`.
- Use `find_package()` for external dependencies. Prefer CMake config-mode packages.
- Use FetchContent or vcpkg/Conan for dependency management — never vendor source manually.
- Separate `PUBLIC`, `PRIVATE`, and `INTERFACE` properties on targets.
- Generate `compile_commands.json` for IDE and clang-tidy support: `set(CMAKE_EXPORT_COMPILE_COMMANDS ON)`.

## Error Handling

- Use `std::expected<T, E>` (C++23) for functions that can fail — return errors as values.
- Use exceptions only at architectural boundaries (main, API entry points, framework callbacks).
- Never throw in destructors. Never throw in `noexcept` functions.
- Use `std::error_code` / `std::system_error` for OS-level error propagation.
- Prefer `[[nodiscard]]` on functions returning error indicators to prevent silent drops.

## Concepts and Templates

- Constrain templates with concepts: `template<std::integral T>` instead of unconstrained `template<typename T>`.
- Write custom concepts for domain-specific constraints.
- Use `requires` clauses for complex constraints.
- Prefer `auto` return types with trailing return types for complex expressions.
- Use `if constexpr` for compile-time branching instead of SFINAE or tag dispatch.

## Testing

- GoogleTest (`gtest`) or Catch2 for unit testing. Pick one per project.
- Use `TEST` / `TEST_F` (GoogleTest) or `TEST_CASE` / `SECTION` (Catch2) for structure.
- Test edge cases: empty containers, null pointers, integer overflow, move-from state.
- Use GoogleMock or trompeloeil for mocking interfaces.
- Run tests under sanitizers: `-fsanitize=address,undefined` in CI.

## Memory Safety

- Enable AddressSanitizer (`-fsanitize=address`) and UndefinedBehaviorSanitizer (`-fsanitize=undefined`) in CI.
- Run Valgrind memcheck for leak detection when sanitizers are unavailable.
- Use `clang-tidy` with `modernize-*`, `bugprone-*`, `performance-*`, `cppcoreguidelines-*` checks.
- Prefer `std::array` over C arrays, `std::string_view` over `const char*`.
- Use `std::ranges` algorithms over raw pointer arithmetic.
- Never cast away `const`. Avoid `reinterpret_cast` outside serialization boundaries.
