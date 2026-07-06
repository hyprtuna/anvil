---
name: django-coding
user-invocable: false
description: 'Use when implementing or modifying Django apps — CBVs, Django ORM, migrations, split settings.'
tools: [Read, Write, Edit, Grep, Glob, Bash]
x-anvil:
  kind: atomic
  group: development
  trigger: [django, implement]
  language: django
---

> **Invoke via `Skill({skill: "anvil:django-coding"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Django Developer

Django 4.2+ / 5.x. Fat models, thin views. Django ORM for all queries. Migrations for every schema change. Settings split by environment. Class-based views as default, function-based views when they are clearly simpler.

## Tool Detection

- `manage.py` at root → Django project.
- `requirements.txt` / `pyproject.toml` / `Pipfile` → dependency management.
- `settings.py` or `settings/` directory → configuration (check for split settings: `base.py`, `dev.py`, `prod.py`).
- `.env` → `django-environ` or `python-decouple` for secret management.
- `urls.py` → URL routing (check for `path()` modern syntax vs deprecated `url()`).

## ORM Patterns

- Querysets are lazy — they don't hit the database until evaluated (iteration, `list()`, slicing, `len()`).
- Use `select_related('fk_field')` for foreign key joins (single query). Use `prefetch_related('m2m_field')` for many-to-many and reverse relations (separate query).
- Use `F()` expressions for database-level operations: `Entry.objects.update(views=F('views') + 1)`.
- Use `Q()` objects for complex OR/AND queries: `Q(status='published') | Q(author=user)`.
- Use `.only('field1', 'field2')` or `.defer('large_field')` to limit columns on large models.
- Use `.values()` / `.values_list()` when you need dictionaries or tuples, not full model instances.
- Use `bulk_create`, `bulk_update` for batch operations — never loop with `.save()`.
- Migrations via `makemigrations` then `migrate`. Never edit migration files unless squashing.

## View Patterns

- Class-based views (CBVs) for standard CRUD: `ListView`, `DetailView`, `CreateView`, `UpdateView`, `DeleteView`.
- Function-based views (FBVs) for simple one-off endpoints, webhooks, and complex conditional logic.
- Use `LoginRequiredMixin` / `@login_required` on every view that needs authentication.
- For APIs: Django REST Framework — serializers, viewsets, and routers.
- Use `get_object_or_404` — never catch `DoesNotExist` manually in views.

## Common Pitfalls

1. **N+1 queries**: Accessing related objects in loops without `select_related` / `prefetch_related`. Use `django-debug-toolbar` to spot them in development.
2. **Raw SQL when ORM works**: The ORM handles 95% of queries. Use `raw()` or `connection.cursor()` only for truly complex SQL that the ORM cannot express.
3. **Mutable default arguments**: `def my_view(request, items=[])` shares the list across calls. Use `None` and initialize inside the function.
4. **Circular imports between apps**: If app A imports from app B and vice versa, restructure. Use string references in ForeignKey: `ForeignKey('appname.ModelName')`.
5. **Fat views**: Business logic belongs in models (methods, managers, querysets) or service modules — not in views or serializers.

## Testing

- Use `django.test.TestCase` (wraps each test in a transaction rollback) for database tests.
- `RequestFactory` for unit-testing views without middleware. `Client` for integration tests with full request/response cycle.
- Use `factory_boy` with `DjangoModelFactory` for test data — not fixtures.
- `override_settings` decorator for tests that depend on specific settings.
- Test URLs resolve correctly: `reverse('app:view-name')` in every test that hits an endpoint.
- Run tests with `pytest-django` for better output and fixtures.

## Project Structure

- One Django project, multiple apps. Each app is a bounded context (users, orders, payments).
- Keep apps small and focused. If an app has 20+ models, split it.
- `app/models.py` → domain models. `app/views.py` → request handling. `app/urls.py` → routing. `app/admin.py` → admin configuration.
- Extract business logic into `app/services.py` or `app/selectors.py` — keeps models and views clean.
- `templates/<app_name>/` for app-specific templates. `static/<app_name>/` for static files.

## Security

- CSRF protection is on by default — never disable it. Use `{% csrf_token %}` in all forms.
- Use `django.contrib.auth` for authentication. Never roll your own password hashing.
- Validate and sanitize all user input. Use form/serializer validation, not manual checks.
- Split settings: `DEBUG = False` in production, `ALLOWED_HOSTS` explicitly set, `SECRET_KEY` from environment.
- Use `django.middleware.security.SecurityMiddleware` and set `SECURE_SSL_REDIRECT`, `SECURE_HSTS_SECONDS` in production.
