import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MapPinned, Network, FolderKanban, FileSearch } from "lucide-react";

import { useAuth } from "../auth/AuthContext";
import { canViewCrimeMap } from "../utils/role";

// Turns a chat answer into next steps in the other modules (Crime Map,
// Criminal Networks, Investigations) — derived from the result columns and
// the filters in the executed SQL, so links always match what was asked.

const COL = {
  district: /^(district|district_?name)$/i,
  station: /^(station|station_?name|unit_?name|police_?station)$/i,
  crime: /^(crime_?head_?name|crime_?type|crime_?sub_?head|crime_?name|crime)$/i,
  person: /^(accused_?name|accused|offender|suspect|person_?name)$/i,
  caseId: /^case_?master_?id$/i,
  crimeNo: /^(crime_?no|fir_?no|crime_?number)$/i,
};

function findCol(columns, re) {
  return columns.find((c) => re.test(c.replace(/\s+/g, "_")));
}

function topValues(rows, col, n) {
  const seen = [];
  for (const r of rows) {
    const v = r?.[col];
    if (v == null || v === "" || seen.includes(String(v))) continue;
    seen.push(String(v));
    if (seen.length >= n) break;
  }
  return seen;
}

function sqlFilter(sql, column) {
  const m = String(sql || "").match(new RegExp(`${column}\\s*(?:=|LIKE)\\s*'([^'%]+)'`, "i"));
  return m ? m[1] : null;
}

function deriveIntelActions(analysis, { mapAllowed = true } = {}) {
  const rows = Array.isArray(analysis?.sql_result) ? analysis.sql_result : [];
  const sql = analysis?.sql_query || "";
  if (!rows.length && !sql) return [];
  const columns = rows.length ? Object.keys(rows[0]) : [];

  const districtCol = findCol(columns, COL.district);
  const stationCol = findCol(columns, COL.station);
  const crimeCol = findCol(columns, COL.crime);
  const personCol = findCol(columns, COL.person);
  const caseIdCol = findCol(columns, COL.caseId);
  const crimeNoCol = findCol(columns, COL.crimeNo);

  const district = (districtCol && topValues(rows, districtCol, 1)[0]) || sqlFilter(sql, "DistrictName");
  const crime =
    sqlFilter(sql, "CrimeHeadName") || (crimeCol && rows.length <= 3 ? topValues(rows, crimeCol, 1)[0] : null);
  const station = (stationCol && topValues(rows, stationCol, 1)[0]) || sqlFilter(sql, "UnitName");

  const actions = [];
  const qs = (o) =>
    new URLSearchParams(Object.fromEntries(Object.entries(o).filter(([, v]) => v))).toString();

  if (mapAllowed && (district || crime)) {
    actions.push({
      kind: "map",
      icon: MapPinned,
      labelKey: district ? "intelActions.mapDistrict" : "intelActions.mapCrime",
      vars: { district, crime },
      to: `/crime-intelligence-map?${qs({ district, crime })}`,
    });
  }

  if (personCol) {
    topValues(rows, personCol, 2).forEach((person) =>
      actions.push({
        kind: "network",
        icon: Network,
        labelKey: "intelActions.network",
        vars: { person },
        to: `/networks?${qs({ person })}`,
      }),
    );
  }

  if (caseIdCol) {
    const id = topValues(rows, caseIdCol, 1)[0];
    const label = crimeNoCol ? rows.find((r) => String(r[caseIdCol]) === id)?.[crimeNoCol] : id;
    actions.push({
      kind: "case",
      icon: FileSearch,
      labelKey: "intelActions.case",
      vars: { id: label || id },
      to: `/investigations/${encodeURIComponent(id)}`,
    });
  } else if (crimeNoCol) {
    const no = topValues(rows, crimeNoCol, 1)[0];
    actions.push({
      kind: "case",
      icon: FileSearch,
      labelKey: "intelActions.case",
      vars: { id: no },
      to: `/investigations?${qs({ search: no })}`,
    });
  }

  if (district || station || crime) {
    actions.push({
      kind: "queue",
      icon: FolderKanban,
      labelKey: station ? "intelActions.queueStation" : district ? "intelActions.queueDistrict" : "intelActions.queueCrime",
      vars: { district, station, crime },
      to: `/investigations?${qs({ district: station ? null : district, station, search: crime })}`,
    });
  }

  return actions.slice(0, 4);
}

export default function IntelActions({ analysis }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { officer } = useAuth();
  const actions = deriveIntelActions(analysis, { mapAllowed: canViewCrimeMap(officer) });
  if (!actions.length) return null;

  return (
    <div className="mb-2 mt-1">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        {t("intelActions.title")}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <button
              key={a.to}
              onClick={() => navigate(a.to)}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11.5px] font-medium text-slate-700 shadow-xs transition hover:border-navy hover:bg-navy hover:text-white cursor-pointer"
            >
              <Icon size={12} className="shrink-0" />
              <span className="truncate">{t(a.labelKey, a.vars)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
