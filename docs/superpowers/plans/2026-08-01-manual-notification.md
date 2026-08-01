# Manual Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 네키 운영자가 알림을 작성하고 대상을 선택해 즉시 또는 예약 발송하며, 발송 이력 확인과 예약 취소를 수행할 수 있는 프론트엔드 프로토타입을 만든다.

**Architecture:** 기존 관리자 셸과 Ant Design 테마는 유지하고 `app/features/manual-notification`에 도메인 모델, 작성 화면, 이력 화면을 분리한다. 백엔드 계약이 없으므로 데이터는 클라이언트 메모리에 보관하되, 대상·발송 방식·이력 상태를 명시적인 모델 함수로 처리해 나중에 API 호출로 교체할 수 있게 한다.

**Tech Stack:** React 19, TypeScript 5.9, Ant Design 6, vinext/Vite, Node.js test runner, CSS

## Global Constraints

- Node.js `22.13.0` 이상을 사용한다.
- 현재 `npm`과 `package-lock.json`을 유지하며 새 UI 라이브러리를 추가하지 않는다.
- 승인된 `docs/planning/screens/manual-notification.md`를 화면과 기능의 기준으로 사용한다.
- 실제 사용자 조회, 푸시 발송, 예약 실행 API는 호출하지 않고 교체 가능한 로컬 모델로 표현한다.
- 발송 대상은 전체 사용자, 마케팅 수신 동의 사용자, Android 사용자, iOS 사용자 네 종류로 제공한다.
- 상세 권한 정책, 입력 길이, 실제 수신자 집계와 발송 성공률은 이번 구현에 포함하지 않는다.
- Sites 배포 구조와 `.openai/hosting.json`은 변경하지 않는다.

---

### Task 1: 알림 도메인 모델과 단위 테스트

**Files:**
- Create: `app/features/manual-notification/model.mjs`
- Create: `tests/manual-notification-model.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: 알림 작성 폼의 `title`, `content`, `audience`, `delivery`, `scheduledAt`
- Produces: `AUDIENCE_OPTIONS`, `DELIVERY_OPTIONS`, `createNotificationRecord(input, now)`, `canCancelNotification(record)`, `cancelScheduledNotification(records, id)`

- [ ] **Step 1: 도메인 동작을 고정하는 실패 테스트 작성**

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  AUDIENCE_OPTIONS,
  canCancelNotification,
  cancelScheduledNotification,
  createNotificationRecord,
} from "../app/features/manual-notification/model.mjs";

test("defines the four planned notification audiences", () => {
  assert.deepEqual(
    AUDIENCE_OPTIONS.map(({ value }) => value),
    ["all", "marketing", "android", "ios"],
  );
});

test("creates an immediate notification as sent", () => {
  const record = createNotificationRecord(
    {
      title: "신규 기능 안내",
      content: "네키의 새 기능을 확인해 주세요.",
      audience: "all",
      delivery: "immediate",
      scheduledAt: null,
    },
    new Date("2026-08-01T12:00:00.000Z"),
  );

  assert.equal(record.status, "sent");
  assert.equal(record.sentAt, "2026-08-01T12:00:00.000Z");
  assert.equal(record.scheduledAt, null);
});

test("creates and cancels a scheduled notification", () => {
  const record = createNotificationRecord(
    {
      title: "예약 점검 안내",
      content: "오늘 밤 점검이 예정돼 있습니다.",
      audience: "marketing",
      delivery: "scheduled",
      scheduledAt: "2026-08-02T01:00:00.000Z",
    },
    new Date("2026-08-01T12:00:00.000Z"),
  );

  assert.equal(record.status, "scheduled");
  assert.equal(canCancelNotification(record), true);

  const [cancelled] = cancelScheduledNotification([record], record.id);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(canCancelNotification(cancelled), false);
});
```

- [ ] **Step 2: 테스트를 실행해 모듈 부재로 실패하는지 확인**

Run: `node --test tests/manual-notification-model.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `model.mjs`.

- [ ] **Step 3: 최소 도메인 모델 구현**

```js
export const AUDIENCE_OPTIONS = [
  { value: "all", label: "전체 사용자" },
  { value: "marketing", label: "마케팅 수신 동의 사용자" },
  { value: "android", label: "Android 사용자" },
  { value: "ios", label: "iOS 사용자" },
];

export const DELIVERY_OPTIONS = [
  { value: "immediate", label: "즉시 발송" },
  { value: "scheduled", label: "예약 발송" },
];

