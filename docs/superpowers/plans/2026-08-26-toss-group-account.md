# Toss Group Account Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 네키 관리자에 토스 모임통장 거래내역을 안전하게 연결할 서버 어댑터와 조회 프로토타입을 추가한다.

**Architecture:** 기존 `AdminApp`과 adapter 경계를 유지하면서 `GroupAccountAdapter`를 서버 route 뒤에 둔다. 자격·동의 정보가 없으면 `unconfigured`만 반환하고, 명시적인 개발용 mock 모드에서만 fixture를 사용한다. 실제 금융결제원 Open Banking 응답 필드는 adapter 내부에서 화면 모델로 정규화한다.

**Tech Stack:** Next/Vinext route, React 19, TypeScript, Ant Design 6, Node test runner, 기존 CSS 토큰

**Spec:** `docs/superpowers/specs/2026-08-26-toss-group-account-design.md`

## Global Constraints

- 제품 UI에는 구현 배경이나 금융 API 해설 문단을 넣지 않는다.
- 실제 계좌 데이터가 없을 때 목 거래내역을 기본 표시하지 않는다.
- access token, client secret, 계좌 식별자는 브라우저·localStorage·HTML·로그에 노출하지 않는다.
- 실제 오픈뱅킹 호출은 이용기관 자격과 계좌 명의자 동의가 준비된 뒤에만 활성화한다.
- 기존 브랜드·부스·사전·포즈·Amplitude 기능의 동작과 adapter 계약을 깨지 않는다.
- 거래내역 조회는 페이지당 최대 25건을 외부 API 경계에서 정규화한다.

### Task 1: 금융 계좌 화면 모델과 adapter 정규화 함수

**Files:**
- Modify: `app/admin/types.ts`
- Create: `app/admin/group-account-adapter.ts`
- Create: `tests/group-account-adapter.test.mjs`

**Interfaces:**
- Produces `GroupAccountStatus`, `GroupAccountTransaction`, `GroupAccountTransactionsResponse`, `GroupAccountDirection`, `GroupAccountQuery` and `normalizeOpenBankingTransaction`.
- `normalizeOpenBankingTransaction(input: unknown, index: number): GroupAccountTransaction` must never return a token, account number, or raw provider payload.

- [ ] **Step 1: Write the failing tests**

```js
test('normalizes open banking transaction fields into the screen model', async () => {
  const { normalizeOpenBankingTransaction } = await import('../app/admin/group-account-adapter.ts');
  assert.deepEqual(normalizeOpenBankingTransaction({
    fintech_use_num: 'hidden',
    tran_date: '20260826',
    tran_time: '102030',
    print_content: '네키 운영비',
    tran_amt: '120000',
    balance_amt: '880000',
    inout_type: '입금',
  }, 0), {
    id: '20260826102030-0',
    occurredAt: '2026-08-26T10:20:30+09:00',
    description: '네키 운영비',
    direction: 'in',
    amount: 120000,
    balanceAfter: 880000,
  });
});

test('does not expose provider identifiers when optional fields are missing', async () => {
  const { normalizeOpenBankingTransaction } = await import('../app/admin/group-account-adapter.ts');
  const result = normalizeOpenBankingTransaction({ tran_date: '20260826', tran_amt: '500' }, 1);
  assert.equal(result.description, '거래');
  assert.equal(result.direction, 'out');
  assert.equal(result.balanceAfter, null);
  assert.doesNotMatch(JSON.stringify(result), /fintech|account|token/i);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test tests/group-account-adapter.test.mjs`

Expected: FAIL because the model and normalizer do not exist.

- [ ] **Step 3: Implement the minimal model and normalizer**

Add screen-only types to `types.ts`. In `group-account-adapter.ts`, parse `YYYYMMDD` and `HHMMSS`, map provider in/out values to `in | out`, use absolute numeric amount, default description to `거래`, and return `null` for an invalid balance. Keep the provider payload private to the function.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `node --test tests/group-account-adapter.test.mjs`

Expected: 2 passing tests.

- [ ] **Step 5: Commit**

```bash
git add app/admin/types.ts app/admin/group-account-adapter.ts tests/group-account-adapter.test.mjs
git commit -m "feat: add group account screen adapter"
```

### Task 2: 서버 상태·거래내역 API route

**Files:**
- Create: `app/api/group-account/status/route.ts`
- Create: `app/api/group-account/transactions/route.ts`
- Create: `app/api/group-account/group-account-server.ts`
- Create: `tests/group-account-route.test.mjs`
- Modify: `.env.local.example`

**Interfaces:**
- `GET /api/group-account/status` returns `unconfigured`, `connected`, or `mock` without secrets.
- `GET /api/group-account/transactions?from=YYYY-MM-DD&to=YYYY-MM-DD&direction=all|in|out&page=1` returns normalized items, `page`, `pageSize`, `hasNextPage`, and `fetchedAt`.
- `getGroupAccountRuntime()` reads `GROUP_ACCOUNT_DATA_MODE`, `OPENBANKING_BASE_URL`, `OPENBANKING_ACCESS_TOKEN`, and `OPENBANKING_FINTECH_USE_NUM` only on the server.

- [ ] **Step 1: Write failing route tests**

