import { describe, expect, it } from "vitest";
import { Ecosystem, defaultWorldConfig, phenotypeFromGenome, toroidalDistance } from "../src/index.js";

const tiny = { ...defaultWorldConfig, width: 100, height: 100, initialHerbivores: 0, initialPredators: 0, initialPlants: 0, maxHerbivores: 10, maxPredators: 10, maxPlants: 20, seed: 44 };

describe("ecosystem engine", () => {
  it("uses toroidal distances across the world seam", () => {
    expect(toroidalDistance({ x: 1, y: 50 }, { x: 99, y: 50 }, tiny)).toBe(2);
  });

  it("is repeatable with the same seed and number of steps", () => {
    const first = new Ecosystem(tiny); const second = new Ecosystem(tiny);
    first.spawnOrganism("herbivore", { x: 20, y: 20 }); second.spawnOrganism("herbivore", { x: 20, y: 20 });
    first.addPlant({ x: 30, y: 20 }); second.addPlant({ x: 30, y: 20 });
    first.step(300); second.step(300);
    expect(first.snapshot()).toEqual(second.snapshot());
  });

  it("round trips the world and PRNG state exactly", () => {
    const world = new Ecosystem(tiny); world.spawnOrganism("herbivore", { x: 20, y: 20 }); world.step(20);
    const restored = Ecosystem.fromSnapshot(world.snapshot());
    world.step(50); restored.step(50);
    expect(restored.snapshot()).toEqual(world.snapshot());
  });

  it("caps population and returns no entity beyond the cap", () => {
    const world = new Ecosystem({ ...tiny, maxHerbivores: 1 });
    expect(world.spawnOrganism("herbivore", { x: 1, y: 1 })).toBeTruthy();
    expect(world.spawnOrganism("herbivore", { x: 2, y: 2 })).toBeNull();
  });

  it("derives a stable phenotype from a genome", () => {
    const genome = { speed: 0.5, size: 0.7, vision: 0.3, turnRate: 0.2, metabolism: 0.4, reproduceAt: 0.5, hue: 120, pattern: 0.2 };
    expect(phenotypeFromGenome(genome)).toEqual(phenotypeFromGenome({ ...genome }));
    expect(phenotypeFromGenome(genome).pattern).toBe("stripe");
  });

  it("maintains finite, nonnegative state over a long run", () => {
    const world = new Ecosystem({ ...tiny, initialHerbivores: 5, initialPredators: 2, initialPlants: 15 });
    world.step(5000);
    const state = world.view();
    for (const organism of state.organisms) {
      expect(Number.isFinite(organism.x + organism.y + organism.energy)).toBe(true);
      expect(organism.energy).toBeGreaterThanOrEqual(0);
    }
    expect(state.stats.herbivores).toBeLessThanOrEqual(tiny.maxHerbivores);
    expect(state.stats.predators).toBeLessThanOrEqual(tiny.maxPredators);
  });
});
