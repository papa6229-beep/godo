# AI Operations Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone, publicly editable AI operations dashboard that replaces Google Sheets and shows the approved A·B·C executive report from shared Supabase data.

**Architecture:** Add a separately built React/Vite surface in this repository and deploy it as an independent Vercel project. The browser talks only to `/api/ai-ops/*`; server functions validate requests and use an injected repository backed by Supabase Postgres through the existing `pg` package. Shared pure contracts and aggregation functions keep the API, UI, automatic upsert, and tests on one data definition.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Vercel Functions, Supabase Postgres through `pg`, existing Node smoke-test runner, Browser-based production-build acceptance checks.

## Global Constraints

- The site is independent from the existing GODO AI OS UI and uses its own build output `dist-ai-ops-dashboard`.
- Do not read or write Google Sheets.
- Do not add login, passwords, per-user permissions, notifications, or Godomall automatic collection.
- The public browser never receives `AI_OPS_DATABASE_URL` or any database administrator credential.
- Anyone with the URL may read, create, edit, and delete records; server validation, revision history, delete confirmation, and idempotency remain mandatory.
- Use only verified initial facts; never seed invented progress, dates, or achievements.
- No Production deployment, environment-variable change, main merge, or external WRITE without a new explicit user approval.
- Preserve the unrelated untracked `.superpowers/` directory.

## File Map

### Standalone web surface

- `apps/ai-ops-dashboard/index.html` — independent HTML entry.
- `apps/ai-ops-dashboard/src/main.tsx` — React mount point.
- `apps/ai-ops-dashboard/src/App.tsx` — loading, error, view/edit mode boundary.
- `apps/ai-ops-dashboard/src/styles.css` — approved three-card visual system and responsive layout.
- `apps/ai-ops-dashboard/src/apiClient.ts` — typed `/api/ai-ops/*` calls.
- `apps/ai-ops-dashboard/src/useDashboard.ts` — fetch/save state and stale-request protection.
- `apps/ai-ops-dashboard/src/components/ExecutiveSummaryCard.tsx` — A card.
- `apps/ai-ops-dashboard/src/components/DailyCalendarCard.tsx` — B card.
- `apps/ai-ops-dashboard/src/components/WorkFeedCard.tsx` — C card.
- `apps/ai-ops-dashboard/src/components/EditDrawer.tsx` — direct create/edit/delete UI.
- `apps/ai-ops-dashboard/src/components/StatusNotice.tsx` — loading, success, failure, and empty states.

### Shared domain and server

- `shared/ai-ops-dashboard/contracts.ts` — exact public types and validation result types.
- `shared/ai-ops-dashboard/validation.ts` — work item, settings, timeline validation.
- `shared/ai-ops-dashboard/aggregation.ts` — daily/weekly/monthly counts and A·B·C view model.
- `api/_shared/aiOpsRepository.ts` — repository interface, Postgres implementation, and transaction boundary.
- `api/_shared/aiOpsHandlers.ts` — framework-light handlers with injected repository.
- `api/ai-ops/dashboard.ts` — GET dashboard snapshot.
- `api/ai-ops/work-items.ts` — POST upsert, PATCH update, DELETE soft-delete.
- `api/ai-ops/settings.ts` — PATCH project settings.
- `api/ai-ops/timeline.ts` — PUT timeline weeks.
- `database/ai-ops-dashboard/001_initial.sql` — tables, constraints, indexes.
- `database/ai-ops-dashboard/002_verified_seed.sql` — verified initial records only.

### Build and verification

- `vite.ai-ops-dashboard.config.ts` — independent root/output configuration.
- `tsconfig.ai-ops-dashboard.json` — dashboard surface type boundary.
- `package.json` — `dev:ai-ops-dashboard`, `build:ai-ops-dashboard`, `preview:ai-ops-dashboard`.
- `scripts/smoke-ai-ops-domain-v0.mjs` — validation and aggregation contract.
- `scripts/smoke-ai-ops-api-v0.mjs` — idempotency, revisions, and failure atomicity.
- `scripts/smoke-ai-ops-surface-v0.mjs` — build wiring, copy, and no-secret checks.
- `scripts/regression-manifest.json` — register the three new smoke suites.
- `.env.example` — document variable names only, never values.

