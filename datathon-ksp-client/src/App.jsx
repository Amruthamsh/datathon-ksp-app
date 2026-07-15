import { useEffect } from "react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import toast from "react-hot-toast";

import Home from "./pages/Home";
import Login from "./pages/Login";
import Signup from "./pages/Signup";

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
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          }
        />

        <Route path="/login" element={<LoginRoute />} />

        <Route path="/signup" element={<Signup />} />
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
