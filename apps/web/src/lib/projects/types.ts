export type ProjectStatus = "PROPOSAL" | "ACTIVE" | "PAUSED" | "CLOSED";
export type AllocationStatus = "ACTIVE" | "PLANNED" | "ENDED" | "CANCELLED";
export type SkillLevel = "BASIC" | "INTERMEDIATE" | "ADVANCED" | "SPECIALIST";

export interface ProjectSkillOption {
  id: string;
  name: string;
  category?: string;
}

export interface ProjectAllocationSkillItem {
  id: string;
  allocationId: string;
  skillId: string;
  skillName: string;
  skillCategory?: string;
  level?: SkillLevel;
  note?: string;
}

export interface ProjectClientOption {
  id: string;
  name: string;
}

export interface ProjectConsultantOption {
  id: string;
  name: string;
}

export interface ProjectManagerOption {
  id: string;
  name: string;
}

export interface ProjectAllocationItem {
  id: string;
  projectId: string;
  consultantId: string;
  consultantName: string;
  role: string;
  allocationPercent: number;
  startDate: string;
  endDate?: string;
  status: AllocationStatus;
  skills: ProjectAllocationSkillItem[];
}

export interface ProjectSaleRateItem {
  id: string;
  projectId: string;
  consultantId?: string;
  consultantName?: string;
  allocationId?: string;
  allocationLabel?: string;
  startsAt: string;
  endsAt?: string;
  hourlyRate?: number;
  currency: string;
  note?: string;
}

export interface ProjectItem {
  id: string;
  clientId: string;
  clientName: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  managerUserId?: string;
  managerName?: string;
  startDate: string;
  endDate?: string;
  billingHourlyRate?: number;
  budgetHours?: number;
  costCenter?: string;
  consumedHours: number;
  allocatedConsultants: number;
  allocations: ProjectAllocationItem[];
  saleRates: ProjectSaleRateItem[];
}