---

### Task 1: Isolate the standalone build surface

**Files:**
- Create: `apps/ai-ops-dashboard/index.html`
- Create: `apps/ai-ops-dashboard/src/main.tsx`
- Create: `apps/ai-ops-dashboard/src/App.tsx`
- Create: `apps/ai-ops-dashboard/src/styles.css`
- Create: `vite.ai-ops-dashboard.config.ts`
- Create: `tsconfig.ai-ops-dashboard.json`
- Modify: `package.json`
- Test: `scripts/smoke-ai-ops-surface-v0.mjs`
- Modify: `scripts/regression-manifest.json`

**Interfaces:**
- Produces: `npm run dev:ai-ops-dashboard`, `npm run build:ai-ops-dashboard`, and output folder `dist-ai-ops-dashboard`.
- Does not consume the existing `src/App.tsx` or its routes.

- [ ] **Step 1: Write the failing surface-boundary smoke test**

```js
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
ok('standalone build script exists', packageJson.scripts['build:ai-ops-dashboard'] === 'tsc -p tsconfig.ai-ops-dashboard.json && vite build --config vite.ai-ops-dashboard.config.ts');
ok('dashboard app does not import the GODO root App', !readFileSync('apps/ai-ops-dashboard/src/main.tsx', 'utf8').includes("../../src/App"));
ok('dedicated build output is configured', readFileSync('vite.ai-ops-dashboard.config.ts', 'utf8').includes("outDir: 'dist-ai-ops-dashboard'"));
```

- [ ] **Step 2: Run the new test and confirm RED**

Run: `node scripts/smoke-ai-ops-surface-v0.mjs`

Expected: FAIL because the standalone files and scripts do not exist.

- [ ] **Step 3: Add the minimal independent Vite surface**

```ts
// vite.ai-ops-dashboard.config.ts
export default defineConfig({
  root: 'apps/ai-ops-dashboard',
  plugins: [react()],
  build: { outDir: '../../dist-ai-ops-dashboard', emptyOutDir: true },
});
```

```tsx
// apps/ai-ops-dashboard/src/App.tsx
export function App() {
  return <main className="ops-shell"><h1>바나나몰2 AI 운영 현황</h1></main>;
}
```

- [ ] **Step 4: Register and run the focused smoke and build**

Run: `node scripts/smoke-ai-ops-surface-v0.mjs`

Run: `npm run build:ai-ops-dashboard`

Expected: PASS and `dist-ai-ops-dashboard/index.html` exists.

- [ ] **Step 5: Commit the isolated surface**

```bash
git add package.json vite.ai-ops-dashboard.config.ts tsconfig.ai-ops-dashboard.json apps/ai-ops-dashboard scripts/smoke-ai-ops-surface-v0.mjs scripts/regression-manifest.json
git commit -m "feat(ai-ops): add an independent dashboard surface"
```

---

### Task 2: Define one data contract and pure dashboard aggregation

**Files:**
- Create: `shared/ai-ops-dashboard/contracts.ts`
- Create: `shared/ai-ops-dashboard/validation.ts`
- Create: `shared/ai-ops-dashboard/aggregation.ts`
- Create: `scripts/smoke-ai-ops-domain-v0.mjs`
- Modify: `scripts/regression-manifest.json`

**Interfaces:**
- Produces: `WorkItem`, `ProjectSettings`, `TimelineWeek`, `DashboardSnapshot`, `validateWorkItemInput()`, `buildDashboardSnapshot()`.
- Consumed by: Tasks 3–7.

- [ ] **Step 1: Write failing tests for status, validation, and counts**

```js
ok('invalid status is rejected', !D.validateWorkItemInput({ title: 'x', status: 'unknown' }).ok);
ok('rate is zero when no work exists', A.buildDashboardSnapshot(emptyFixture, '2026-08-05').weekly.rate === 0);
ok('same-week totals separate planned and completed', weekly.planned === 4 && weekly.completed === 2 && weekly.rate === 50);
ok('deleted work is excluded', !snapshot.recent.some((item) => item.id === 'deleted'));
```

- [ ] **Step 2: Run the domain test and confirm RED**

Run: `node scripts/smoke-ai-ops-domain-v0.mjs`