export function createNotificationRecord(input, now = new Date()) {
  const createdAt = now.toISOString();
  const scheduled = input.delivery === "scheduled";

  return {
    id: `notification-${now.getTime()}`,
    title: input.title,
    content: input.content,
    audience: input.audience,
    delivery: input.delivery,
    status: scheduled ? "scheduled" : "sent",
    createdAt,
    scheduledAt: scheduled ? input.scheduledAt : null,
    sentAt: scheduled ? null : createdAt,
  };
}

export function canCancelNotification(record) {
  return record.status === "scheduled";
}

export function cancelScheduledNotification(records, id) {
  return records.map((record) =>
    record.id === id && canCancelNotification(record)
      ? { ...record, status: "cancelled" }
      : record,
  );
}
```

`package.json`의 테스트 스크립트가 모델 테스트와 렌더링 테스트를 함께 실행하도록 바꾼다.

```json
"test": "npm run build && node --test tests/*.test.mjs"
```

- [ ] **Step 4: 모델 테스트 통과 확인**

Run: `node --test tests/manual-notification-model.test.mjs`

Expected: PASS with `3` tests and `0` failures.

- [ ] **Step 5: 도메인 모델 커밋**

```bash
git add app/features/manual-notification/model.mjs tests/manual-notification-model.test.mjs package.json
git commit -m "feat: add manual notification domain model"
```

---

### Task 2: 알림 작성 화면과 관리자 메뉴 연결

**Files:**
- Create: `app/features/manual-notification/NotificationComposer.tsx`
- Create: `app/features/manual-notification/ManualNotificationPage.tsx`
- Create: `app/features/dashboard/DashboardPage.tsx`
- Modify: `app/page.tsx:1-322`
- Modify: `tests/rendered-html.test.mjs:1-91`

**Interfaces:**
- Consumes: Task 1의 `AUDIENCE_OPTIONS`, `DELIVERY_OPTIONS`, `createNotificationRecord`
- Produces: `NotificationDraft`, `NotificationRecord`, `ManualNotificationPage`, `NotificationComposer({ onSubmit })`

- [ ] **Step 1: 알림 작성 화면의 서버 렌더링 실패 테스트 추가**

`tests/rendered-html.test.mjs`의 첫 번째 테스트 이름을 `server-renders the Neki Admin manual notification screen`으로 바꾸고, 기존 `안녕하세요, 운영자님`과 `최근 운영 요청` 단언을 제거한 뒤 다음 단언을 추가한다. 문서 제목, `Design system v0.1`, 결정적 글리프 검증은 유지한다.

```js
assert.match(html, /수동 알림 발송/);
assert.match(html, /알림 제목/);
assert.match(html, /마케팅 수신 동의 사용자/);
assert.match(html, /Android 사용자/);
assert.match(html, /iOS 사용자/);
assert.match(html, /즉시 발송/);
assert.match(html, /예약 발송/);
```

- [ ] **Step 2: 빌드 기반 렌더링 테스트가 새 문구 부재로 실패하는지 확인**

Run: `npm test`

Expected: FAIL because the rendered HTML does not contain `수동 알림 발송`.

- [ ] **Step 3: 알림 작성 컴포넌트 구현**

`NotificationComposer.tsx`는 다음 공개 인터페이스와 폼 구성을 사용한다.

```tsx
"use client";

import { Button, Card, DatePicker, Form, Input, Radio, Space, Typography } from "antd";
import { AUDIENCE_OPTIONS, DELIVERY_OPTIONS } from "./model.mjs";

const { Text, Title } = Typography;
const { TextArea } = Input;

export type NotificationDraft = {
  title: string;
  content: string;
  audience: "all" | "marketing" | "android" | "ios";
  delivery: "immediate" | "scheduled";
  scheduledAt: string | null;
};

type ComposerValues = Omit<NotificationDraft, "scheduledAt"> & {
  scheduledAt?: { toISOString(): string };
};

