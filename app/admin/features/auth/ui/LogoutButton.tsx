import { Button } from "antd";
import { useAuthAction } from "../model/useAuthAction";
import styles from "./LoginScreen.module.css";
import { useAdminUser } from "./AdminSessionBoundary";

export function LogoutButton() {
  const user = useAdminUser();
  const { run, busy, error } = useAuthAction("sign-out");
  if (!user) return null;
  return <>
    <Button type="text" block className="logout-button" loading={busy} disabled={busy} onClick={run}>로그아웃</Button>
    {error && <p className={styles.logoutError} role="alert">{error}</p>}
  </>;
}