Expected: FAIL because the shared modules do not exist.

- [ ] **Step 3: Implement exact shared types**

```ts
export type WorkStatus = 'planned' | 'in_progress' | 'completed' | 'on_hold';

export interface WorkItem {
  id: string;
  idempotencyKey: string;
  basisDate: string;
  plannedDate: string | null;
  completedDate: string | null;
  area: string;
  title: string;
  status: WorkStatus;
  plannedContent: string;
  actualContent: string;
  outcome: string;
  nextTask: string;
  risk: string;
  supportRequest: string;
  executiveLine: string;
  evidenceUrl: string;
  achievementRate: number | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ProjectSettings {
  id: 'default';
  currentStage: string;
  targetOpenLabel: string;
  currentWorkExplanation: string;
  basisDate: string;
  updatedAt: string;
}

export interface TimelineWeek {
  id: string;
  year: number;
  month: number;
  weekOfMonth: 1 | 2 | 3 | 4 | 5;
  title: string;
  explanation: string;
  displayOrder: number;
}

export interface DashboardData {
  settings: ProjectSettings;
  timeline: TimelineWeek[];
  workItems: WorkItem[];
}

export interface PeriodSummary {
  planned: number;
  completed: number;
  inProgress: number;
  onHold: number;
  rate: number;
}

export interface DashboardSnapshot {
  settings: ProjectSettings;
  timeline: TimelineWeek[];
  day: { date: string; planned: WorkItem[]; performed: WorkItem[] };
  weekly: PeriodSummary;
  monthly: PeriodSummary;
  recent: WorkItem[];
  supportRequests: WorkItem[];
}
```

`WorkItemInput` omits server-owned IDs and timestamps. The server derives an idempotency key from a normalized `basisDate + area + title` when the automatic caller does not provide one. Manual creates receive a generated `manual:<uuid>` key so two intentionally similar human entries are not collapsed.

- [ ] **Step 4: Implement deterministic Korean-date aggregation**

```ts
export function buildDashboardSnapshot(data: DashboardData, selectedDate: string): DashboardSnapshot {
  const active = data.workItems.filter((item) => item.deletedAt === null);
  return {
    settings: data.settings,
    timeline: [...data.timeline].sort(compareTimelineWeek),
    day: summarizeDay(active, selectedDate),
    weekly: summarizePeriod(active, startOfKoreanWeek(selectedDate), endOfKoreanWeek(selectedDate)),
    monthly: summarizeMonth(active, selectedDate.slice(0, 7)),
    recent: recentItems(active, 6),
    supportRequests: active.filter((item) => item.supportRequest.trim() !== ''),
  };
}
```

- [ ] **Step 5: Run focused tests and typechecks**

Run: `node scripts/smoke-ai-ops-domain-v0.mjs`

Run: `npx tsc -p tsconfig.ai-ops-dashboard.json --noEmit`

Expected: all assertions PASS and no type errors.

- [ ] **Step 6: Commit the shared contract**

```bash
git add shared/ai-ops-dashboard scripts/smoke-ai-ops-domain-v0.mjs scripts/regression-manifest.json
git commit -m "feat(ai-ops): define the shared report contract"
```

---

### Task 3: Add the Supabase schema and repository boundary

**Files:**
- Create: `database/ai-ops-dashboard/001_initial.sql`
- Create: `database/ai-ops-dashboard/002_verified_seed.sql`
- Create: `api/_shared/aiOpsRepository.ts`
- Modify: `.env.example`
- Test: `scripts/smoke-ai-ops-api-v0.mjs`

**Interfaces:**
- Produces: `AiOpsRepository`, `createPgAiOpsRepository(connectionString)`, and `createMemoryAiOpsRepository(seed)`.
- `AiOpsRepository` methods: `loadAll()`, `upsertWorkItem()`, `updateWorkItem()`, `softDeleteWorkItem()`, `updateSettings()`, `replaceTimeline()`.
- All write methods receive one database transaction and append `work_item_revisions` before mutating existing work.

- [ ] **Step 1: Write the repository contract tests against the memory adapter**

