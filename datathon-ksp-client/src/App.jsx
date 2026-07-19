import { useEffect } from "react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import toast from "react-hot-toast";

import Home from "./pages/Home";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Investigations from "./pages/Investigations";
import CrimeIntelligenceMap from "./pages/CrimeIntelligenceMap";
import Networks from "./pages/Networks";
import Reports from "./pages/Reports";
import DashboardLayout from "./components/DashboardLayout";

import { AuthProvider, useAuth } from "./auth/AuthContext";
import ProtectedRoute from "./auth/ProtectedRoute";

function LoginRoute() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen bg-slate-50" />;
  }

  if (isAuthenticated) {
    return <Home />;
  }

  return <Login />;
}

function SessionListener() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    function handleSessionExpired() {
      toast.error("Your session has expired. Please sign in again.");
      signOut();
      navigate("/login", { replace: true });
    }

    window.addEventListener("session-expired", handleSessionExpired);

    return () => {
      window.removeEventListener("session-expired", handleSessionExpired);
    };
  }, [navigate, signOut]);

  return null;
}

function AppRoutes() {
  return (
    <>
      <SessionListener />
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/signup" element={<Signup />} />

        <Route
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          {/* New Chat (Empty) */}
          <Route path="/" element={<Home />} />

          {/* Specific Chat by ID */}
          <Route path="/chat/:id" element={<Home />} />

          <Route path="/investigations" element={<Investigations />} />
          <Route
            path="/crime-intelligence-map"
            element={<CrimeIntelligenceMap />}
          />
          <Route path="/networks" element={<Networks />} />
          <Route path="/reports" element={<Reports />} />
        </Route>
      </Routes>
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <Toaster position="top-center" reverseOrder={false} />
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
