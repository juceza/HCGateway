import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("joins truthy class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("drops falsy values and resolves conditionals", () => {
    expect(cn("a", false && "b", undefined, "c")).toBe("a c");
  });

  it("merges conflicting tailwind utilities, last wins", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