```js
const repo = R.createMemoryAiOpsRepository(seed);
const before = await repo.loadAll();
await repo.upsertWorkItem(input, fixedClock);
const afterFirst = await repo.loadAll();
await repo.upsertWorkItem(input, fixedClock);
const afterSecond = await repo.loadAll();
ok('same idempotency key creates one row', afterFirst.workItems.length === afterSecond.workItems.length);
ok('failed update leaves work and revisions unchanged', deepEqual(await repo.loadAll(), snapshotBeforeFailure));
```

- [ ] **Step 2: Run the API smoke and confirm RED**

Run: `node scripts/smoke-ai-ops-api-v0.mjs`

Expected: FAIL because repository and schema files do not exist.

- [ ] **Step 3: Create schema constraints and indexes**

```sql
create table if not exists work_items (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  basis_date date not null,
  planned_date date,
  completed_date date,
  area text not null,
  title text not null,
  status text not null check (status in ('planned','in_progress','completed','on_hold')),
  planned_content text not null default '',
  actual_content text not null default '',
  outcome text not null default '',
  next_task text not null default '',
  risk text not null default '',
  support_request text not null default '',
  executive_line text not null default '',
  evidence_url text not null default '',
  achievement_rate numeric check (achievement_rate between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists project_settings (
  id text primary key check (id = 'default'),
  current_stage text not null default '',
  target_open_label text not null default '',
  current_work_explanation text not null default '',
  basis_date date not null,
  updated_at timestamptz not null default now()
);

create table if not exists timeline_weeks (
  id uuid primary key default gen_random_uuid(),
  year integer not null,
  month integer not null check (month between 1 and 12),
  week_of_month integer not null check (week_of_month between 1 and 5),
  title text not null,
  explanation text not null default '',
  display_order integer not null,
  unique (year, month, week_of_month)
);

create table if not exists work_item_revisions (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references work_items(id),
  change_kind text not null check (change_kind in ('create','update','delete')),
  before_data jsonb,
  after_data jsonb,
  changed_at timestamptz not null default now()
);
```

- [ ] **Step 4: Implement the repository and atomic revision write**

```ts
export interface AiOpsRepository {
  loadAll(): Promise<DashboardData>;
  upsertWorkItem(input: WorkItemInput, now: string): Promise<WorkItem>;
  updateWorkItem(id: string, input: WorkItemInput, now: string): Promise<WorkItem | null>;
  softDeleteWorkItem(id: string, now: string): Promise<boolean>;
  updateSettings(input: ProjectSettingsInput, now: string): Promise<ProjectSettings>;
  replaceTimeline(input: TimelineWeekInput[], now: string): Promise<TimelineWeek[]>;
}
```

Each write uses one transaction. A create writes a `create` revision with `before_data = null` and the inserted row in `after_data`. An update writes the old row and new row. A delete writes the old row and its soft-deleted form. If either the business row or revision insert fails, both roll back.

- [ ] **Step 5: Seed only the five verified initial facts**

Use `insert ... on conflict (idempotency_key) do nothing` for the five rows listed in the design document. Leave unsupported completion rates and outcome claims null or empty.

- [ ] **Step 6: Run repository tests and API typecheck**

Run: `node scripts/smoke-ai-ops-api-v0.mjs`

Run: `npm run typecheck:api`

Expected: idempotency, rollback, revision, and secret-boundary assertions PASS.

- [ ] **Step 7: Commit the persistence boundary**

```bash
git add database/ai-ops-dashboard api/_shared/aiOpsRepository.ts .env.example scripts/smoke-ai-ops-api-v0.mjs
git commit -m "feat(ai-ops): add shared persistence with revision history"
```

---

### Task 4: Expose validated read and write APIs

**Files:**
- Create: `api/_shared/aiOpsHandlers.ts`
- Create: `api/ai-ops/dashboard.ts`
- Create: `api/ai-ops/work-items.ts`
- Create: `api/ai-ops/settings.ts`
- Create: `api/ai-ops/timeline.ts`
- Modify: `scripts/smoke-ai-ops-api-v0.mjs`

**Interfaces:**
- `GET /api/ai-ops/dashboard?date=YYYY-MM-DD` returns `DashboardSnapshot`.
- `POST /api/ai-ops/work-items` performs idempotent upsert.
- `PATCH /api/ai-ops/work-items` updates one record by `id`.
- `DELETE /api/ai-ops/work-items` soft-deletes one record by `id`.
- `PATCH /api/ai-ops/settings` updates settings.
- `PUT /api/ai-ops/timeline` replaces the ordered timeline.

