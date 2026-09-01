import type { Metadata } from "next";
import { headers } from "next/headers";
import "antd/dist/reset.css";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  const metadataBase = new URL(`${protocol}://${host}`);

  return {
    metadataBase,
    title: "Neki Admin",
    description: "네키 서비스 운영을 위한 관리자 대시보드",
    openGraph: {
      title: "Neki Admin",
      description: "네키 서비스 운영을 위한 관리자 대시보드",
      type: "website",
      images: [{ url: "/og.png", width: 1736, height: 908 }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Neki Admin",
      description: "네키 서비스 운영을 위한 관리자 대시보드",
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
