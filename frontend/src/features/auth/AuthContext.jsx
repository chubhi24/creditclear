import { createContext, useContext, useEffect, useMemo, useState } from "react";
import * as auth from "../../lib/auth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [idToken, setIdToken] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    auth
      .getSession()
      .then((session) => {
        if (session) {
          setUser(auth.getCurrentUser());
          setIdToken(session.getIdToken().getJwtToken());
        }
      })
      .catch(() => {
        setUser(null);
        setIdToken(null);
      })
      .finally(() => setReady(true));
  }, []);

  const value = useMemo(
    () => ({
      user,
      idToken,
      ready,
      async signIn(email, password) {
        const result = await auth.signIn(email, password);
        setUser(result.user);
        setIdToken(result.session.getIdToken().getJwtToken());
      },
      signOut() {
        auth.signOut();
        setUser(null);
        setIdToken(null);
      },
    }),
    [user, idToken, ready],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
