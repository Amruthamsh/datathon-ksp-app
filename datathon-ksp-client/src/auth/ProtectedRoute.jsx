import { Navigate, useLocation } from "react-router-dom";
import PropTypes from "prop-types";
import { useAuth } from "./AuthContext";
import { getOfficerTier } from "../utils/role";

/**
 * Step 3: optional per-route RBAC. Pass allowedTiers={["state_command",
 * "district_command"]} to restrict a feature to command tiers — anyone else
 * is sent back to /investigations.
 */
export default function ProtectedRoute({ children, allowedTiers }) {
  const { isAuthenticated, loading, officer } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="min-h-screen bg-slate-50" />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (allowedTiers && allowedTiers.length > 0) {
    const tier = getOfficerTier(officer);
    if (!allowedTiers.includes(tier)) {
      return <Navigate to="/investigations" replace />;
    }
  }

  return children;
}

ProtectedRoute.propTypes = {
  children: PropTypes.node,
  allowedTiers: PropTypes.arrayOf(PropTypes.string),
};