- [ ] **Step 1: Extend the smoke with handler-level RED cases**

```js
ok('GET rejects an invalid date with 400', invalidDate.statusCode === 400);
ok('POST duplicate key returns the same id', first.body.item.id === second.body.item.id);
ok('PATCH unknown id returns 404', missing.statusCode === 404);
ok('DELETE creates a revision and hides the item', deleted.body.snapshot.recent.every((item) => item.id !== targetId));
ok('database credential never appears in a response', !JSON.stringify(errorResponse).includes('postgres'));
```

- [ ] **Step 2: Run and confirm RED**

Run: `node scripts/smoke-ai-ops-api-v0.mjs`

Expected: FAIL because handlers and route entries do not exist.

- [ ] **Step 3: Implement injected handlers**

```ts
export function createAiOpsHandlers(repo: AiOpsRepository, clock: () => string) {
  return {
    dashboard: async (date: string) => buildDashboardSnapshot(await repo.loadAll(), date),
    upsert: async (raw: unknown) => repo.upsertWorkItem(assertWorkItemInput(raw), clock()),
    update: async (raw: unknown) => updateExisting(repo, assertWorkItemUpdate(raw), clock()),
    remove: async (raw: unknown) => removeExisting(repo, assertDeleteInput(raw), clock()),
  };
}
```

- [ ] **Step 4: Implement thin Vercel route adapters**

Each route checks the exact HTTP methods, returns `{ ok: true, ... }` on success, and returns `{ ok: false, code, message }` with a Korean user-facing message on validation or storage failure. Imports use explicit `.js` relative extensions for Vercel Node ESM.

- [ ] **Step 5: Run handler, type, and Vercel packaging gates**

Run: `node scripts/smoke-ai-ops-api-v0.mjs`

Run: `npm run typecheck:api`

Run: `npx vercel build` only when the existing local Vercel project is linked and this command does not alter remote state; otherwise mark packaging as not run and use the repository's existing function-bundle gate.

Expected: all local handler tests pass; no secret appears in returned JSON.

- [ ] **Step 6: Commit the APIs**

```bash
git add api/_shared/aiOpsHandlers.ts api/ai-ops scripts/smoke-ai-ops-api-v0.mjs
git commit -m "feat(ai-ops): expose public validated dashboard APIs"
```

---

### Task 5: Build the data client and stable UI state

**Files:**
- Create: `apps/ai-ops-dashboard/src/apiClient.ts`
- Create: `apps/ai-ops-dashboard/src/useDashboard.ts`
- Create: `apps/ai-ops-dashboard/src/components/StatusNotice.tsx`
- Modify: `apps/ai-ops-dashboard/src/App.tsx`
- Modify: `scripts/smoke-ai-ops-surface-v0.mjs`

**Interfaces:**
- Produces: `loadDashboard(date, signal)`, `upsertWorkItem(input)`, `updateWorkItem(input)`, `deleteWorkItem(id)`, `saveSettings(input)`, `saveTimeline(input)`.
- Produces hook state `{ snapshot, selectedDate, mode, notice, reload, mutations }`.

- [ ] **Step 1: Add source-level and pure-state RED assertions**

```js
ok('client checks response.ok', /if \(!response\.ok\)/.test(apiClientSource));
ok('hook aborts stale date requests', /AbortController/.test(hookSource));
ok('failed save preserves editor input', /setDraft\(currentDraft\)/.test(hookSource));
```

- [ ] **Step 2: Run the surface smoke and confirm RED**

Run: `node scripts/smoke-ai-ops-surface-v0.mjs`

- [ ] **Step 3: Implement fetch and mutation boundaries**

```ts
async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json() as ApiEnvelope<T>;
  if (!response.ok || !payload.ok) throw new DashboardApiError(payload.message, payload.code);
  return payload.data;
}
```

- [ ] **Step 4: Keep current data visible on reload failure**

The hook sets `notice` to a retryable error but does not replace a non-null `snapshot` with null. On successful mutation it reloads the selected date once; it performs no automatic write retry.

