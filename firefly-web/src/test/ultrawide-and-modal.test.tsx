import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ResourceIconBadge } from "@/components/resource-icon";
import { TwoColumnAccountGrid } from "@/app/(app)/dashboard-client";

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

describe("ResourceIconBadge modal and trigger", () => {
  it("renders trigger button with correct accessibility and styling", () => {
    const qc = createTestQueryClient();
    const html = renderToStaticMarkup(
      <QueryClientProvider client={qc}>
        <ResourceIconBadge entityType="account" entityId="acc-1" defaultIcon="Wallet" defaultColor="#6366f1" />
      </QueryClientProvider>,
    );

    expect(html).toContain('type="button"');
    expect(html).toContain('title="Click to customize icon &amp; color (saved to database)"');
    expect(html).toContain("svg");
  });

  it("applies custom size and color correctly", () => {
    const qc = createTestQueryClient();
    const html = renderToStaticMarkup(
      <QueryClientProvider client={qc}>
        <ResourceIconBadge entityType="account" entityId="acc-2" size="lg" defaultColor="#10b981" />
      </QueryClientProvider>,
    );

    expect(html).toContain("size-11");
    expect(html).toContain("#10b981");
  });
});

describe("Ultra-Wide & Multi-Screen Responsive Grid Architecture", () => {
  it("renders TwoColumnAccountGrid with 5-col on 2xl and 6-col on 3xl", () => {
    const qc = createTestQueryClient();
    const mockAccounts = [
      { id: "1", name: "Bank 1", balance: "100.00", currencyCode: "BHD", currencySymbol: "BHD" },
      { id: "2", name: "Bank 2", balance: "200.00", currencyCode: "BHD", currencySymbol: "BHD" },
    ];

    const html = renderToStaticMarkup(
      <QueryClientProvider client={qc}>
        <TwoColumnAccountGrid accounts={mockAccounts} />
      </QueryClientProvider>,
    );

    expect(html).toContain("grid-cols-2");
    expect(html).toContain("sm:grid-cols-3");
    expect(html).toContain("lg:grid-cols-4");
    expect(html).toContain("2xl:grid-cols-5");
    expect(html).toContain("3xl:grid-cols-6");
    expect(html).toContain("Bank 1");
    expect(html).toContain("Bank 2");
  });
});