export function NotificationComposer({
  onSubmit,
}: {
  onSubmit: (draft: NotificationDraft) => void;
}) {
  const [form] = Form.useForm<ComposerValues>();
  const delivery = Form.useWatch("delivery", form) ?? "immediate";

  const submit = (values: ComposerValues) => {
    onSubmit({
      ...values,
      scheduledAt: values.scheduledAt?.toISOString() ?? null,
    });
    form.resetFields();
  };

  return (
    <Card className="notification-composer-card">
      <Space direction="vertical" size={4} className="section-intro">
        <Title level={3}>알림 작성</Title>
        <Text type="secondary">사용자에게 전달할 알림과 발송 대상을 설정합니다.</Text>
      </Space>
      <Form
        form={form}
        layout="vertical"
        initialValues={{ audience: "all", delivery: "immediate" }}
        onFinish={submit}
      >
        <Form.Item label="알림 제목" name="title" rules={[{ required: true, message: "알림 제목을 입력해 주세요." }]}>
          <Input placeholder="알림 제목을 입력해 주세요" />
        </Form.Item>
        <Form.Item label="알림 내용" name="content" rules={[{ required: true, message: "알림 내용을 입력해 주세요." }]}>
          <TextArea rows={6} placeholder="사용자에게 전달할 내용을 입력해 주세요" />
        </Form.Item>
        <Form.Item label="발송 대상" name="audience">
          <Radio.Group options={AUDIENCE_OPTIONS} />
        </Form.Item>
        <Form.Item label="발송 시점" name="delivery">
          <Radio.Group options={DELIVERY_OPTIONS} />
        </Form.Item>
        {delivery === "scheduled" ? (
          <Form.Item label="예약 일시" name="scheduledAt" rules={[{ required: true, message: "예약 일시를 선택해 주세요." }]}>
            <DatePicker showTime className="notification-date-picker" />
          </Form.Item>
        ) : null}
        <Button type="primary" htmlType="submit">{delivery === "scheduled" ? "발송 예약" : "즉시 발송"}</Button>
      </Form>
    </Card>
  );
}
```

`ManualNotificationPage.tsx`는 작성 결과를 로컬 이력에 추가하고 성공 메시지를 표시한다.

```tsx
"use client";

import { App, Typography } from "antd";
import { useState } from "react";
import { createNotificationRecord } from "./model.mjs";
import { NotificationComposer, type NotificationDraft } from "./NotificationComposer";

const { Text, Title } = Typography;

export type NotificationRecord = ReturnType<typeof createNotificationRecord>;

export function ManualNotificationPage() {
  const { message } = App.useApp();
  const [, setRecords] = useState<NotificationRecord[]>([]);

  const submit = (draft: NotificationDraft) => {
    setRecords((records) => [createNotificationRecord(draft), ...records]);
    message.success(draft.delivery === "scheduled" ? "알림을 예약했습니다." : "알림을 발송했습니다.");
  };

  return (
    <div className="manual-notification-page">
      <section className="page-heading">
        <div>
          <Text className="eyebrow">운영</Text>
          <Title level={1}>수동 알림 발송</Title>
          <Text type="secondary">사용자에게 보낼 알림을 작성하고 발송합니다.</Text>
        </div>
      </section>
      <NotificationComposer onSubmit={submit} />
    </div>
  );
}
```

기존 `OperationRecord`, `operations`, `columns`, `StatCard`, 대시보드 본문을 `app/features/dashboard/DashboardPage.tsx`로 옮기고 `DashboardPage`라는 named export로 제공한다. 표시 문구와 Ant Design 구성은 변경하지 않는다.

`app/page.tsx`에 `useState`, `DashboardPage`, `ManualNotificationPage`를 가져오고, 운영 메뉴에 다음 항목을 추가한다.

```tsx
{ key: "manual-notification", icon: navGlyph("P"), label: "수동 알림" }
```

관리자 셸 안에서는 다음 상태와 렌더링 분기를 사용한다.

```tsx
const [activeView, setActiveView] = useState("manual-notification");
const navigationItems = menuItems.map((item) => {
  if (!("children" in item)) return item;
  return {
    ...item,
    children: item.children.map((child) => ({
      ...child,
      label: "badge" in child ? (
        <Flex justify="space-between" align="center">
          <span>{child.label}</span>
          <Badge count={child.badge} size="small" />
        </Flex>
      ) : (
        child.label
      ),
    })),
  };
});

<Menu
  mode="inline"
  selectedKeys={[activeView]}
  onClick={({ key }) => setActiveView(key)}
  items={navigationItems}
  className="side-menu"
/>

<Content className="admin-content">
  {activeView === "manual-notification" ? (
    <ManualNotificationPage />
  ) : (
    <DashboardPage />
  )}
