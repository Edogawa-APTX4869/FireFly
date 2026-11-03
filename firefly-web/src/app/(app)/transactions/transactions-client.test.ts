import { describe, expect, it } from "vitest";
import { buildSearchQuery, filtersFromParams } from "./transactions-client";

describe("buildSearchQuery", () => {
  it("returns empty string when all filters are empty", () => {
    expect(
      buildSearchQuery({
        text: "",
        type: "",
        accountId: "",
        category: "",
        tag: "",
        budget: "",
        dateAfter: "",
        dateBefore: "",
        amountMore: "",
        amountLess: "",
      }),
    ).toBe("");
  });

  it("quotes multi-word category, tag, and budget names and combines all operators", () => {
    expect(
      buildSearchQuery({
        text: "coffee shop",
        type: "withdrawal",
        accountId: "12",
        category: "Dining Out",
        tag: "work-trip",
        budget: "Monthly Food",
        dateAfter: "2026-10-01",
        dateBefore: "2026-10-31",
        amountMore: "5",
        amountLess: "100",
      }),
    ).toBe(
      'type:withdrawal account_id:12 category_is:"Dining Out" tag_is:work-trip budget_is:"Monthly Food" date_after:2026-10-01 date_before:2026-10-31 amount_more:5 amount_less:100 coffee shop',
    );
  });

  it("hydrates filters from URL search params for dashboard drilldowns", () => {
    const params = new URLSearchParams("type=withdrawal&category=Food+%3A+Groceries&accountId=7&query=Carrefour");
    const f = filtersFromParams((k) => params.get(k));
    expect(f.type).toBe("withdrawal");
    expect(f.category).toBe("Food : Groceries");
    expect(f.accountId).toBe("7");
    expect(f.text).toBe("Carrefour");
    expect(buildSearchQuery(f)).toBe('type:withdrawal account_id:7 category_is:"Food : Groceries" Carrefour');
  });
});
