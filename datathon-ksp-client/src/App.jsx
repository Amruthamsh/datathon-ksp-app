import { useEffect } from "react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";

import Home from "./pages/Home";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import InvestigationsQueue from "./pages/InvestigationsQueue";
import InvestigationWorkspace from "./pages/InvestigationWorkspace";
import CrimeIntelligenceMap from "./pages/CrimeIntelligenceMap";
import Networks from "./pages/Networks";
import Reports from "./pages/Reports";
import DashboardLayout from "./components/DashboardLayout";
import InvestigationWorkspaceLayout from "./components/investigations/InvestigationWorkspaceLayout";

import { AuthProvider, useAuth } from "./auth/AuthContext";
import ProtectedRoute from "./auth/ProtectedRoute";

function LoginRoute() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-slate-50" />;
  if (isAuthenticated) return <Home />;
  return <Login />;
}

function SessionListener() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  useEffect(() => {
    function handleSessionExpired() {
      toast.error(t("app.sessionExpired"));
      signOut();
      navigate("/login", { replace: true });
    }
    window.addEventListener("session-expired", handleSessionExpired);
    return () => window.removeEventListener("session-expired", handleSessionExpired);
  }, [navigate, signOut, t]);
  return null;
}

function AppRoutes() {
  return (
    <>
      <SessionListener />
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/signup" element={<Signup />} />
        <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
          <Route path="/" element={<Home />} />
          <Route path="/chat/:id" element={<Home />} />
          <Route path="/investigations" element={<InvestigationsQueue />} />
          <Route path="/crime-intelligence-map" element={<CrimeIntelligenceMap />} />
          <Route path="/networks" element={<Networks />} />
          <Route path="/reports" element={<Reports />} />
        </Route>
        <Route element={<ProtectedRoute><InvestigationWorkspaceLayout /></ProtectedRoute>}>
          <Route path="/investigations/:caseId" element={<InvestigationWorkspace />} />
        </Route>
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Toaster position="top-center" reverseOrder={false} />
      <BrowserRouter><AppRoutes /></BrowserRouter>
    </AuthProvider>
  );
}
