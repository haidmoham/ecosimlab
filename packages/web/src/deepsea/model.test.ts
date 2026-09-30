import { describe, expect, it } from "vitest";
import { beginCreatureDrag, createDeepSeaModel, deriveTossVelocity, moveDraggedCreature, releaseCreature, stepDeepSeaModel } from "./model";

describe("deep sea ecology model", () => {
  it("uses a recent sweep for toss velocity and rejects stale or invalid samples", () => {
    const samples = [{ x: 20, y: 10, time: 100 }, { x: 80, y: 10, time: 150 }];
    expect(deriveTossVelocity(samples, 170).x).toBe(1200);
    expect(deriveTossVelocity(samples, 260)).toEqual({ x: 0, y: 0 });
    expect(deriveTossVelocity([samples[1], samples[0]], 170)).toEqual({ x: 0, y: 0 });
  });
  it("repeats the same initial scene for the same seed", () => {
    const first = createDeepSeaModel(412);
    const second = createDeepSeaModel(412);
    expect({ prey: first.prey, jellies: first.jellies, octopuses: first.octopuses, whale: first.whale })
      .toEqual({ prey: second.prey, jellies: second.jellies, octopuses: second.octopuses, whale: second.whale });
  });

  it("steers prey toward the nearest detritus patch", () => {
    const leftPatch = createDeepSeaModel(8);
    const rightPatch = createDeepSeaModel(8);
    for (const model of [leftPatch, rightPatch]) {
      model.angler.x = .98; model.angler.y = .98;
      model.whale.x = .98; model.whale.y = .1;
      model.prey = [{ x: .4, y: .1, vx: 0, vy: 0, drift: 0, phase: 0, size: 3, alive: true, kind: "fish", depth: .5 }];
      model.detritus = model.detritus.map(() => ({ x: model === leftPatch ? .1 : .8, y: .1 }));
    }
    stepDeepSeaModel(leftPatch, .04, 0, .5);
    stepDeepSeaModel(rightPatch, .04, 0, .5);
    expect(leftPatch.prey[0].x).toBeLessThan(.4);
    expect(rightPatch.prey[0].x).toBeGreaterThan(.4);
  });

  it("tosses a picked creature while Laboon remains anchored", () => {
    const model = createDeepSeaModel(17);
    const originalWhale = { x: model.whale.x, y: model.whale.y };
    model.jellies = [];
    model.octopuses = [];
    model.sharks = [];
    model.prey = [];
    model.squids = [];
    model.angler.x = .78;
    model.angler.y = .78;
    const viewport = { width: 390, height: 844 };
    expect(beginCreatureDrag(model, .78, .78, viewport, 0)?.kind).toBe("angler");
    moveDraggedCreature(model, .8, .15);
    releaseCreature(model, -240, -80, viewport);
    const releasedX = model.angler.x;
    stepDeepSeaModel(model, .04, .4, 0, viewport);
    expect(model.angler.x).toBeLessThan(releasedX);
    expect({ x: model.whale.x, y: model.whale.y }).toEqual(originalWhale);
    expect(beginCreatureDrag(model, originalWhale.x, originalWhale.y, viewport, 0)?.kind).not.toBe("whale");
  });

  it("keeps a fast fling moving and rebounds it from the edge", () => {
    const model = createDeepSeaModel(21);
    model.jellies = []; model.octopuses = []; model.sharks = []; model.prey = []; model.squids = [];
    model.angler.x = .8; model.angler.y = .15;
    const viewport = { width: 390, height: 844 };
    expect(beginCreatureDrag(model, .8, .15, viewport, 0)?.kind).toBe("angler");
    releaseCreature(model, 1200, 0, viewport);
    expect(model.angler.vx * viewport.width).toBeGreaterThan(1000);
    stepDeepSeaModel(model, .04, 0, 0, viewport);
    expect(model.angler.vx).toBeLessThan(0);
    expect(model.angler.flight).toBeGreaterThan(.9);
  });

  it.each([
    { x: .03, facing: -1 as const, inward: 1 },
    { x: .03, facing: 1 as const, inward: 1 },
    { x: .97, facing: -1 as const, inward: -1 },
    { x: .97, facing: 1 as const, inward: -1 },
  ])("turns a shark inward at x=$x facing=$facing without repeated flips", ({ x, facing, inward }) => {
    const model = createDeepSeaModel(42);
    model.jellies = []; model.octopuses = []; model.prey = []; model.squids = [];
    model.sharks = model.sharks.slice(0, 1);
    model.angler.x = .8; model.angler.y = .8;
    const shark = model.sharks[0];
    Object.assign(shark, { x, y: .1, facing, drift: .01 });
    for (let frame = 0; frame < 120; frame += 1) {
      stepDeepSeaModel(model, 1 / 60, .45, 0);
      expect(shark.facing).toBe(inward);
    }
    expect(shark.x).toBeGreaterThan(.04);
    expect(shark.x).toBeLessThan(.96);
  });

  it.each([
    { x: .02, inward: 1 },
    { x: .98, inward: -1 },
  ])("lets a shark held at x=$x swim away after release", ({ x, inward }) => {
    const model = createDeepSeaModel(42);
    model.jellies = []; model.octopuses = []; model.prey = []; model.squids = [];
    model.sharks = model.sharks.slice(0, 1);
    model.angler.x = .8; model.angler.y = .8;
    const shark = model.sharks[0];
    Object.assign(shark, { x: .2, y: .1, drift: .01 });
    const viewport = { width: 390, height: 844 };
    expect(beginCreatureDrag(model, .2, .1, viewport, 0)?.kind).toBe("shark");
    moveDraggedCreature(model, x, .1);
    for (let frame = 0; frame < 6; frame += 1) {
      stepDeepSeaModel(model, 1 / 60, .45, 0, viewport);
      expect(shark.x).toBe(x);
      expect(shark.facing).toBe(inward);
    }
    // A slow inward release is still outside the physical wall on the next frame.
    releaseCreature(model, 10 * inward, 0, viewport);
    for (let frame = 0; frame < 120; frame += 1) {
      stepDeepSeaModel(model, 1 / 60, .45, 0, viewport);
      expect(shark.facing).toBe(inward);
      expect(shark.vx * inward).toBeGreaterThan(0);
    }
    expect(shark.x).toBeGreaterThan(.04);
    expect(shark.x).toBeLessThan(.96);
  });

  it.each([
    { axis: "x" as const, velocity: "vx" as const, position: .03, inward: 1 },
    { axis: "x" as const, velocity: "vx" as const, position: .97, inward: -1 },
    { axis: "y" as const, velocity: "vy" as const, position: .03, inward: 1 },
    { axis: "y" as const, velocity: "vy" as const, position: .97, inward: -1 },
  ])("preserves inward $velocity when a collision pushes a body past $axis=$position", ({ axis, velocity, position, inward }) => {
    for (const flight of [0, 1]) {
      const model = createDeepSeaModel(42);
      model.jellies = []; model.sharks = []; model.prey = []; model.squids = [];
      model.octopuses = model.octopuses.slice(0, 2);
      model.angler.x = .8; model.angler.y = .8;
      model.octopuses.forEach((creature, index) => {
        Object.assign(creature, { x: .1, y: .1, drift: 0, size: .03, flight });
        creature[axis] = position + index * .015 * inward;
        creature[velocity] = .05 * inward;
      });
      stepDeepSeaModel(model, .016, 0, 0);
      const creature = model.octopuses[0];
      expect(creature[axis]).toBe(inward === 1 ? .025 : .975);
      expect(creature[velocity] * inward).toBeCloseTo(.05 * Math.exp(-(flight ? .08 : 2.5) * .016), 10);
    }
  });

  it.each([
    { axis: "x" as const, velocity: "vx" as const, position: .0251, outward: -1 },
    { axis: "x" as const, velocity: "vx" as const, position: .9749, outward: 1 },
    { axis: "y" as const, velocity: "vy" as const, position: .0251, outward: -1 },
    { axis: "y" as const, velocity: "vy" as const, position: .9749, outward: 1 },
  ])("still rebounds outward $velocity at $axis=$position", ({ axis, velocity, position, outward }) => {
    for (const flight of [0, 1]) {
      const model = createDeepSeaModel(42);
      model.jellies = []; model.sharks = []; model.prey = []; model.squids = [];
      model.octopuses = model.octopuses.slice(0, 1);
      model.angler.x = .8; model.angler.y = .8;
      const creature = model.octopuses[0];
      Object.assign(creature, { x: .1, y: .1, drift: 0, flight });
      creature[axis] = position;
      creature[velocity] = .5 * outward;
      stepDeepSeaModel(model, .016, 0, 0);
      expect(creature[axis]).toBe(outward === -1 ? .025 : .975);
      expect(creature[velocity] * -outward).toBeCloseTo(.5 * Math.exp(-(flight ? .08 : 2.5) * .016) * (flight ? .995 : .36), 10);
    }
  });

  it("registers a fast fling against a small body along its path", () => {
    const model = createDeepSeaModel(29);
    model.jellies = []; model.octopuses = model.octopuses.slice(0, 1); model.sharks = []; model.prey = []; model.squids = [];
    model.angler.x = .2; model.angler.y = .1;
    model.octopuses[0].x = .4; model.octopuses[0].y = .1;
    const viewport = { width: 390, height: 844 };
    expect(beginCreatureDrag(model, .2, .1, viewport, 0)?.kind).toBe("angler");
    releaseCreature(model, 2200, 0, viewport);
    stepDeepSeaModel(model, .04, 0, 0, viewport);
    expect(model.octopuses[0].vx).toBeGreaterThan(0);
  });

  it("does not jump a tossed creature to a species-specific band", () => {
    const model = createDeepSeaModel(32);
    model.jellies = []; model.octopuses = model.octopuses.slice(0, 1); model.sharks = []; model.prey = []; model.squids = model.squids.slice(0, 1);
    model.angler.x = .9; model.angler.y = .9;
    model.octopuses[0].x = .1; model.octopuses[0].y = .05;
    model.squids[0].x = .9; model.squids[0].y = .1;
    stepDeepSeaModel(model, .016, 0, 0, { width: 390, height: 844 });
    expect(model.octopuses[0].y).toBeLessThan(.07);
    expect(model.squids[0].y).toBeLessThan(.12);
  });

  it("separates overlapping bodies with a soft bump", () => {
    const model = createDeepSeaModel(7);
    model.jellies = [];
    model.sharks = [];
    model.prey = [];
    model.squids = [];
    model.angler.x = .9;
    model.angler.y = .9;
    model.octopuses = model.octopuses.slice(0, 2);
    model.octopuses[0].x = .2;
    model.octopuses[0].y = .2;
    model.octopuses[1].x = .2;
    model.octopuses[1].y = .2;
    stepDeepSeaModel(model, .04, 0, 0, { width: 390, height: 844 });
    const dx = (model.octopuses[0].x - model.octopuses[1].x) * 390;
    const dy = (model.octopuses[0].y - model.octopuses[1].y) * 844;
    const minimum = (model.octopuses[0].size + model.octopuses[1].size) * 390 * .85;
    expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(minimum);
  });

  it("keeps little bodies off Laboon's face without moving him", () => {
    const model = createDeepSeaModel(25);
    const whalePosition = { x: model.whale.x, y: model.whale.y };
    const octopus = model.octopuses[0];
    model.octopuses = [octopus];
    model.jellies = [];
    model.sharks = [];
    model.prey = [];
    model.squids = [];
    model.angler.x = .9;
    model.angler.y = .9;
    octopus.x = model.whale.x + .18;
    octopus.y = model.whale.y - .02;
    const viewport = { width: 390, height: 844 };
    stepDeepSeaModel(model, 0, 0, 0, viewport);
    const size = model.whale.size * 390;
    const bodyRadius = octopus.size * 390 * .85;
    const distance = Math.hypot(
      ((octopus.x - model.whale.x) * 390 - size * .2) / (size * 1.53 + bodyRadius),
      ((octopus.y - model.whale.y) * 844 + size * .16) / (size * .78 + bodyRadius),
    );
    expect(distance).toBeGreaterThan(.98);
    expect({ x: model.whale.x, y: model.whale.y }).toEqual(whalePosition);
  });
});
