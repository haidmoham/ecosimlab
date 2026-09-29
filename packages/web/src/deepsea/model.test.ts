import { describe, expect, it } from "vitest";
import { createDeepSeaModel, stepDeepSeaModel } from "./model";

describe("deep sea ecology model", () => {
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
      model.prey = [{ x: .4, y: .1, drift: 0, phase: 0, size: 3, alive: true, kind: "fish", depth: .5 }];
      model.detritus = model.detritus.map(() => ({ x: model === leftPatch ? .1 : .8, y: .1 }));
    }
    stepDeepSeaModel(leftPatch, .04, 0, .5);
    stepDeepSeaModel(rightPatch, .04, 0, .5);
    expect(leftPatch.prey[0].x).toBeLessThan(.4);
    expect(rightPatch.prey[0].x).toBeGreaterThan(.4);
  });
});
