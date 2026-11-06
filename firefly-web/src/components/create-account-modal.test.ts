import { describe, expect, it } from "vitest";
import { normalizeType } from "./create-account-modal";

describe("CreateAccountModal normalizeType", () => {
  it("defaults to asset when undefined or empty", () => {
    expect(normalizeType(undefined)).toBe("asset");
    expect(normalizeType("")).toBe("asset");
  });

  it("normalizes liabilities tab values to liability", () => {
    expect(normalizeType("liabilities")).toBe("liability");
    expect(normalizeType("liability")).toBe("liability");
    expect(normalizeType("loan")).toBe("liability");
    expect(normalizeType("debt")).toBe("liability");
    expect(normalizeType("mortgage")).toBe("liability");
  });

  it("normalizes expense variations to expense", () => {
    expect(normalizeType("expense")).toBe("expense");
    expect(normalizeType("expenses")).toBe("expense");
  });

  it("normalizes revenue variations to revenue", () => {
    expect(normalizeType("revenue")).toBe("revenue");
    expect(normalizeType("revenues")).toBe("revenue");
    expect(normalizeType("income")).toBe("revenue");
  });

  it("normalizes asset and cash to asset", () => {
    expect(normalizeType("asset")).toBe("asset");
    expect(normalizeType("cash")).toBe("asset");
  });

  it("handles mixed case and unknown types gracefully", () => {
    expect(normalizeType("LIABILITY")).toBe("liability");
    expect(normalizeType("Expenses")).toBe("expense");
    expect(normalizeType("REVENUE")).toBe("revenue");
    expect(normalizeType("unknownType123")).toBe("asset");
  });
});
