import type { Metadata } from "next";
import { headers } from "next/headers";
import "antd/dist/reset.css";
import "./globals.css";

const SITE_TITLE = "Neki Admin";
const SITE_DESCRIPTION = "네키 서비스의 지표, 알림, 브랜드, 부스와 콘텐츠를 관리하는 운영자 페이지";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  const metadataBase = new URL(`${protocol}://${host}`);

  return {
    applicationName: SITE_TITLE,
    metadataBase,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    robots: {
      index: false,
      follow: false,
    },
    openGraph: {
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      siteName: SITE_TITLE,
      locale: "ko_KR",
      type: "website",
      url: "/",
      images: [{ url: "/og.png", width: 1732, height: 908, alt: "Neki Admin" }],
    },
    twitter: {
      card: "summary_large_image",
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
