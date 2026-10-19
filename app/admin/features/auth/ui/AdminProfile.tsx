import { Avatar } from "antd";
import { useAdminUser } from "./AdminSessionBoundary";
import styles from "./LoginScreen.module.css";
import { LogoutButton } from "./LogoutButton";

export function AdminProfile() {
  const user = useAdminUser();
  if (!user) return null;
  return <>
  <div className={`profile-button ${styles.profile}`} role="group" aria-label={`로그인 계정 ${user.email}`} title={user.email}>
    <Avatar size={36}>{user.name.slice(0, 1)}</Avatar>
    <span className="profile-copy"><strong>{user.name}</strong><small>{user.email}</small></span>
  </div>
  <div className={styles.mobileLogout}><LogoutButton /></div>
  </>;
}
