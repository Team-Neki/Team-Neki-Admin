import { Typography } from "antd";
import type { ReactNode } from "react";

const { Title } = Typography;

type AdminPageHeaderProps = {
  title: string;
  action?: ReactNode;
};

export function AdminPageHeader({ title, action }: AdminPageHeaderProps) {
  return (
    <section className="page-heading">
      <Title level={1}>{title}</Title>
      {action}
    </section>
  );
}
