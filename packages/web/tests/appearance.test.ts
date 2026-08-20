import { describe, expect, it } from "vitest";
import { organismAppearance } from "../src/appearance";

const genome = { speed: 1, size: .7, vision: 1, turnRate: .2, metabolism: .2, reproduceAt: 70, hue: 120, pattern: .4 };

describe("genotype appearance", () => {
  it("is deterministic for the same genome and species", () => {
    expect(organismAppearance(genome, "herbivore")).toEqual(organismAppearance(genome, "herbivore"));
  });

  it("keeps nearby genotypes visually related while changing pattern", () => {
    const sibling = organismAppearance({ ...genome, hue: 124, pattern: .401 }, "herbivore");
    const parent = organismAppearance(genome, "herbivore");
    expect(sibling.fill).toContain("124");
    expect(Math.abs(sibling.size - parent.size)).toBeLessThan(1);
    expect(sibling.edge).not.toBe("");
  });

  it("gives predators a distinct silhouette palette", () => {
    const predator = organismAppearance(genome, "predator");
    const grazer = organismAppearance(genome, "herbivore");
    expect(predator.eye).not.toBe(grazer.eye);
    expect(predator.fill).not.toBe(grazer.fill);
  });
});
