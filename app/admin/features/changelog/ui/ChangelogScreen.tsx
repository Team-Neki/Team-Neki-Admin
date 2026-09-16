import { Card, Tag, Timeline, Typography } from "antd";
import { AdminPageHeader } from "../../../shared/ui/AdminPageHeader";
import { changelogReleases, type ChangelogEntry, type ChangelogRelease } from "../model/changelog";

const { Text, Title } = Typography;

const entryColor: Record<ChangelogEntry["type"], string> = {
  추가: "blue",
  개선: "green",
};

function ReleaseContent({ release }: { release: ChangelogRelease }) {
  return (
    <Card className="content-card changelog-release-card">
      <div className="changelog-release-heading">
        <Title level={2}>{release.version}</Title>
        <Tag color={release.status === "다음 버전" ? "gold" : "default"}>{release.status}</Tag>
      </div>
      <ul className="changelog-entry-list">
        {release.entries.map((entry) => (
          <li key={`${entry.type}-${entry.title}`}>
            <Tag color={entryColor[entry.type]}>{entry.type}</Tag>
            <Text>{entry.title}</Text>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function ChangelogScreen() {
  return (
    <>
      <AdminPageHeader title="변경 로그" />
      <Timeline
        className="changelog-timeline"
        items={changelogReleases.map((release) => ({
          color: release.status === "다음 버전" ? "orange" : "gray",
          content: <ReleaseContent release={release} />,
        }))}
      />
    </>
  );
}
