import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./design/Layout";
import { AuthProvider } from "./features/auth/AuthContext";
import { RequireAuth } from "./features/auth/RequireAuth";
import { SignInPage } from "./features/auth/SignInPage";
import { ExplainabilityPage } from "./features/explainability/ExplainabilityPage";
import { HomePage } from "./features/home/HomePage";
import { IntakePage } from "./features/intake/IntakePage";
import { LenderPage } from "./features/lender/LenderPage";
import { PlanPage } from "./features/plan/PlanPage";
import { PrivacyPage } from "./features/privacy/PrivacyPage";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="apply" element={<IntakePage />} />
            <Route path="explainability" element={<ExplainabilityPage />} />
            <Route path="plan" element={<PlanPage />} />
            <Route
              path="lender"
              element={
                <RequireAuth>
                  <LenderPage />
                </RequireAuth>
              }
            />
            <Route path="signin" element={<SignInPage />} />
            <Route path="privacy" element={<PrivacyPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
