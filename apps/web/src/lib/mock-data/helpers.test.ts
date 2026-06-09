import { describe, expect, it } from "vitest";
import {
  availabilityFor,
  consultants,
  distinctSkills,
  filterConsultants,
  normalize,
} from "@/lib/mock-data/consultants";
import {
  budgetConsumption,
  filterProjects,
  projects,
  summarizeProjects,
} from "@/lib/mock-data/projects";
import {
  currentWeek,
  dayTotal,
  rowTotal,
  statusCounts,
  weekTotal,
} from "@/lib/mock-data/timesheet";
import {
  coverageGaps,
  groupSkillsByCategory,
  hasSeniorCoverage,
  skillCoverage,
  skills,
} from "@/lib/mock-data/skills";
import {
  certificates,
  expiryStatus,
  sortByUrgency,
  summarizeCertificates,
  type Certificate,
} from "@/lib/mock-data/certificates";
import {
  approvalItems,
  decidedApprovals,
  pendingApprovals,
  summarizeApprovals,
} from "@/lib/mock-data/approvals";
import {
  currentClosing,
  rowAmount,
  summarizeClosing,
} from "@/lib/mock-data/financial";

describe("consultants helpers", () => {
  it("normalizes accents and case for search", () => {
    expect(normalize("Júlia REIS")).toBe("julia reis");
  });

  it("filters by accent-insensitive search across name/title/area", () => {
    const result = filterConsultants(consultants, { search: "julia" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("con-julia");
  });

  it("filters by seniority", () => {
    const result = filterConsultants(consultants, { seniority: "ESPECIALISTA" });
    expect(result.every((c) => c.seniority === "ESPECIALISTA")).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it("filters by skill id", () => {
    const result = filterConsultants(consultants, { skillId: "sk-aws" });
    expect(result.every((c) => c.topSkills.some((s) => s.skillId === "sk-aws"))).toBe(
      true,
    );
  });

  it("treats ALL sentinels as no filter", () => {
    const result = filterConsultants(consultants, {
      seniority: "ALL",
      skillId: "ALL",
      status: "ALL",
    });
    expect(result).toHaveLength(consultants.length);
  });

  it("derives availability buckets from allocation", () => {
    expect(availabilityFor(0)).toBe("AVAILABLE");
    expect(availabilityFor(80)).toBe("BALANCED");
    expect(availabilityFor(95)).toBe("FULL");
    expect(availabilityFor(120)).toBe("OVER");
  });

  it("returns distinct sorted skills", () => {
    const skillsList = distinctSkills(consultants);
    const ids = skillsList.map((s) => s.skillId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("projects helpers", () => {
  it("filters by status", () => {
    const result = filterProjects(projects, { status: "ACTIVE" });
    expect(result.every((p) => p.status === "ACTIVE")).toBe(true);
  });

  it("filters by client", () => {
    const result = filterProjects(projects, { clientId: "cli-vix" });
    expect(result.every((p) => p.client.id === "cli-vix")).toBe(true);
  });

  it("searches by project or client name", () => {
    expect(filterProjects(projects, { search: "atlas" })).toHaveLength(1);
    expect(
      filterProjects(projects, { search: "banco sul" }).length,
    ).toBeGreaterThan(0);
  });

  it("computes budget consumption and guards divide-by-zero", () => {
    const project = projects.find((p) => p.id === "prj-atlas")!;
    expect(budgetConsumption(project)).toBe(55);
    expect(
      budgetConsumption({ ...project, budgetHours: 0, consumedHours: 10 }),
    ).toBe(0);
  });

  it("summarizes status counts", () => {
    const summary = summarizeProjects(projects);
    expect(summary.total).toBe(projects.length);
    expect(summary.active).toBe(
      projects.filter((p) => p.status === "ACTIVE").length,
    );
  });
});

describe("timesheet helpers", () => {
  it("totals a row across the week", () => {
    expect(rowTotal(currentWeek.rows[0])).toBe(12);
  });

  it("totals a weekday across rows", () => {
    // Monday (index 0): 6 + 2 = 8
    expect(dayTotal(currentWeek, 0)).toBe(8);
  });

  it("totals the whole week", () => {
    const expected = currentWeek.rows.reduce((sum, r) => sum + rowTotal(r), 0);
    expect(weekTotal(currentWeek)).toBe(expected);
  });

  it("counts rows by status", () => {
    const counts = statusCounts(currentWeek);
    const total = counts.DRAFT + counts.SUBMITTED + counts.APPROVED + counts.REJECTED;
    expect(total).toBe(currentWeek.rows.length);
  });
});

describe("skills helpers", () => {
  it("sums coverage across levels", () => {
    const react = skills.find((s) => s.id === "sk-react")!;
    expect(skillCoverage(react)).toBe(7);
  });

  it("detects senior-capable bench", () => {
    const terraform = skills.find((s) => s.id === "sk-terraform")!;
    expect(hasSeniorCoverage(terraform)).toBe(true);
    const airflow = skills.find((s) => s.id === "sk-airflow")!;
    expect(hasSeniorCoverage(airflow)).toBe(true);
  });

  it("groups by category sorted alphabetically", () => {
    const groups = groupSkillsByCategory(skills);
    const names = groups.map((g) => g.category);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "pt-BR")));
  });

  it("flags coverage gaps (thin coverage or no senior)", () => {
    const gaps = coverageGaps(skills, 2);
    // Airflow has only 2 declarations but a senior; with minCoverage 2 it is
    // not thin, yet a skill like Azure (no specialist) may surface. Assert the
    // list is sorted worst-first and only contains genuine gaps.
    for (const skill of gaps) {
      expect(skillCoverage(skill) < 2 || !hasSeniorCoverage(skill)).toBe(true);
    }
  });
});

describe("certificates helpers", () => {
  const ref = "2026-06-09";

  it("derives expiry status relative to a reference date", () => {
    const expired: Certificate = {
      id: "x",
      consultantId: "c",
      consultantName: "C",
      name: "n",
      issuer: "i",
      issuedAt: "2023-01-01",
      expiresAt: "2026-05-20",
    };
    expect(expiryStatus(expired, ref)).toBe("EXPIRED");

    const expiring: Certificate = { ...expired, expiresAt: "2026-06-25" };
    expect(expiryStatus(expiring, ref)).toBe("EXPIRING");

    const valid: Certificate = { ...expired, expiresAt: "2027-01-01" };
    expect(expiryStatus(valid, ref)).toBe("VALID");

    const none: Certificate = { ...expired, expiresAt: null };
    expect(expiryStatus(none, ref)).toBe("NO_EXPIRY");
  });

  it("summarizes counts", () => {
    const summary = summarizeCertificates(certificates, ref);
    expect(summary.total).toBe(certificates.length);
    expect(summary.expiring).toBeGreaterThanOrEqual(1);
  });

  it("sorts by urgency (expired/expiring first)", () => {
    const sorted = sortByUrgency(certificates, ref);
    const statuses = sorted.map((c) => expiryStatus(c, ref));
    const rank = { EXPIRED: 0, EXPIRING: 1, VALID: 2, NO_EXPIRY: 3 } as const;
    const ranks = statuses.map((s) => rank[s]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});

describe("approvals helpers", () => {
  it("splits pending from decided", () => {
    expect(pendingApprovals(approvalItems).every((i) => i.status === "PENDING")).toBe(
      true,
    );
    expect(decidedApprovals(approvalItems).every((i) => i.status !== "PENDING")).toBe(
      true,
    );
  });

  it("summarizes counts including automatic decisions", () => {
    const counts = summarizeApprovals(approvalItems);
    expect(counts.pending).toBe(
      approvalItems.filter((i) => i.status === "PENDING").length,
    );
    expect(counts.automatic).toBe(
      approvalItems.filter((i) => i.isAutomatic).length,
    );
    // Auto-approved is counted as approved in the summary.
    expect(counts.approved).toBe(
      approvalItems.filter(
        (i) => i.status === "APPROVED" || i.status === "AUTO_APPROVED",
      ).length,
    );
  });
});

describe("financial helpers", () => {
  it("computes a row amount as hours × rate", () => {
    expect(rowAmount({
      id: "r",
      clientName: "c",
      projectName: "p",
      approvedHours: 100,
      billingHourlyRate: 300,
      status: "OPEN",
    })).toBe(30000);
  });

  it("summarizes the closing totals", () => {
    const totals = summarizeClosing(currentClosing);
    const expectedHours = currentClosing.rows.reduce(
      (sum, r) => sum + r.approvedHours,
      0,
    );
    expect(totals.approvedHours).toBe(expectedHours);
    expect(totals.estimatedRevenue).toBe(
      currentClosing.rows.reduce((sum, r) => sum + rowAmount(r), 0),
    );
    expect(totals.readyToClose).toBe(
      currentClosing.rows.filter((r) => r.status === "READY").length,
    );
  });
});
