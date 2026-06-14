import { prisma } from "@jumpflow/database";
import type {
  Consultant,
  ConsultantSkillTag,
  Seniority,
} from "@/lib/mock-data/consultants";
import { isDatabaseConfigured } from "./config";

function mapSeniority(value: string): Seniority {
  switch (value) {
    case "MID_LEVEL":
      return "PLENO";
    case "SENIOR":
      return "SENIOR";
    case "SPECIALIST":
    case "PRINCIPAL":
      return "ESPECIALISTA";
    case "INTERN":
    case "JUNIOR":
    default:
      return "JUNIOR";
  }
}

export async function listConsultantDirectory(): Promise<Consultant[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await prisma.consultant.findMany({
    include: {
      allocations: { select: { allocationPercent: true, status: true } },
      skills: {
        include: { skill: { select: { id: true, name: true } } },
        orderBy: [{ validationStatus: "asc" }, { updatedAt: "desc" }],
        take: 4,
      },
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
  return rows.map((row) => {
    const topSkills: ConsultantSkillTag[] = row.skills.map((item) => ({
      skillId: item.skill.id,
      name: item.skill.name,
    }));
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      jobTitle: row.jobTitle ?? "-",
      seniority: mapSeniority(row.seniority),
      area: row.area ?? "-",
      status: row.status === "ACTIVE" ? "ACTIVE" : "INACTIVE",
      allocationPercent: row.allocations
        .filter((allocation) => allocation.status === "ACTIVE")
        .reduce((sum, allocation) => sum + allocation.allocationPercent, 0),
      topSkills,
    };
  });
}

