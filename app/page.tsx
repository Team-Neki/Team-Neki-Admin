"use client";

import {
  BellOutlined,
  CaretDownOutlined,
  DashboardOutlined,
  FileTextOutlined,
  FlagOutlined,
  GiftOutlined,
  LogoutOutlined,
  MoreOutlined,
  PictureOutlined,
  SearchOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import {
  App,
  Avatar,
  Badge,
  Button,
  Card,
  ConfigProvider,
  Flex,
  Input,
  Layout,
  Menu,
  Progress,
  Space,
  Table,
  Tag,
  Typography,
  type TableProps,
} from "antd";

const { Header, Content, Sider } = Layout;
const { Text, Title } = Typography;

type OperationRecord = {
  key: string;
  type: "신고" | "문의" | "콘텐츠" | "회원";
  summary: string;
  owner: string;
  time: string;
  status: "대기" | "처리 중" | "완료";
};

const operations: OperationRecord[] = [
  {
    key: "1",
    type: "신고",
    summary: "부적절한 댓글 신고가 접수되었어요",
    owner: "김하늘",
    time: "8분 전",
    status: "대기",
  },
  {
    key: "2",
    type: "문의",
    summary: "가족 초대 링크 사용 방법을 문의했어요",
    owner: "이서준",
    time: "21분 전",
    status: "처리 중",
  },
  {
    key: "3",
    type: "콘텐츠",
    summary: "성장 카드 템플릿이 새로 등록되었어요",
    owner: "운영팀",
    time: "1시간 전",
    status: "완료",
  },
  {
    key: "4",
    type: "회원",
    summary: "휴면 계정 복구 요청을 확인해 주세요",
    owner: "박지우",
    time: "2시간 전",
    status: "대기",
  },
];

const columns: TableProps<OperationRecord>["columns"] = [
  {
    title: "유형",
    dataIndex: "type",
    width: 88,
    render: (type: OperationRecord["type"]) => (
      <Tag className={`type-tag type-tag-${type}`}>{type}</Tag>
    ),
  },
  {
    title: "내용",
    dataIndex: "summary",
    render: (summary: string) => <Text strong>{summary}</Text>,
  },
  { title: "담당/요청자", dataIndex: "owner", width: 116 },
  { title: "접수 시간", dataIndex: "time", width: 100 },
  {
    title: "상태",
    dataIndex: "status",
    width: 96,
    render: (status: OperationRecord["status"]) => (
      <span className={`status status-${status.replace(" ", "-")}`}>{status}</span>
    ),
  },
  {
    title: "",
    key: "actions",
    width: 44,
    align: "right",
    render: () => (
      <Button type="text" icon={<MoreOutlined />} aria-label="작업 더 보기" />
    ),
  },
];

const menuItems = [
  { key: "dashboard", icon: <DashboardOutlined />, label: "대시보드" },
  {
    type: "group" as const,
    label: "서비스 관리",
    children: [
      { key: "members", icon: <TeamOutlined />, label: "회원 관리" },
      { key: "contents", icon: <PictureOutlined />, label: "콘텐츠 관리" },
      { key: "reports", icon: <FlagOutlined />, label: "신고 관리", badge: 5 },
      { key: "events", icon: <GiftOutlined />, label: "이벤트 관리" },
    ],
  },
  {
    type: "group" as const,
    label: "운영",
    children: [
      { key: "notices", icon: <FileTextOutlined />, label: "공지사항" },
      { key: "settings", icon: <SettingOutlined />, label: "환경 설정" },
    ],
  },
];

function StatCard({
  label,
  value,
  change,
  tone = "default",
}: {
  label: string;
  value: string;
  change: string;
  tone?: "default" | "primary";
}) {
  return (
    <Card className={`stat-card ${tone === "primary" ? "stat-card-primary" : ""}`}>
      <Text className="stat-label">{label}</Text>
      <div className="stat-value">{value}</div>
      <Text className="stat-change">{change}</Text>
    </Card>
  );
}

export default function Home() {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#ff5647",
          colorInfo: "#ff5647",
          colorText: "#202227",
          colorTextSecondary: "#74788b",
          colorBorder: "#e3e4e8",
          colorBgLayout: "#f9fafa",
          borderRadius: 12,
          borderRadiusLG: 20,
          fontFamily: "Pretendard, -apple-system, BlinkMacSystemFont, sans-serif",
        },
        components: {
          Button: { controlHeight: 40, fontWeight: 600 },
          Card: { bodyPadding: 24 },
          Menu: { itemBorderRadius: 12, itemHeight: 44 },
          Table: { headerBg: "#f9fafa", headerColor: "#74788b" },
        },
      }}
    >
      <App>
        <Layout className="admin-shell">
          <Sider width={248} className="admin-sider" theme="light">
            <div className="brand" aria-label="Neki Admin 홈">
              <span className="brand-mark">N</span>
              <span className="brand-name">Neki</span>
              <span className="brand-product">Admin</span>
            </div>

            <Menu
              mode="inline"
              selectedKeys={["dashboard"]}
              items={menuItems.map((item) => {
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
              })}
              className="side-menu"
            />

            <div className="sider-footer">
              <div className="system-chip">
                <span className="system-dot" />
                Design system v0.1
              </div>
              <Button type="text" icon={<LogoutOutlined />} block className="logout-button">
                로그아웃
              </Button>
            </div>
          </Sider>

          <Layout>
            <Header className="admin-header">
              <Input
                prefix={<SearchOutlined />}
                placeholder="회원, 콘텐츠, 신고 검색"
                aria-label="관리자 통합 검색"
                className="global-search"
              />
              <Flex align="center" gap={16}>
                <Badge dot>
                  <Button type="text" icon={<BellOutlined />} aria-label="알림 확인" />
                </Badge>
                <button className="profile-button" type="button" aria-label="관리자 프로필 열기">
                  <Avatar size={36} icon={<UserOutlined />} />
                  <span className="profile-copy">
                    <strong>네키 운영자</strong>
                    <small>Super Admin</small>
                  </span>
                  <CaretDownOutlined />
                </button>
              </Flex>
            </Header>

            <Content className="admin-content">
              <section className="page-heading">
                <div>
                  <Text className="eyebrow">2026년 8월 1일 토요일</Text>
                  <Title level={1}>안녕하세요, 운영자님</Title>
                  <Text type="secondary">오늘 네키에서 확인할 운영 현황을 모았어요.</Text>
                </div>
                <Space>
                  <Button>리포트 내보내기</Button>
                  <Button type="primary">새 공지 작성</Button>
                </Space>
              </section>

              <section className="stat-grid" aria-label="오늘의 주요 지표">
                <StatCard label="전체 회원" value="12,482" change="지난주보다 8.4% 증가" tone="primary" />
                <StatCard label="오늘 가입" value="128" change="어제보다 14명 증가" />
                <StatCard label="새 콘텐츠" value="346" change="오늘 등록된 기록" />
                <StatCard label="처리 대기" value="17" change="신고 5건 · 문의 12건" />
              </section>

              <section className="dashboard-grid">
                <Card className="chart-card">
                  <Flex justify="space-between" align="flex-start">
                    <div>
                      <Title level={3}>주간 활동</Title>
                      <Text type="secondary">최근 7일간 생성된 성장 기록</Text>
                    </div>
                    <Button>최근 7일</Button>
                  </Flex>
                  <div className="bar-chart" aria-label="주간 활동 막대 그래프">
                    {[58, 74, 49, 84, 66, 92, 78].map((height, index) => (
                      <div className="bar-column" key={index}>
                        <div className={`bar ${index === 5 ? "bar-active" : ""}`} style={{ height: `${height}%` }} />
                        <span>{["월", "화", "수", "목", "금", "토", "일"][index]}</span>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="goal-card">
                  <Text className="eyebrow">이번 달 목표</Text>
                  <Title level={3}>가족 연결 활성화</Title>
                  <div className="goal-progress">
                    <Progress type="circle" percent={72} strokeColor="#ff5647" trailColor="#ffeceb" size={132} />
                  </div>
                  <Text type="secondary">목표 2,000가족 중 1,440가족이 연결됐어요.</Text>
                  <Button type="link" className="goal-link">자세히 보기</Button>
                </Card>
              </section>

              <Card className="operations-card">
                <Flex justify="space-between" align="center" className="section-heading">
                  <div>
                    <Title level={3}>최근 운영 요청</Title>
                    <Text type="secondary">처리가 필요한 최신 항목입니다.</Text>
                  </div>
                  <Button>전체 보기</Button>
                </Flex>
                <Table<OperationRecord>
                  columns={columns}
                  dataSource={operations}
                  pagination={false}
                  rowKey="key"
                  scroll={{ x: 760 }}
                />
              </Card>
            </Content>
          </Layout>
        </Layout>
      </App>
    </ConfigProvider>
  );
}