```js
test('returns unconfigured status without credentials', async () => {
  const { GET } = await import('../app/api/group-account/status/route.ts');
  const response = await GET(new Request('http://localhost/api/group-account/status'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { state: 'unconfigured', message: '계좌 연결 정보가 없습니다.' });
});

test('returns mock transactions only when mock mode is explicit', async () => {
  process.env.GROUP_ACCOUNT_DATA_MODE = 'mock';
  const { GET } = await import('../app/api/group-account/transactions/route.ts');
  const response = await GET(new Request('http://localhost/api/group-account/transactions?from=2026-08-01&to=2026-08-31&direction=all&page=1'));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.pageSize, 25);
  assert.ok(Array.isArray(body.items));
  assert.match(body.items[0].occurredAt, /^2026-/);
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `node --test tests/group-account-route.test.mjs`

Expected: FAIL because routes do not exist.

- [ ] **Step 3: Implement the server boundary**

Create a server-only runtime reader. Return `unconfigured` unless `GROUP_ACCOUNT_DATA_MODE=mock` or all real adapter settings exist. In mock mode use a small fixed fixture in `group-account-server.ts`. In real mode call the configured Open Banking base URL with `Authorization: Bearer ...`, validate date/direction/page query values, cap `pageSize` at 25, normalize records, and map 401/403/429/5xx to stable JSON errors without provider response bodies.

- [ ] **Step 4: Run focused tests and verify they pass**

Run: `node --test tests/group-account-route.test.mjs`

Expected: all route tests pass with no secret values in JSON.

- [ ] **Step 5: Add configuration documentation and commit**

Add empty variable names and comments to `.env.local.example`; do not add credentials.

```bash
git add app/api/group-account .env.local.example tests/group-account-route.test.mjs
git commit -m "feat: add group account api boundary"
```

### Task 3: Admin adapter and 모임통장 화면

**Files:**
- Modify: `app/admin/types.ts`
- Modify: `app/admin/api-admin-adapter.ts`
- Modify: `app/admin/admin-adapter.ts`
- Modify: `app/admin/AdminApp.tsx`
- Modify: `app/globals.css`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- `AdminAdapter` gains `getGroupAccountStatus()` and `getGroupAccountTransactions(query)` methods.
- `AdminApp` gains view key `group-account`, desktop/mobile navigation item, and `GroupAccountScreen`.

- [ ] **Step 1: Extend the contract and add a failing rendered-shell assertion**

Add these assertions to `tests/rendered-html.test.mjs` before implementation:

```js
assert.match(html, /모임통장/);
assert.match(adminApp, /function GroupAccountScreen/);
assert.match(adminApp, /\/api\/group-account\/transactions/);
assert.match(adminApp, /계좌 연결 정보가 없습니다/);
```

Run: `npm test`

Expected: FAIL because the tab, adapter methods, and screen do not exist.

- [ ] **Step 2: Implement API adapter methods**

In `api-admin-adapter.ts`, add a 60-second cache keyed by `from:to:direction:page` and in-flight deduplication, matching the existing Amplitude cache pattern. Parse non-2xx responses into a safe error. Keep existing mock CRUD spread behavior unchanged.

- [ ] **Step 3: Implement the screen and navigation**

Add `GroupAccountScreen` with status fetch on entry, a `DatePicker.RangePicker`, `Segmented` direction filter, `새로고침` button, summary balance when available, and an Ant Design `Table` with date, description, direction, amount, and balance columns. Render only the connection state when status is `unconfigured`; render a clearly labelled `목 데이터` tag only for explicit mock status. Add retry/error/empty states and keep table `scroll={{ x: 720 }}` for narrow widths.

- [ ] **Step 4: Add responsive styles and run the focused rendered test**

Add scoped classes for the toolbar, status card, summary, and transaction table. At the existing mobile breakpoint, stack filters and allow horizontal table scrolling without changing page width.

Run: `npm test`

Expected: rendered shell and new screen assertions pass.

- [ ] **Step 5: Commit**

```bash
git add app/admin/types.ts app/admin/api-admin-adapter.ts app/admin/admin-adapter.ts app/admin/AdminApp.tsx app/globals.css tests/rendered-html.test.mjs
git commit -m "feat: add group account admin screen"
```

### Task 4: Integration validation and documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-08-26-toss-group-account-design.md` only if validation reveals a contract mismatch
- Test: `tests/group-account-adapter.test.mjs`, `tests/group-account-route.test.mjs`, `tests/rendered-html.test.mjs`

- [ ] **Step 1: Verify configuration behavior with no credentials**

Run: `env -u GROUP_ACCOUNT_DATA_MODE -u OPENBANKING_ACCESS_TOKEN -u OPENBANKING_FINTECH_USE_NUM npm test`

Expected: build and all tests pass; default status is `unconfigured`.

- [ ] **Step 2: Verify explicit mock mode**

Run: `GROUP_ACCOUNT_DATA_MODE=mock npm test`

Expected: build and all tests pass; only mock-specific route tests exercise fixture rows.

- [ ] **Step 3: Run static checks**

Run: `npx tsc --noEmit && npm run lint`

Expected: exit 0 with no TypeScript or ESLint errors.

- [ ] **Step 4: Update README with the real activation boundary**

Document that real data requires financial clearing Open Banking institution approval, account-holder consent, server-side token storage, and provider-specific support confirmation. Do not document a browser-only shortcut.

- [ ] **Step 5: Inspect git diff and commit documentation**

Run: `git diff --check && git status --short`

Then commit only the intended README/docs changes:

```bash
git add README.md docs/superpowers/specs/2026-08-26-toss-group-account-design.md
git commit -m "docs: document group account activation requirements"
```
