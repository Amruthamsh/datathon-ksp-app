// Mock data for fields not yet in SQLite — frontend-only, flagged isMock.
// Generates deterministic pseudo-random per caseId so every case has plausible data.

function seeded(n) {
  let x = n * 2654435761 % 2**32;
  return () => {
    x = (x * 1664525 + 1013904223) % 2**32;
    return x / 2**32;
  };
}

function pick(rnd, arr) { return arr[Math.floor(rnd() * arr.length)]; }

export function getMockExtensions(caseId, realIntel) {
  const rnd = seeded(Number(caseId) || 1);
  const accusedCount = realIntel?.accused?.length ?? Math.floor(rnd()*3)+1;

  // --- Per-accused mock: arrest/bail/prior ---
  const mockAccused = (realIntel?.accused || []).map((a, idx) => {
    const r = seeded(Number(caseId)*100 + idx);
    const statuses = ["Arrested", "Arrested", "Absconding"];
    const arrestStatus = pick(r, statuses);
    const bailOptions = arrestStatus === "Absconding" ? ["—"] : ["Remand", "Bail granted", "Remand"];
    const priorCases = Math.floor(r()*4);
    const convictions = priorCases > 0 ? Math.floor(r()*2) : 0;
    const hasWarrant = arrestStatus === "Absconding" && r() > 0.4;
    // arrest date 2-40 days ago
    const daysAgo = Math.floor(r()*38)+2;
    const arrestDate = new Date(Date.now() - daysAgo*864e5).toISOString();
    return {
      arrestStatus,
      arrestDate: arrestStatus === "Absconding" ? null : arrestDate,
      bailStatus: pick(r, bailOptions),
      priorCases,
      convictions,
      warrantIssued: hasWarrant,
      nextHearing: arrestStatus !== "Absconding" ? new Date(Date.now() + Math.floor(r()*14+2)*864e5).toISOString() : null,
    };
  });

  // Witnesses
  const witnessCount = Math.floor(rnd()*4)+1;
  const witnesses = Array.from({length: witnessCount}, (_,i) => {
    const r = seeded(Number(caseId)*200 + i);
    const examined = r() > 0.45;
    return {
      name: pick(r, ["Ramesh K.", "Sunita Devi", " Prakash Rao", "Lakshmi N.", "Arjun Gowda", "Meena Kumari"]).trim(),
      summonsSent: r() > 0.2,
      examined,
      statementRecorded: examined || r() > 0.5,
    };
  });

  // Victim statements
  const victimStatements = (realIntel?.victims || []).map((_,i) => {
    const r = seeded(Number(caseId)*300 + i);
    return r() > 0.35;
  });

  // FSL
  const fslStatuses = ["pending", "sent", "received", "overdue"];
  const fslStatus = pick(rnd, fslStatuses);
  const fslSentDaysAgo = Math.floor(rnd()*25)+3;
  const fsl = {
    sent: fslStatus !== "pending",
    sentDate: fslStatus !== "pending" ? new Date(Date.now() - fslSentDaysAgo*864e5).toISOString() : null,
    reportReceived: fslStatus === "received",
    reportDate: fslStatus === "received" ? new Date(Date.now() - Math.floor(rnd()*5+1)*864e5).toISOString() : null,
    status: fslStatus,
    isMock: true,
  };

  // Court
  const courts = ["Sessions", "Magistrate"];
  const nextHearingDays = Math.floor(rnd()*20)+1;
  const court = {
    courtType: pick(rnd, courts),
    nextHearingDate: new Date(Date.now() + nextHearingDays*864e5).toISOString(),
    purpose: pick(rnd, ["Charge framing", "Bail hearing", "Witness examination", "Remand extension", "Chargesheet scrutiny"]),
    bailGrantableBy: pick(rnd, ["Court only", "Inspector can grant", "Court only"]),
    isMock: true,
  };

  // Property/seizure
  const property = {
    seized: rnd() > 0.4,
    items: pick(rnd, ["Mobile phone — seized", "Weapon — seized", "Cash ₹45,000 — seized", "Vehicle KA-05 — seized", "Documents — pending seizure"]),
    isMock: true,
  };

  // Timeline events (deterministic)
  const baseFIR = new Date(Date.now() - (Math.floor(rnd()*80)+10)*864e5);
  const timeline = [
    { date: baseFIR.toISOString(), title: "FIR registered", detail: "Case registered at station" },
  ];
  if (mockAccused.some(a=>a.arrestDate)) {
    const arr = mockAccused.find(a=>a.arrestDate);
    timeline.push({ date: arr.arrestDate, title: "Arrest", detail: `${realIntel?.accused?.find((_,i)=>mockAccused[i].arrestStatus==="Arrested")?.AccusedName || "Accused"} arrested` });
  }
  if (fsl.sent) timeline.push({ date: fsl.sentDate, title: "FSL sent", detail: "Evidence sent to FSL" });
  if (fsl.reportReceived) timeline.push({ date: fsl.reportDate, title: "FSL report received", detail: "Forensic report filed" });
  timeline.push({ date: court.nextHearingDate, title: "Next hearing", detail: court.purpose });
  timeline.sort((a,b)=> new Date(a.date)-new Date(b.date));

  return {
    mockAccused,
    witnesses,
    victimStatements,
    fsl,
    court,
    property,
    timeline,
    isMock: true,
  };
}
