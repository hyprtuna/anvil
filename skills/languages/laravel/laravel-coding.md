---
name: laravel-coding
user-invocable: false
description: 'Use when implementing or modifying Laravel apps — Eloquent, resource controllers, form requests, policies.'
tools: [Read, Write, Edit, Grep, Glob, Bash]
x-anvil:
  kind: atomic
  group: development
  trigger: [laravel, eloquent, artisan]
  language: laravel
---

> **Invoke via `Skill({skill: "anvil:laravel-coding"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Laravel Developer

Laravel 10+ / 11+. Eloquent ORM for all database access. Resource controllers for CRUD. Form Requests for validation. Policies for authorization. Migrations for every schema change — never ad-hoc database edits.

## Tool Detection

- `composer.json` with `laravel/framework` → Laravel project.
- `artisan` CLI at project root → Laravel (run `php artisan` for available commands).
- `.env` file → environment config (never commit this — `.env.example` is the template).
- `config/` directory → configuration files. `routes/` → route definitions.
- `phpunit.xml` / `phpunit.xml.dist` → PHPUnit config. Check for `pestphp/pest` in `composer.json` for Pest.

## Eloquent ORM

- Define relationships explicitly: `hasMany`, `belongsTo`, `belongsToMany`, `hasOne`, `morphMany`.
- Use eager loading to avoid N+1: `User::with('posts', 'posts.comments')->get()`.
- Use local scopes for reusable query constraints: `scopeActive`, `scopePublished`.
- Accessors and mutators via `Attribute` casts (Laravel 9+): `protected function name(): Attribute { return Attribute::make(get: fn($v) => ucfirst($v)); }`.
- Use `$fillable` or `$guarded` on every model — mass assignment vulnerabilities are real.
- Soft deletes with `SoftDeletes` trait when records should be recoverable.
- Model events (`creating`, `updating`) for side effects — or use Observers for complex logic.
- Use `DB::transaction(fn () => ...)` for operations that must be atomic.

## Controller Patterns

- Resource controllers for standard CRUD: `php artisan make:controller PostController --resource`.
- Keep controllers thin — delegate validation to Form Requests, authorization to Policies, business logic to Service classes.
- Return resources (API Resource classes) for JSON responses, not raw models.
- Use route model binding: `public function show(Post $post)` auto-resolves from the URL.
- Group routes with middleware: `Route::middleware('auth')->group(fn () => ...)`.

## Artisan and Code Generation

- `php artisan make:model Post -mfsc` → model + migration + factory + seeder + controller in one command.
- `php artisan make:request StorePostRequest` → Form Request with `rules()` and `authorize()`.
- `php artisan make:policy PostPolicy --model=Post` → Policy with standard CRUD methods.
- `php artisan migrate:fresh --seed` to reset database in development (never in production).
- `php artisan tinker` for REPL-based debugging and exploration.

## Common Pitfalls

1. **N+1 queries**: Accessing `$post->author->name` in a loop without eager loading. Use `with()` or enable `Model::preventLazyLoading()` in development to catch these.
2. **Fat controllers**: Validation in controllers instead of Form Requests. Authorization inline instead of Policies. Business logic instead of Service classes.
3. **Mass assignment without `$fillable`**: Every model needs `$fillable` (whitelist) or `$guarded` (blacklist). Default is fully guarded — `$fillable = []` means nothing can be mass-assigned.
4. **Raw DB when Eloquent works**: `DB::select('SELECT ...')` bypasses model events, casts, and relationships. Use Eloquent unless the query truly cannot be expressed with the query builder.
5. **Ignoring queues for slow operations**: Email sending, PDF generation, API calls — dispatch these to a queue (`dispatch(new SendInvoice($order))`) instead of running synchronously in the request.

## Testing

- PHPUnit with Laravel's `TestCase` base class — provides `actingAs`, `assertDatabaseHas`, `assertJson`, etc.
- `RefreshDatabase` trait resets the database between tests via transactions.
- Use factories for test data: `Post::factory()->count(3)->create()`.
- **Pest PHP** as alternative: expressive syntax with `it('creates a post', function () { ... })`.
- HTTP tests: `$this->postJson('/api/posts', $data)->assertCreated()->assertJsonStructure([...])`.
- Mock external services with `Http::fake()` and `Queue::fake()` — never hit real APIs in tests.
- Feature tests in `tests/Feature/`, unit tests in `tests/Unit/`.

## Project Structure

- Follow Laravel conventions exactly — the framework rewards convention over configuration.
- `app/Models/` → Eloquent models. `app/Http/Controllers/` → controllers. `app/Http/Requests/` → Form Requests.
- `app/Services/` → business logic classes (not a default directory — create it).
- `app/Policies/` → authorization. `app/Jobs/` → queueable jobs. `app/Events/` + `app/Listeners/` → event system.
- `database/migrations/` → schema changes. `database/factories/` → model factories. `database/seeders/` → seed data.
- `resources/views/` → Blade templates. `routes/web.php` → web routes. `routes/api.php` → API routes.
- `config/` files should read from `.env` via `env()` — never call `env()` outside of config files (values are cached in production).
