export type Vec = { x: number; y: number };

export type Prey = Vec & { drift: number; phase: number; size: number; alive: boolean; kind: "fish" | "copepod"; depth: number };
export type Jelly = Vec & { phase: number; drift: number; size: number; hue: number; pulse: number };
export type Angler = Vec & { phase: number; facing: -1 | 1; resting: number; hunger: number };
export type Octopus = Vec & { phase: number; drift: number; size: number; tint: number; depth: number };
export type Squid = Vec & { phase: number; drift: number; size: number; tint: number };
export type Whale = Vec & { phase: number; drift: number; size: number };
export type Shark = Vec & { phase: number; drift: number; size: number; facing: -1 | 1 };
export type DeepSeaModel = { rng: () => number; prey: Prey[]; jellies: Jelly[]; octopuses: Octopus[]; squids: Squid[]; sharks: Shark[]; whale: Whale; angler: Angler; detritus: Vec[]; time: number };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** A compact deterministic ecology vignette. Positions and velocities are normalized to the canvas. */
export function createDeepSeaModel(seed: number): DeepSeaModel {
  let state = (seed >>> 0) || 0x6d2b79f5;
  const rng = () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
  // Keep a seeded pool so the density control can reveal more or fewer original particles live.
  const count = 68;
  const angler: Angler = { x: .79, y: .82, phase: rng() * 6, facing: -1, resting: 0, hunger: .72 };
  const detritus = Array.from({ length: 5 }, (_, index) => ({ x: .16 + rng() * .67, y: .27 + rng() * .56 + index * .012 }));
  const prey = Array.from({ length: count }, (_, index) => {
    const patch = detritus[index % detritus.length];
    const kind: Prey["kind"] = rng() < .28 ? "copepod" : "fish";
    return { x: clamp(patch.x + (rng() - .5) * .26, .06, .94), y: clamp(patch.y + (rng() - .5) * .2, .1, .9), drift: .012 + rng() * .022, phase: rng() * 20, size: 3 + rng() * .8, alive: true, kind, depth: rng() };
  });
  const jellyHomes = [{ x: .19, y: .2 }, { x: .81, y: .25 }, { x: .16, y: .61 }, { x: .82, y: .65 }, { x: .5, y: .17 }, { x: .36, y: .3 }, { x: .68, y: .74 }, { x: .92, y: .43 }];
  const jellies = Array.from({ length: 8 }, (_, index) => ({ x: jellyHomes[index].x + (rng() - .5) * .08, y: jellyHomes[index].y + (rng() - .5) * .045, phase: rng() * 6, drift: .006 + rng() * .01, size: index === 0 ? .077 + rng() * .006 : index < 5 ? .053 + rng() * .009 : .038 + rng() * .006, hue: [178, 315, 48, 198, 285, 178, 315, 198][index], pulse: .7 + rng() * .3 }));
  const octopusHomes = [{ x: .18, y: .28 }, { x: .8, y: .3 }, { x: .86, y: .57 }, { x: .18, y: .82 }, { x: .52, y: .84 }];
  const octopuses = Array.from({ length: 32 }, (_, index) => {
    const home = octopusHomes[index % octopusHomes.length];
    return { x: clamp(home.x + (rng() - .5) * .31, .055, .945), y: clamp(home.y + (rng() - .5) * .2, .13, .9), phase: rng() * 6, drift: .006 + rng() * .012, size: .021 + rng() * .013, tint: [180, 306, 48, 200][index % 4], depth: rng() };
  });
  const squids = [{ x: .83, y: .52, phase: rng() * 6, drift: .002, size: .35 + rng() * .035, tint: 196 }];
  const whale: Whale = { x: .48, y: .45, phase: rng() * 6, drift: .0025 + rng() * .002, size: .156 + rng() * .012 };
  const sharkHomes = [{ x: .17, y: .32 }, { x: .78, y: .38 }, { x: .75, y: .76 }, { x: .18, y: .84 }, { x: .86, y: .55 }, { x: .55, y: .83 }];
  const sharks = sharkHomes.map((home) => ({
    x: home.x + (rng() - .5) * .1, y: home.y + (rng() - .5) * .06,
    phase: rng() * 6, drift: .008 + rng() * .008, size: .026 + rng() * .01, facing: (rng() > .5 ? 1 : -1) as -1 | 1,
  }));
  return { rng, prey, jellies, octopuses, squids, sharks, whale, angler, detritus, time: 0 };
}

