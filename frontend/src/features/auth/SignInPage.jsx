import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "../../design/Button";
import { Card, Eyebrow } from "../../design/Card";
import { Field, TextInput } from "../../design/Field";
import { isCognitoConfigured } from "../../lib/auth";
import { useAuth } from "./AuthContext";

export function SignInPage() {
  const { signIn, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const configured = isCognitoConfigured();
  const from = location.state?.from || "/lender";

  async function onSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || "Could not sign in. Check email and password.");
    } finally {
      setLoading(false);
    }
  }

  if (user) {
    return (
      <div className="mx-auto max-w-md">
        <h1 className="font-display text-4xl text-ink">You’re signed in</h1>
        <p className="mt-4 text-ink-muted">Lender tools are available for this session.</p>
        <Link to="/lender" className="mt-10 inline-block">
          <Button>Open lender dashboard</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <Eyebrow>Lender access</Eyebrow>
      <h1 className="font-display mt-4 text-4xl text-ink">Sign in</h1>
      <p className="mt-4 text-ink-muted">Applicants never need an account. Sign-in is only for reviewers.</p>

      <Card className="mt-10">
        {!configured ? (
          <p className="text-sm leading-relaxed text-ink-muted">
            Add <code className="text-ink">VITE_COGNITO_USER_POOL_ID</code> and <code className="text-ink">VITE_COGNITO_CLIENT_ID</code>{" "}
            to <code className="text-ink">frontend/.env</code> after <code className="text-ink">sam deploy</code>.
          </p>
        ) : (
          <form className="space-y-6" onSubmit={onSubmit}>
            <Field label="Email">
              <TextInput type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
            </Field>
            <Field label="Password" error={error}>
              <TextInput
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                aria-invalid={Boolean(error)}
              />
            </Field>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
