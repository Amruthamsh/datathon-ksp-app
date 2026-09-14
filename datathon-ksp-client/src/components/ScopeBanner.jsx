import { ShieldCheck } from "lucide-react";
import PropTypes from "prop-types";
import { getOfficerTier, scopeLabel, TIERS } from "../utils/role";

const TIER_BADGE = {
  [TIERS.STATE]: "bg-purple-100 text-purple-800 border-purple-200",
  [TIERS.DISTRICT]: "bg-blue-100 text-blue-800 border-blue-200",
  [TIERS.STATION]: "bg-amber-100 text-amber-800 border-amber-200",
  [TIERS.FIELD]: "bg-slate-100 text-slate-700 border-slate-200",
};

const TIER_NAME = {
  [TIERS.STATE]: "State Command",
  [TIERS.DISTRICT]: "District Command",
  [TIERS.STATION]: "Station Command",
  [TIERS.FIELD]: "Field Force",
};

/**
 * Step 4: tells the user *why* they see the cases they see.
 * e.g. "District Command — viewing all Bengaluru Urban cases"
 */
export default function ScopeBanner({ officer, count }) {
  const tier = getOfficerTier(officer);
  const posting =
    officer?.unit_name ||
    officer?.district_name ||
    officer?.district ||
    "";
  const scopeText =
    tier === TIERS.STATE
      ? "Viewing all cases statewide"
      : tier === TIERS.DISTRICT
        ? `Viewing all ${posting || "district"} cases`
        : tier === TIERS.STATION
          ? `Viewing all ${posting || "station"} cases`
          : "Viewing only your assigned cases";

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-600">
      <ShieldCheck size={15} className="text-slate-500" />
      <span
        className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TIER_BADGE[tier] || TIER_BADGE[TIERS.FIELD]}`}
      >
        {TIER_NAME[tier] || TIER_NAME[TIERS.FIELD]}
      </span>
      <span>{scopeText}</span>
      {typeof count === "number" && (
        <span className="font-semibold text-slate-800">· {count}</span>
      )}
      <span className="text-slate-400" title={scopeLabel(tier)}>
        ({scopeLabel(tier)})
      </span>
    </div>
  );
}

ScopeBanner.propTypes = {
  officer: PropTypes.object,
  count: PropTypes.number,
};
