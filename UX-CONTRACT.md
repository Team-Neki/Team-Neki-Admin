# Neki Admin UX Contract

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Table Selection | Ant Design Table | `UX-CONTRACT.md` | Checkbox row selection in an explicit task mode | `tests/rendered-html.test.mjs` |
| Select/Listbox | Ant Design Select | `UX-CONTRACT.md` | Single and multiple selection | `tests/rendered-html.test.mjs` |
| Date | Ant Design DatePicker | `UX-CONTRACT.md` | Single date, range, date-time | `tests/rendered-html.test.mjs` |
| Form | Ant Design Form | `UX-CONTRACT.md` | Vertical admin forms | `tests/rendered-html.test.mjs` |
| Scrollbar | Authored global CSS | `app/globals.css` | Horizontal data rail and document scroll | `tests/rendered-html.test.mjs` |
| Toast | Ant Design App context | `UX-CONTRACT.md` | Message, modal, notification | `tests/rendered-html.test.mjs` |
| CRUD | Feature adapter contract | `app/admin/types.ts` | Create, update, and explicit batch close | `tests/rendered-html.test.mjs` |

## Shared patterns

| Concern | Canonical pattern | Owner |
| --- | --- | --- |
| Navigation | Fixed desktop sidebar; horizontally scrollable mobile navigation | `app/admin/AdminApp.tsx` |
| Page heading | `AdminPageHeader` with one concise title and optional actions | `app/admin/shared/ui/AdminPageHeader.tsx` |
| Date range | Ant Design `DatePicker.RangePicker` with Korean locale and explicit bounds | Feature UI |
| Single-axis view switch | Ant Design `Segmented` | Feature UI |
| Search and filters | Compact controls above the result; reset occupies stable space where applicable | Feature UI |
| Tables | Ant Design `Table`, right-aligned numeric columns, sort on measurable values, horizontal scroll on narrow screens | Feature UI |
| Loading, empty, error | Ant Design `Spin`, `Empty`, `Result` or `Alert` with a direct recovery action when available | Feature UI |
| Feedback | `App.useApp()` message/modal APIs; never global static feedback APIs | Feature UI/model |
| Scrollbars | Visible, thin, neutral scrollbar styling with forced-color fallback | `app/globals.css` |

## Interaction rules

- A date preset updates the full date range. Manual date changes clear the selected preset unless they exactly match it.
- A table header sort changes only the visible ordering and never mutates the source record.
- Destructive actions require an explicit selection state and confirmation before mutation.
- Keyboard focus must remain visible for navigation, row actions, and interactive chart marks.
- Horizontal overflow must remain operable and visually discoverable on narrow screens.

## Data and permissions

- Google 로그인은 임시 비활성 상태가 기본이며 `ADMIN_AUTH_ENABLED=true`일 때만 활성화한다. 비활성 모드에는 가짜 신원, 프로필, 로그아웃, 세션 타이머를 만들지 않는다. 접근 정책과 공개 범위는 [인증 운영 문서](docs/operations/google-admin-login.md)를 따른다.
- UI models consume adapter contracts; credentials and external-system calls remain server-side.
- Mock data lives beside the feature model and must be replaceable without changing the screen contract.
- The interface never implies permissions that are not enforced by the backend.
- Empty and failed responses are distinct states. A failed live request must not silently become mock data.

## Instagram metrics

- Source and metric definitions: [Instagram integration](docs/operations/instagram-metrics.md).
- The account is fixed server-side; the browser cannot choose a token, account ID, or remote host.
- Current followers, selected-period account totals, and all-account media lifetime metrics remain visibly distinct. The date range never hides older posts.
- Missing metrics render as `—`; real zeroes remain `0`. No daily series or period comparison is fabricated.
- Committed dates persist as `igStart` and `igEnd` URL parameters. Range changes cancel stale reads and never display another range's previous values.
- Media is loaded explicitly in bounded pages; sorting applies to loaded rows. An available cursor remains reachable, and the loaded count uses `+` while another page exists.
- Successful snapshots are stored as validated private server JSON for five minutes. Manual refresh rechecks new posts and metrics after a minimum one-minute interval; a cache read never changes the original collection time. Storage failures are visible and partial failures are not saved. See the Instagram integration document for shared-volume limitations.
- Loading, no data, partial failure, invalid token/permission, and provider cooldown are separate recoverable states. Provider authentication failures must not sign an administrator out of Google.
- Date UI reuses Ant Design RangePicker. Its narrow-screen popup stacks both month panels inside a viewport-bounded scroll surface; Escape restores trigger focus.
- Feed and active stories use Ant Design Tabs with `igTab` URL state. Story reads are lazy and independent of the account date range. Active stories use explicit 12-item cursor pages, a one-minute provider cache, no polling, and no expired-story archive.
- A feed title opens an Ant Design modal, not an external page. The modal loads full caption and up to 20 carousel assets on demand; images use contain, videos use native controls without autoplay, and original Instagram navigation remains a separate action. Escape closes and restores focus to the trigger.
- The official story privacy threshold is an unavailable metric state, not an account permission failure. Actual permission failures remain errors. See the integration document for official API limitations.

## Responsive behavior

- Summary cards: four columns on desktop, two below 1120px, one below 420px.
- Toolbars: inline when space permits, stacked below 680px.
- Charts retain a readable minimum width inside a horizontal scroll container.
- Tables retain all requested metrics and scroll horizontally instead of dropping columns silently.
