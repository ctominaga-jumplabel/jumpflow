import { describe, expect, it } from "vitest";
import {
  summarizeRevenueClosing,
  type RevenueClosingOverview,
} from "./types";

describe("summarizeRevenueClosing", () => {
  it("aggregates hours, revenue and operational status counts", () => {
    const closing: RevenueClosingOverview = {
      month: 6,
      year: 2026,
      rows: [
        {
          id: "open",
          projectId: "p-open",
          clientName: "Client A",
          projectName: "Atlas",
          opportunityType: null,
          approvedHours: 10,
          billingHourlyRate: 300,
          amount: 3000,
          status: "OPEN",
          fiscalDocument: null,
        },
        {
          id: "ready",
          projectId: "p-ready",
          clientName: "Client A",
          projectName: "Vega",
          opportunityType: null,
          approvedHours: 5,
          billingHourlyRate: 250,
          amount: 1250,
          status: "READY_TO_CLOSE",
          fiscalDocument: null,
        },
        {
          id: "invoiced",
          projectId: "p-invoiced",
          clientName: "Client B",
          projectName: "Lumen",
          opportunityType: null,
          approvedHours: 8,
          billingHourlyRate: 400,
          amount: 3200,
          status: "INVOICED",
          fiscalDocument: null,
        },
      ],
    };

    expect(summarizeRevenueClosing(closing)).toEqual({
      approvedHours: 23,
      estimatedRevenue: 7450,
      readyToClose: 1,
      closed: 1,
    });
  });
});
