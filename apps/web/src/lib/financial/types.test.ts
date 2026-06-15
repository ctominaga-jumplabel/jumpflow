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
          clientName: "Client A",
          projectName: "Atlas",
          approvedHours: 10,
          billingHourlyRate: 300,
          amount: 3000,
          status: "OPEN",
          fiscalDocument: null,
        },
        {
          id: "ready",
          clientName: "Client A",
          projectName: "Vega",
          approvedHours: 5,
          billingHourlyRate: 250,
          amount: 1250,
          status: "READY_TO_CLOSE",
          fiscalDocument: null,
        },
        {
          id: "invoiced",
          clientName: "Client B",
          projectName: "Lumen",
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