- [ ] **Step 5: Run focused type and smoke tests**

Run: `node scripts/smoke-ai-ops-surface-v0.mjs`

Run: `npx tsc -p tsconfig.ai-ops-dashboard.json --noEmit`

- [ ] **Step 6: Commit the data state layer**

```bash
git add apps/ai-ops-dashboard/src/apiClient.ts apps/ai-ops-dashboard/src/useDashboard.ts apps/ai-ops-dashboard/src/components/StatusNotice.tsx apps/ai-ops-dashboard/src/App.tsx scripts/smoke-ai-ops-surface-v0.mjs
git commit -m "feat(ai-ops): connect the dashboard to shared data"
```

---

### Task 6: Recreate the approved A·B·C executive dashboard

**Files:**
- Create: `apps/ai-ops-dashboard/src/components/ExecutiveSummaryCard.tsx`
- Create: `apps/ai-ops-dashboard/src/components/DailyCalendarCard.tsx`
- Create: `apps/ai-ops-dashboard/src/components/WorkFeedCard.tsx`
- Modify: `apps/ai-ops-dashboard/src/App.tsx`
- Modify: `apps/ai-ops-dashboard/src/styles.css`
- Modify: `scripts/smoke-ai-ops-surface-v0.mjs`

**Interfaces:**
- Consumes: `DashboardSnapshot` and `onSelectDate(date: string)`.
- Produces: a read-only executive view with exactly three top-level cards.

- [ ] **Step 1: Add RED checks for the approved information hierarchy**

```js
for (const heading of ['전체 현황과 경영 요약', '일일 업무 캘린더', '최근 업무와 다음 계획']) {
  ok(`${heading} exists`, sources.includes(heading));
}
ok('top layout has three cards and two gutters', css.includes('grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)'));
ok('small screens stack cards', /@media[\s\S]*grid-template-columns:\s*1fr/.test(css));
```

- [ ] **Step 2: Run and confirm RED**

Run: `node scripts/smoke-ai-ops-surface-v0.mjs`

- [ ] **Step 3: Implement the three semantic cards**

Each card uses a dark navy title band, pale mint section headers, rounded white sections, internal spacing, and no spreadsheet grid. Timeline weeks show a concise professional title with the easy explanation beneath it. Empty arrays render a plain Korean empty-state sentence.

- [ ] **Step 4: Implement responsive CSS from the approved mock**

```css
.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
  align-items: start;
}
.dashboard-card {
  border: 1px solid #d7e1ef;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 14px 34px rgb(31 58 95 / 10%);
}
@media (max-width: 980px) { .dashboard-grid { grid-template-columns: 1fr; } }
```

- [ ] **Step 5: Run build and visually inspect at 1920×1080 and 390×844**

Run: `npm run build:ai-ops-dashboard`

Run: `npm run preview:ai-ops-dashboard`

Verify: three cards in one row on desktop; one column on mobile; no clipped titles, schedule descriptions, or counts.

- [ ] **Step 6: Commit the report view**

```bash
git add apps/ai-ops-dashboard/src/components apps/ai-ops-dashboard/src/App.tsx apps/ai-ops-dashboard/src/styles.css scripts/smoke-ai-ops-surface-v0.mjs
git commit -m "feat(ai-ops): build the three-card executive report"
```

---

### Task 7: Add direct editing with safe delete and revision feedback

**Files:**
- Create: `apps/ai-ops-dashboard/src/components/EditDrawer.tsx`
- Modify: `apps/ai-ops-dashboard/src/App.tsx`
- Modify: `apps/ai-ops-dashboard/src/styles.css`
- Modify: `apps/ai-ops-dashboard/src/useDashboard.ts`
- Modify: `scripts/smoke-ai-ops-surface-v0.mjs`

**Interfaces:**
- Consumes: the hook mutation methods from Task 5.
- Produces: `내용 수정`, `새 업무 추가`, work-item edit form, settings/timeline edit sections, and `삭제 확인` dialog.

- [ ] **Step 1: Add RED assertions for edit and delete safety**