export function stepDeepSeaModel(model: DeepSeaModel, dt: number, currentStrength: number, encounterDensity: number) {
  const step = clamp(dt, 0, .04);
  const current = clamp(currentStrength, 0, 1);
  const wanted = Math.round(18 + clamp(encounterDensity, 0, 1) * 50);
  const a = model.angler;
  model.time += step;
  a.phase += step;
  a.resting = Math.max(0, a.resting - step);
  a.hunger = clamp(a.hunger + step * .008, 0, 1);
  // All particles share a slow diagonal current; local eddies perturb it without losing the flow.
  for (const mote of model.detritus) {
    mote.x += (current * .010) * step;
    mote.y += (current * .004 + Math.sin(model.time * .3 + mote.x * 8) * .002) * step;
    if (mote.x > 1.04) { mote.x = -.04; mote.y = .15 + model.rng() * .7; }
  }
  for (const jelly of model.jellies) {
    jelly.phase += step * (1.1 + jelly.pulse);
    jelly.x += Math.sin(jelly.phase * .29) * jelly.drift * step + current * .004 * step;
    jelly.y += (Math.sin(jelly.phase) * .006 - .001) * step;
    if (jelly.x > 1.08) jelly.x = -.08;
    jelly.y = clamp(jelly.y, .08, .9);
  }
  for (const creature of model.octopuses) {
    creature.phase += step * 1.3;
    creature.x += (Math.sin(creature.phase * .31) * creature.drift + current * .003) * step;
    creature.y += Math.cos(creature.phase * .54) * creature.drift * .6 * step;
    if (creature.x > 1.06) creature.x = -.06;
    creature.y = clamp(creature.y, .12, .9);
  }
  for (const squid of model.squids) {
    squid.phase += step * .7;
    squid.x += (Math.sin(squid.phase * .23) * squid.drift + current * .002) * step;
    squid.y += Math.cos(squid.phase * .31) * squid.drift * .45 * step;
    squid.y = clamp(squid.y, .24, .75);
  }
  model.whale.phase += step * .56;
  model.whale.x += Math.sin(model.whale.phase * .17) * model.whale.drift * step;
  model.whale.y += Math.sin(model.whale.phase * .29) * model.whale.drift * .32 * step;
  model.whale.y = clamp(model.whale.y, .44, .69);
  for (const shark of model.sharks) {
    shark.phase += step * 1.1;
    shark.x += shark.facing * shark.drift * step + current * .002 * step;
    shark.y += Math.sin(shark.phase * .35) * shark.drift * .5 * step;
    if (shark.x < .04 || shark.x > .96) shark.facing = shark.facing === 1 ? -1 : 1;
    shark.x = clamp(shark.x, .04, .96);
  }
  for (const particle of model.prey.slice(0, wanted)) {
    if (!particle.alive) continue;
    particle.phase += step;
    // Keep the causal target at the luminous tip rather than the fish's body center.
    const lureX = a.x + a.facing * .004;
    const lureY = a.y - .064;
    const dx = lureX - particle.x;
    const dy = lureY - particle.y;
    const distance = Math.hypot(dx, dy);
    let nearestDetritus = model.detritus[0];
    let detritusDistance = Number.POSITIVE_INFINITY;
    for (const patch of model.detritus) {
      const patchDistance = Math.hypot(patch.x - particle.x, patch.y - particle.y);
      if (patchDistance < detritusDistance) { nearestDetritus = patch; detritusDistance = patchDistance; }
    }
    // Gentle foraging drift gathers prey at settling organic matter; the lure remains stronger nearby.
    const foraging = detritusDistance > .025 ? .006 : .001;
    const forageX = (nearestDetritus.x - particle.x) * foraging;
    const forageY = (nearestDetritus.y - particle.y) * foraging;
    // Small swimmers part gently around the whale's body as they follow the same current.
    const whaleDx = particle.x - model.whale.x;
    const whaleDy = particle.y - model.whale.y;
    const whaleDistance = Math.hypot(whaleDx, whaleDy);
    const wakeRadius = .19;
    const deflection = whaleDistance < wakeRadius && whaleDistance > 0 ? (1 - whaleDistance / wakeRadius) * .012 : 0;
    // Only prey inside the lure's local field orient toward it. Farther prey remain in their detritus patch.
    const lureRadius = .25 + a.hunger * .10;
    const attraction = distance < lureRadius ? (1 - distance / lureRadius) * (.018 + a.hunger * .014) : 0;
    particle.x += (current * .006 + Math.sin(particle.phase * .8) * particle.drift + (distance ? dx / distance * attraction : 0) + (whaleDistance ? whaleDx / whaleDistance * deflection : 0) + forageX) * step;
    particle.y += (current * .002 + Math.cos(particle.phase * .63) * particle.drift * .65 + (distance ? dy / distance * attraction : 0) + (whaleDistance ? whaleDy / whaleDistance * deflection : 0) + forageY) * step;
    if (particle.x > 1.04) { particle.x = -.03; particle.y = .15 + model.rng() * .7; }
    if (particle.x < -.04) particle.x = 1.02;
    if (distance < .047 && a.resting <= 0) {
      particle.alive = false;
      a.resting = 3.2;
      a.hunger = Math.max(0, a.hunger - .48);
    }
  }
  const activePrey = model.prey.slice(0, wanted);
  if (activePrey.filter((particle) => particle.alive).length < wanted && model.rng() < step * .22) {
    const restingParticle = activePrey.find((particle) => !particle.alive);
    if (restingParticle) {
      const patch = model.detritus[Math.floor(model.rng() * model.detritus.length)];
      restingParticle.x = clamp(patch.x + (model.rng() - .5) * .24, .04, .96);
      restingParticle.y = clamp(patch.y + (model.rng() - .5) * .18, .1, .92);
      restingParticle.phase = model.rng() * 20;
      restingParticle.drift = .012 + model.rng() * .022;
      restingParticle.alive = true;
    }
  }
  if (Math.abs(a.x - .53) > .14) a.facing = a.x > .53 ? -1 : 1;
  a.x += (Math.sin(a.phase * .11) * .003) * step;
  a.y += (Math.sin(a.phase * .19) * .002) * step;
}