</Content>
```

- [ ] **Step 4: 렌더링 테스트 통과 확인**

Run: `npm test`

Expected: PASS with the manual notification title, four audiences, and two delivery modes in server-rendered HTML.

- [ ] **Step 5: 알림 작성 화면 커밋**

```bash
git add app/features/manual-notification/NotificationComposer.tsx app/features/manual-notification/ManualNotificationPage.tsx app/features/dashboard/DashboardPage.tsx app/page.tsx tests/rendered-html.test.mjs
git commit -m "feat: add manual notification composer"
```

---

### Task 3: 발송 이력, 상세 확인, 예약 취소

**Files:**
- Create: `app/features/manual-notification/NotificationHistory.tsx`
- Modify: `app/features/manual-notification/ManualNotificationPage.tsx`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: Task 1의 `AUDIENCE_OPTIONS`, `canCancelNotification`, `cancelScheduledNotification`; Task 2의 `NotificationRecord`
- Produces: `NotificationHistory({ records, onCancel })`과 작성·이력 탭을 제공하는 완성된 `ManualNotificationPage`

- [ ] **Step 1: 이력 화면의 실패 테스트 추가**

`tests/rendered-html.test.mjs`의 렌더링 테스트에 다음 단언을 추가한다.

```js
assert.match(html, /발송 이력/);
assert.match(html, /발송 대상/);
assert.match(html, /발송 상태/);
```

- [ ] **Step 2: 렌더링 테스트가 이력 UI 부재로 실패하는지 확인**

Run: `npm test`

Expected: FAIL because `발송 상태` is not present in rendered HTML.

- [ ] **Step 3: 이력 표와 상세 모달 구현**

`NotificationHistory.tsx`는 다음 props를 받는다. 상태 라벨은 문자열 키를 안전하게 처리하는 `Record<string, string>`으로 선언한다.

```tsx
"use client";

import { Button, Card, Descriptions, Modal, Space, Table, Typography, type TableProps } from "antd";
import { useState } from "react";
import { AUDIENCE_OPTIONS, canCancelNotification } from "./model.mjs";
import type { NotificationRecord } from "./ManualNotificationPage";

const { Title } = Typography;

type NotificationHistoryProps = {
  records: NotificationRecord[];
  onCancel: (id: string) => void;
};

export function NotificationHistory({ records, onCancel }: NotificationHistoryProps) {
  const [selected, setSelected] = useState<NotificationRecord | null>(null);
  const audienceLabels = new Map(AUDIENCE_OPTIONS.map((option) => [option.value, option.label]));
  const statusLabels: Record<string, string> = {
    sent: "발송 완료",
    scheduled: "예약",
    cancelled: "취소",
  };

  const columns: TableProps<NotificationRecord>["columns"] = [
    { title: "알림 제목", dataIndex: "title" },
    { title: "발송 대상", dataIndex: "audience", render: (value) => audienceLabels.get(value) },
    { title: "발송 방식", dataIndex: "delivery", render: (value) => value === "scheduled" ? "예약 발송" : "즉시 발송" },
    { title: "발송 상태", dataIndex: "status", render: (value) => statusLabels[value] ?? value },
    {
      title: "작업",
      key: "actions",
      render: (_, record) => (
        <Space>
          <Button type="link" onClick={() => setSelected(record)}>상세</Button>
          {canCancelNotification(record) ? <Button danger type="link" onClick={() => onCancel(record.id)}>예약 취소</Button> : null}
        </Space>
      ),
    },
  ];

  return (
    <Card className="notification-history-card">
      <Title level={3}>발송 이력</Title>
      <Table columns={columns} dataSource={records} rowKey="id" pagination={false} locale={{ emptyText: "발송 이력이 없습니다." }} />
      <Modal title="알림 상세" open={selected !== null} footer={null} onCancel={() => setSelected(null)}>
        <Descriptions column={1} items={selected ? [
          { key: "title", label: "알림 제목", children: selected.title },
          { key: "content", label: "알림 내용", children: selected.content },
          { key: "audience", label: "발송 대상", children: audienceLabels.get(selected.audience) },
        ] : []} />
      </Modal>
    </Card>
  );
}
```

`ManualNotificationPage.tsx`에 작성 화면과 이력 화면을 모두 렌더링하고 예약 취소를 연결한다.

```tsx
import { App, Tabs, Typography } from "antd";
import { cancelScheduledNotification, createNotificationRecord } from "./model.mjs";
import { NotificationHistory } from "./NotificationHistory";