```js
ok('edit mode has one entry button', appSource.includes('내용 수정'));
ok('delete requires an explicit confirmation dialog', drawerSource.includes('role="alertdialog"'));
ok('achievement rate is constrained', drawerSource.includes('min={0}') && drawerSource.includes('max={100}'));
ok('save status is visible', drawerSource.includes('저장 중') && drawerSource.includes('저장 완료'));
```

- [ ] **Step 2: Run and confirm RED**

Run: `node scripts/smoke-ai-ops-surface-v0.mjs`

- [ ] **Step 3: Implement the work-item form**

Required fields are basis date, area, title, and status. Dates use native date inputs; achievement rate uses a numeric input from 0 to 100; multiline business fields use textareas. Validation errors appear beside their field and do not close the drawer.

- [ ] **Step 4: Implement settings and timeline editing**

The same drawer contains separate tabs for `업무`, `전체 설정`, and `월·주차 일정`. Timeline rows can be reordered with explicit up/down buttons; drag-and-drop is not required.

- [ ] **Step 5: Implement delete confirmation and failure preservation**

Clicking delete opens an alert dialog naming the exact work item. Cancelling changes nothing. A failed delete keeps both the item and dialog input state. A successful delete closes the dialog and reloads the report.

- [ ] **Step 6: Run focused build and browser acceptance**

Verify: add → edit → status change → delete cancel → delete confirm; then reload the page and confirm persistence against a stubbed shared API. Confirm no console errors.

- [ ] **Step 7: Commit the editor**

```bash
git add apps/ai-ops-dashboard/src/components/EditDrawer.tsx apps/ai-ops-dashboard/src/App.tsx apps/ai-ops-dashboard/src/styles.css apps/ai-ops-dashboard/src/useDashboard.ts scripts/smoke-ai-ops-surface-v0.mjs
git commit -m "feat(ai-ops): let the public dashboard be edited safely"
```

---

### Task 8: Final verification and deployment handoff

**Files:**
- Modify: `README.md`
- Modify: `docs/governance/MASTER_PLAN.md`
- Modify: `docs/governance/CURRENT_STATE.md`
- Modify: `.env.example`
- Modify if needed: files already listed in Tasks 1–7 to fix only verification defects.

**Interfaces:**
- Produces: a locally complete independent site and exact Preview deployment instructions.
- Does not perform Production deployment or environment-variable changes.

- [ ] **Step 1: Run the focused suites**

Run: `node scripts/smoke-ai-ops-domain-v0.mjs`

Run: `node scripts/smoke-ai-ops-api-v0.mjs`

Run: `node scripts/smoke-ai-ops-surface-v0.mjs`

Expected: all PASS with explicit denominators.

- [ ] **Step 2: Run the repository gate once at the final boundary**

Run: `npm test`

Run: `git diff --check`

Expected: existing manifest plus the three new suites pass; typecheck, both Vite builds, API typecheck, and lint pass.

- [ ] **Step 3: Run end-to-end browser acceptance on the production build**

Verify in one flow:

1. A·B·C cards are visible at desktop width.
2. Mobile width stacks the cards.
3. Verified initial facts render and unsupported values remain empty.
4. A new work item appears in B and C.
5. Updating it changes period counts once.
6. Repeating the same automatic upsert does not add a second item.
7. Delete cancel preserves it.
8. Delete confirm removes it and keeps a revision.
9. A forced 500 keeps the existing screen and form values.
10. No database credential appears in the DOM, network response, URL, or console.
11. Console error count is zero except the deliberately injected 500.

- [ ] **Step 4: Update governance without overstating deployment**

Record the independent dashboard as locally implemented and tested. Mark Supabase migration, Preview environment variables, Preview URL, and Production as `미검증` or `미수행` until separately completed.

- [ ] **Step 5: Commit the verified implementation record**

```bash
git add README.md docs/governance/MASTER_PLAN.md docs/governance/CURRENT_STATE.md .env.example
git commit -m "docs(ai-ops): record the verified standalone dashboard"
```

- [ ] **Step 6: Stop for deployment approval**

Report the local result, required Supabase SQL files, required variable name `AI_OPS_DATABASE_URL`, exact branch HEAD, and clean/dirty tree state. Ask separately for approval before creating the Supabase project, applying the migration, configuring Vercel, or deploying Preview/Production.
