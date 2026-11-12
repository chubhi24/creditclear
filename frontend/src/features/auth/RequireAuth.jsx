import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

export function RequireAuth({ children }) {
  const { user, ready } = useAuth();
  const location = useLocation();

  if (!ready) {
    return <p className="text-ink-muted">Checking your session…</p>;
  }

  if (!user) {
    return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  }

  return children;
}