const initialRecords: NotificationRecord[] = [
  createNotificationRecord(
    {
      title: "8월 서비스 소식",
      content: "네키의 새로운 소식을 확인해 주세요.",
      audience: "marketing",
      delivery: "scheduled",
      scheduledAt: "2026-08-03T01:00:00.000Z",
    },
    new Date("2026-08-01T09:00:00.000Z"),
  ),
];

const [records, setRecords] = useState<NotificationRecord[]>(initialRecords);

const cancel = (id: string) => {
  setRecords((current) => cancelScheduledNotification(current, id));
  message.success("예약 발송을 취소했습니다.");
};
```

화면 본문은 `Tabs`를 사용해 기획서에 정의된 알림 작성 화면과 발송 이력 화면을 전환한다. 서버 렌더링 검증에서도 두 화면의 핵심 문구를 확인할 수 있도록 각 탭에 `forceRender: true`를 지정한다.

```tsx
<Tabs
  className="notification-tabs"
  items={[
    {
      key: "compose",
      label: "알림 작성",
      children: <NotificationComposer onSubmit={submit} />,
      forceRender: true,
    },
    {
      key: "history",
      label: "발송 이력",
      children: <NotificationHistory records={records} onCancel={cancel} />,
      forceRender: true,
    },
  ]}
/>
```

- [ ] **Step 4: 모델과 렌더링 테스트 통과 확인**

Run: `npm test`

Expected: PASS with `0` failures and rendered labels for history, audience, and status.

- [ ] **Step 5: 이력 화면 커밋**

```bash
git add app/features/manual-notification/NotificationHistory.tsx app/features/manual-notification/ManualNotificationPage.tsx tests/rendered-html.test.mjs
git commit -m "feat: add notification history management"
```

---

### Task 4: 화면 스타일과 최종 검증

**Files:**
- Modify: `app/globals.css:1-410`
- Modify: `tests/rendered-html.test.mjs`
- Modify: `docs/planning/screens/manual-notification.md`

**Interfaces:**
- Consumes: Task 2와 Task 3의 CSS class인 `manual-notification-page`, `notification-tabs`, `notification-composer-card`, `notification-history-card`, `notification-date-picker`
- Produces: 기존 Neki 토큰을 사용하는 데스크톱·모바일 레이아웃과 구현 상태가 표시된 화면 기획서

- [ ] **Step 1: 스타일 계약 실패 테스트 추가**

기존 CSS 소스 검증 테스트에 다음 단언을 추가한다.

```js
assert.match(css, /\.notification-tabs/);
assert.match(css, /\.notification-composer-card/);
assert.match(css, /\.notification-history-card/);
```

- [ ] **Step 2: 새 클래스 부재로 테스트가 실패하는지 확인**

Run: `npm test`

Expected: FAIL because `.notification-tabs` is not defined.

- [ ] **Step 3: 기존 디자인 토큰을 이용한 반응형 스타일 추가**

`app/globals.css`에 다음 규칙을 추가한다.

```css
.manual-notification-page {
  width: 100%;
}

.notification-tabs > .ant-tabs-nav {
  margin-bottom: 20px;
}

.notification-composer-card,
.notification-history-card {
  border: 1px solid rgba(227, 228, 232, 0.9);
  border-radius: var(--radius-lg) !important;
  box-shadow: var(--shadow-card);
}

.section-intro {
  width: 100%;
  margin-bottom: 24px;
}

.section-intro h3,
.notification-history-card h3 {
  margin: 0 !important;
  font-size: 18px !important;
  line-height: 28px !important;
}

.notification-date-picker {
  width: 100%;
}

.notification-history-card .ant-table-wrapper {
  overflow-x: auto;
}
```

`docs/planning/screens/manual-notification.md`의 제목 아래에 다음 구현 상태를 추가한다.

```markdown
> 구현 상태: 로컬 프로토타입 완료. 실제 사용자 조회, 푸시 발송, 예약 실행은 백엔드 연동이 필요하다.
```

- [ ] **Step 4: 전체 품질 검증**

Run: `npm test`

Expected: PASS with all model and rendered HTML tests.

Run: `npm run lint`

Expected: exit code `0` with no ESLint errors.

Run: `git diff --check`

Expected: exit code `0` with no whitespace errors.

- [ ] **Step 5: 스타일과 구현 상태 커밋**

```bash
git add app/globals.css tests/rendered-html.test.mjs docs/planning/screens/manual-notification.md
git commit -m "feat: finish manual notification prototype"
```
