"use client";

import ReloadOutlined from "@ant-design/icons/ReloadOutlined";
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Empty,
  Result,
  Segmented,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
  type TableProps,
} from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useCallback, useEffect, useState } from "react";

import { adminAdapter } from "../../../admin-adapter";
import { AdminPageHeader } from "../../../shared/ui/AdminPageHeader";
import type {
  GroupAccountDirection,
  GroupAccountStatus,
  GroupAccountTransaction,
  GroupAccountTransactionsResponse,
} from "../../../types";

const { Text, Title } = Typography;
const PAGE_TITLE = "모임통장";
const DIRECTION_OPTIONS: Array<{ label: string; value: GroupAccountDirection }> = [
  { label: "전체", value: "all" },
  { label: "입금", value: "in" },
  { label: "출금", value: "out" },
];

const directionLabel = (value: GroupAccountTransaction["direction"]) => value === "in" ? "입금" : "출금";

const amountLabel = (record: GroupAccountTransaction) => {
  const prefix = record.direction === "in" ? "+" : "-";
  return `${prefix}${record.amount.toLocaleString("ko-KR")}원`;
};

const dateLabel = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(date);
};

export function GroupAccountScreen() {
  const [status, setStatus] = useState<GroupAccountStatus>();
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string>();
  const [range, setRange] = useState<[Dayjs, Dayjs]>(() => [dayjs().subtract(30, "day"), dayjs()]);
  const [direction, setDirection] = useState<GroupAccountDirection>("all");
  const [page, setPage] = useState(1);
  const [transactions, setTransactions] = useState<GroupAccountTransactionsResponse>();
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [transactionsError, setTransactionsError] = useState<string>();

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError(undefined);
    try {
      setStatus(await adminAdapter.getGroupAccountStatus());
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "계좌 연결 상태를 확인하지 못했습니다.");
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const loadTransactions = useCallback(async () => {
    if (!status || status.state !== "connected" && status.state !== "mock") return;
    setTransactionsLoading(true);
    setTransactionsError(undefined);
    try {
      setTransactions(await adminAdapter.getGroupAccountTransactions({
        from: range[0].format("YYYY-MM-DD"),
        to: range[1].format("YYYY-MM-DD"),
        direction,
        page,
      }));
    } catch (error) {
      setTransactionsError(error instanceof Error ? error.message : "거래내역을 불러오지 못했습니다.");
    } finally {
      setTransactionsLoading(false);
    }
  }, [direction, page, range, status]);

  useEffect(() => {
    const task = window.setTimeout(() => { void loadStatus(); }, 0);
    return () => window.clearTimeout(task);
  }, [loadStatus]);
  useEffect(() => {
    const task = window.setTimeout(() => { void loadTransactions(); }, 0);
    return () => window.clearTimeout(task);
  }, [loadTransactions]);

  if (statusLoading) {
    return <Card className="state-card" aria-live="polite"><Spin size="large" /><Title level={4}>계좌 확인 중</Title></Card>;
  }
  if (statusError) {
    return (
      <>
        <AdminPageHeader title={PAGE_TITLE} action={<Button icon={<ReloadOutlined />} onClick={() => void loadStatus()}>새로고침</Button>} />
        <Card className="state-card"><Result status="error" title="계좌 연결 상태를 확인하지 못했습니다" extra={<Button type="primary" onClick={() => void loadStatus()}>다시 시도</Button>} /></Card>
      </>
    );
  }
  if (!status || status.state === "unconfigured") {
    return (
      <>
        <AdminPageHeader title={PAGE_TITLE} action={<Button icon={<ReloadOutlined />} onClick={() => void loadStatus()}>새로고침</Button>} />
        <Card className="content-card group-account-status-card">
          <Tag color="default">연결 전</Tag>
          <Title level={3}>연결된 계좌가 없습니다.</Title>
          <Button type="primary" href="/api/group-account/connect">계좌 연결</Button>
        </Card>
      </>
    );
  }
  if (status.state === "authorization_error") {
    return (
      <>
        <AdminPageHeader title={PAGE_TITLE} />
        <Card className="state-card">
          <Result status="error" title={status.message} extra={<Button type="primary" href="/api/group-account/connect">다시 연결</Button>} />
        </Card>
      </>
    );
  }
  if (status.state === "selection_required") {
    return (
      <>
        <AdminPageHeader title={PAGE_TITLE} />
        <Card className="content-card group-account-status-card">
          <Tag color="processing">계좌 선택</Tag>
          <Title level={3}>{status.accounts.length ? "조회할 계좌를 선택해 주세요." : "조회 가능한 계좌가 없습니다."}</Title>
          <Space orientation="vertical" align="start">
            {status.accounts.map((account) => (
              <form key={account.id} action="/api/group-account/account-selection" method="post">
                <input type="hidden" name="accountId" value={account.id} />
                <Button htmlType="submit">
                  {[account.bankName, account.accountAlias, account.accountNumberMasked].filter(Boolean).join(" · ")}
                </Button>
              </form>
            ))}
            {!status.accounts.length && <Button type="primary" href="/api/group-account/connect">다시 연결</Button>}
          </Space>
        </Card>
      </>
    );
  }

  const columns: TableProps<GroupAccountTransaction>["columns"] = [
    { title: "거래일시", dataIndex: "occurredAt", width: 190, render: (value) => dateLabel(value) },
    { title: "내용", dataIndex: "description", render: (value) => <Text strong>{value}</Text> },
    { title: "구분", dataIndex: "direction", width: 90, render: (value) => <Tag color={value === "in" ? "green" : "red"}>{directionLabel(value)}</Tag> },
    { title: "거래금액", dataIndex: "amount", width: 140, align: "right", render: (_, record) => <Text className={`group-account-amount ${record.direction === "in" ? "is-in" : "is-out"}`}>{amountLabel(record)}</Text> },
    { title: "거래 후 잔액", dataIndex: "balanceAfter", width: 140, align: "right", render: (value) => value == null ? "—" : `${Number(value).toLocaleString("ko-KR")}원` },
  ];
  const mockMode = status.state === "mock";
  const currentBalance = transactions?.items.find((item) => item.balanceAfter != null)?.balanceAfter ?? null;
  const total = transactions ? (transactions.hasNextPage ? (page + 1) * transactions.pageSize : (page - 1) * transactions.pageSize + transactions.items.length) : 0;
  const presets = [
    { label: "최근 7일", value: () => [dayjs().subtract(6, "day"), dayjs()] as [Dayjs, Dayjs] },
    { label: "이번 달", value: () => [dayjs().startOf("month"), dayjs()] as [Dayjs, Dayjs] },
  ];

  return (
    <>
      <AdminPageHeader title={PAGE_TITLE} action={<Button icon={<ReloadOutlined />} loading={transactionsLoading || statusLoading} onClick={() => void loadTransactions()}>새로고침</Button>} />
      <Card className="content-card group-account-toolbar-card">
        <div className="group-account-account-row">
          <Space size={8}><Tag color={mockMode ? "gold" : "green"}>{mockMode ? "목 데이터" : "연결됨"}</Tag><Text strong>{status.accountLabel}</Text></Space>
          <Text type="secondary">최근 조회 {status.lastSyncedAt ? dateLabel(status.lastSyncedAt) : "—"}</Text>
        </div>
        <div className="group-account-filter-row">
          <DatePicker.RangePicker
            value={range}
            format="YYYY.MM.DD"
            presets={presets}
            allowClear={false}
            disabled={transactionsLoading}
            disabledDate={(current) => current.isAfter(dayjs(), "day")}
            onChange={(value) => {
              if (!value?.[0] || !value[1]) return;
              setRange([value[0], value[1]]);
              setPage(1);
            }}
            aria-label="거래내역 조회 기간"
          />
          <Segmented<GroupAccountDirection>
            options={DIRECTION_OPTIONS}
            value={direction}
            disabled={transactionsLoading}
            onChange={(value) => { setDirection(value); setPage(1); }}
            aria-label="입출금 필터"
          />
        </div>
      </Card>
      <div className="group-account-summary-grid">
        <Card className="dashboard-stat-card"><Statistic title="조회 건수" value={transactions?.items.length ?? 0} suffix="건" /></Card>
        <Card className="dashboard-stat-card"><Statistic title="거래 후 잔액" value={currentBalance ?? 0} suffix="원" precision={0} /></Card>
      </div>
      <Card className="content-card table-card group-account-table-card">
        <div className="group-account-table-heading"><Title level={3}>거래내역</Title><Text type="secondary">{transactions ? `${transactions.items.length.toLocaleString("ko-KR")}건` : "—"}</Text></div>
        {transactionsError && <Alert type="error" showIcon title={transactionsError} action={<Button size="small" onClick={() => void loadTransactions()}>다시 시도</Button>} />}
        {transactionsLoading && !transactions ? <div className="group-account-loading"><Spin /><Text type="secondary">거래내역을 불러오고 있어요</Text></div> : transactions && transactions.items.length ? <Table rowKey="id" loading={transactionsLoading} columns={columns} dataSource={transactions.items} scroll={{ x: 720 }} pagination={{ current: page, pageSize: transactions.pageSize, total, hideOnSinglePage: true, showLessItems: true, showSizeChanger: false, onChange: setPage }} /> : !transactionsError ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="선택한 기간에 거래내역이 없습니다." /> : null}
      </Card>
    </>
  );
}
