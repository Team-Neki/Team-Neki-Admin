import Image from "next/image";
import { useEffect, useRef, type ComponentRef } from "react";
import GoogleOutlined from "@ant-design/icons/GoogleOutlined";
import { Alert, Button, ConfigProvider } from "antd";
import koKR from "antd/locale/ko_KR";
import { useAuthAction } from "../model/useAuthAction";
import styles from "./LoginScreen.module.css";

const errorMessage = (error?: string) => {
  if (!error) return undefined;
  if (error === "admin_access_denied") return "접근 권한이 없습니다. 다른 Google 계정으로 로그인해 주세요.";
  if (error === "access_denied") return "로그인을 취소했습니다. 다시 시도해 주세요.";
  if (error === "session_expired") return "로그인이 만료되었습니다. 다시 로그인해 주세요.";
  return "로그인하지 못했습니다. 다시 시도해 주세요.";
};

export function LoginScreen({ configured, returnTo, error }: { configured: boolean; returnTo: string; error?: string }) {
  const action = useAuthAction("sign-in", returnTo);
  const button = useRef<ComponentRef<typeof Button>>(null);
  useEffect(() => { if (action.error) button.current?.focus(); }, [action.error]);
  const message = !configured ? "로그인 설정을 확인해 주세요." : action.error ?? errorMessage(error);
  return <ConfigProvider locale={koKR} theme={{ token: { fontFamily: "inherit", borderRadius: 10, controlHeight: 44 } }}>
    <main className={styles.page}>
      <section className={styles.panel} aria-labelledby="login-heading">
        <Image className={styles.logo} src="/icon.png" width={52} height={52} alt="네키" priority unoptimized />
        <h1 id="login-heading">Neki Admin</h1>
        <p className={styles.label}>관리자 로그인</p>
        <Button ref={button} className={styles.google} aria-label="Google로 로그인" block icon={<GoogleOutlined aria-hidden />} loading={action.busy} disabled={!configured || action.busy} onClick={action.run}>Google로 로그인</Button>
        <div className={styles.feedback} aria-live="polite">
          {message && <Alert type={!configured ? "warning" : "error"} showIcon title={message} />}
        </div>
      </section>
    </main>
  </ConfigProvider>;
}
