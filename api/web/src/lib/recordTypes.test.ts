import { describe, expect, it } from "vitest";
import {
  CHARTED_TYPES,
  RECORD_CATEGORIES,
  RECORD_TYPES,
  RECORD_TYPE_BY_NAME,
  displayToCollection,
  getRecordType,
  recordTypesByCategory,
} from "./recordTypes";

// The 8 high-value types that must be charted.
const EXPECTED_CHARTED = [
  "Steps",
  "HeartRate",
  "RestingHeartRate",
  "Weight",
  "SleepSession",
  "ActiveCaloriesBurned",
  "BodyFat",
  "TotalCaloriesBurned",
].sort();

describe("displayToCollection", () => {
  it("lowercases the first character of a single-word type", () => {
    expect(displayToCollection("Steps")).toBe("steps");
  });

  it("lowercases only the first char of a multi-word type", () => {
    expect(displayToCollection("HeartRate")).toBe("heartRate");
  });

  it("handles three-word types", () => {
    expect(displayToCollection("RestingHeartRate")).toBe("restingHeartRate");
  });

  it("returns an empty string unchanged", () => {
    expect(displayToCollection("")).toBe("");
  });
});

describe("RECORD_TYPES registry", () => {
  it("contains exactly 41 entries", () => {
    expect(RECORD_TYPES).toHaveLength(41);
  });

  it("has unique display names", () => {
    const names = RECORD_TYPES.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("marks exactly the 8 types as charted", () => {
    const charted = RECORD_TYPES.filter((m) => m.charted).map((m) => m.name);
    expect(charted).toHaveLength(8);
    expect([...charted].sort()).toEqual(EXPECTED_CHARTED);
  });

  it("assigns every entry a category from the allowed set", () => {
    for (const meta of RECORD_TYPES) {
      expect(RECORD_CATEGORIES).toContain(meta.category);
    }
  });

  it("gives every entry a non-empty label", () => {
    for (const meta of RECORD_TYPES) {
      expect(meta.label.length).toBeGreaterThan(0);
    }
  });

  it("provides a unit for all charted types", () => {
    for (const meta of CHARTED_TYPES) {
      expect(meta.unit).toBeTruthy();
    }
  });
});

describe("typed lookups", () => {
  it("resolves metadata by canonical name", () => {
    expect(getRecordType("HeartRate")?.label).toBe("Heart rate");
  });

  it("returns undefined for an unknown name", () => {
    expect(getRecordType("NotAType")).toBeUndefined();
  });

  it("RECORD_TYPE_BY_NAME indexes every entry", () => {
    expect(RECORD_TYPE_BY_NAME.size).toBe(RECORD_TYPES.length);
  });

  it("groups types by category, covering all 41 with no leakage", () => {
    const total = RECORD_CATEGORIES.reduce(
      (sum, c) => sum + recordTypesByCategory(c).length,
      0,
    );
    expect(total).toBe(RECORD_TYPES.length);
    for (const c of RECORD_CATEGORIES) {
      for (const meta of recordTypesByCategory(c)) {
        expect(meta.category).toBe(c);
      }
    }
  });

  it("CHARTED_TYPES matches the charted entries in the registry", () => {
    expect(CHARTED_TYPES.map((m) => m.name).sort()).toEqual(EXPECTED_CHARTED);
  });
});

describe("registry consistency (integration)", () => {
  it("every name round-trips to a non-empty collection method", () => {
    for (const meta of RECORD_TYPES) {
      const method = displayToCollection(meta.name);
      expect(method.length).toBeGreaterThan(0);
      // lower-first only: rest of the name is preserved verbatim.
      expect(method.slice(1)).toBe(meta.name.slice(1));
      expect(method[0]).toBe(meta.name[0].toLowerCase());
    }
  });
});
