# 📝 Commit Convention Guide

Rules for language, format, body structure, and commit frequency across this monorepo.

---

## 🌐 Language Rule — English Always

**Every commit in this repository must be written in English.**

| Applies to | Example |
|---|---|
| Subject line | `feat: add authentication module` |
| Body bullet points | `- JWT tokens stored in localStorage via Zustand persist` |
| Branch names | `feat/courses-module`, `fix/auth-401-redirect` |
| PR titles and descriptions | `Add courses CRUD with in-memory and Prisma repositories` |
| Inline code comments (when needed) | `// skip validation for memory repo` |

**Why English:** This is a public template on GitHub. English history is readable by any collaborator worldwide, maximizes discoverability on GitHub search, and is the standard in open-source. It also signals professionalism to anyone evaluating the project as a base for their own work.

---

## 📐 Format — Conventional Commits

```
<type>(<optional scope>): <short description in lowercase> — <optional context>

<optional body: one paragraph or bullet list>
```

### Types

| Type | When to use |
|---|---|
| `feat` | New feature, endpoint, page, or component |
| `fix` | Bug fix |
| `refactor` | Code restructure with no behavior change |
| `test` | Adding or fixing tests |
| `docs` | README, guides, comments |
| `chore` | Config, deps, CI, tooling |
| `style` | Formatting only (no logic change) |
| `perf` | Performance improvement |

### Scopes (optional but recommended)

| Scope | Use for |
|---|---|
| `backend` | Changes only inside `backend-express/` |
| `frontend` | Changes only inside `frontend/` |
| `auth` | Auth module specifically |
| `items` | Items module specifically |
| `db` | Prisma schema or repository changes |
| `ci` | GitHub Actions / CI config |

---

## ✍️ Subject Line Rules

- Lowercase after the colon
- No period at the end
- Max 72 characters
- Use `—` (em dash) to add context when helpful: `feat: initial release — express + react starter`
- Imperative mood: "add" not "added", "fix" not "fixed"

---

## 📋 Body Rules (when needed)

Use a body when the subject alone does not explain *what changed or why*. Skip it for simple, self-explanatory commits.

**Structure:**
1. One-line summary sentence (optional) describing the overall change.
2. Bullet list with the specific changes — keep each item to one line.

```
feat: initial release — express + react starter template

Production-ready full-stack boilerplate for building modern web applications.

- React 19 + Vite + TypeScript + Tailwind CSS frontend
- Express.js + TypeScript + Prisma + MongoDB backend (in-memory fallback)
- JWT authentication with persistent session (Zustand + localStorage)
- Clean layered architecture: Routes → Controller → Service → Repository
- Dual repositories: Prisma (MongoDB) + in-memory (zero-config dev/tests)
- Vitest + Supertest integration and unit tests
- Helmet, CORS, rate limiting, compression out of the box
- React Hook Form + Zod validation on both frontend and backend
- TanStack Query v5 + Axios with base hooks (useApiGet / useApiSend)
```

---

## 💡 Real Examples for This Project

### Adding a new module (most common operation)

```
feat(backend): add courses module with CRUD and dual repositories

- courses.schema.ts — Zod create/update schemas
- courses.service.ts — business logic with AppError on invalid input
- courses.controller.ts — asyncHandler-wrapped endpoints
- courses.routes.ts — POST, GET, PATCH /:id, DELETE /:id
- courses.memory-repository.ts — in-memory implementation for tests
- courses.prisma-repository.ts — MongoDB persistence via Prisma
- registered in src/config/repositories.ts and src/routes/index.ts
```

### Adding a frontend page for that module

```
feat(frontend): add courses page with list, create form and delete action

- src/api/urls/courses.ts — typed endpoints (getAll, create, remove)
- src/lib/schemas/course.schema.ts — Zod form validation schema
- src/pages/Courses/CoursesPage.tsx — lazy-loaded list + modal
- src/routes/Routes.tsx — /courses route under ProtectedRoute
- useApiGet / useApiSend wired with automatic cache invalidation
```

### Bug fix

```
fix(auth): redirect to /login on 401 even when response has no body

Axios response interceptor was only checking `error.response.status`
but some proxy responses send 401 with no JSON body, causing an
uncaught TypeError before the logout could run.
```

### Extending the Prisma schema

```
feat(db): add Course model to Prisma schema

- Course: id (ObjectId), title (String), description (String?), createdAt, updatedAt
- ran prisma db push to sync with MongoDB Atlas
```

### Adding tests

```
test(backend): add integration and unit tests for courses module

- tests/integration/courses.test.ts — CRUD via Supertest + memory repo
- tests/unit/courses.service.test.ts — service layer with fake repository
- covers auth guard, 404 on missing id, and Zod validation rejection
```

### Documentation

```
docs: add COMMIT_GUIDE to .skills with examples for this project
```

### Dependency update

```
chore: upgrade Prisma to 6.x and regenerate client
```

---

## 📅 Commit Frequency

| Goal | Cadence |
|---|---|
| Maintain visible GitHub activity | At least 3–5 commits per week |
| Ideal for template evolution | 1 commit per logical change, same day |
| Avoid | Large "mega commits" that bundle unrelated changes |

**Rule of thumb:** if you cannot describe a commit in one sentence, it contains too much. Split it.

Each commit should leave the project in a working state — never commit a half-implemented module without at least the in-memory repository and basic route wired up.

---

## Instruction for the AI Model

> "All commit messages generated for this repository must be in English, follow Conventional Commits format, and include a descriptive body when the change involves more than one file or a non-obvious decision. Never write commit messages in Spanish or any language other than English. Use the examples in this guide as reference for the body structure."
