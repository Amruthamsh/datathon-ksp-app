import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import ProtectedRoute from "./auth/ProtectedRoute";
import { Toaster } from "react-hot-toast";

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

function App() {
  return (
    <AuthProvider>
      <Toaster position="top-center" reverseOrder={false} />
      <BrowserRouter>
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
      </BrowserRouter>
    </AuthProvider>
  );
}
export default App;
