export type Vec = { x: number; y: number };
type Moving = Vec & { vx: number; vy: number; flight?: number };
export type CreatureHandle = { kind: "whale" | "angler" | "jelly" | "octopus" | "squid" | "shark" | "prey"; index: number };

export type Prey = Moving & { drift: number; phase: number; size: number; alive: boolean; kind: "fish" | "copepod"; depth: number };
export type Jelly = Moving & { phase: number; drift: number; size: number; hue: number; pulse: number };
export type Angler = Moving & { phase: number; facing: -1 | 1; resting: number; hunger: number };
export type Octopus = Moving & { phase: number; drift: number; size: number; tint: number; depth: number };
export type Squid = Moving & { phase: number; drift: number; size: number; tint: number };
export type Whale = Moving & { phase: number; drift: number; size: number };
export type Shark = Moving & { phase: number; drift: number; size: number; facing: -1 | 1 };
export type DeepSeaModel = { rng: () => number; prey: Prey[]; jellies: Jelly[]; octopuses: Octopus[]; squids: Squid[]; sharks: Shark[]; whale: Whale; angler: Angler; detritus: Vec[]; time: number; dragged: CreatureHandle | null; layoutKey: string };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export type Viewport = { width: number; height: number };
type CreatureBody = { handle: CreatureHandle; creature: Moving; radius: number; mass: number };
export type PointerSample = { x: number; y: number; time: number };

/** Estimate the last deliberate sweep, rejecting stale or invalid samples. Units are px/s. */
export function deriveTossVelocity(samples: PointerSample[], releasedAt: number): Vec {
  if (samples.length < 2) return { x: 0, y: 0 };
  const latest = samples[samples.length - 1];
  const previous = samples.find((sample) => latest.time - sample.time >= 20) ?? samples[samples.length - 2];
  const elapsed = latest.time - previous.time;
  if (![latest.x, latest.y, latest.time, previous.x, previous.y, previous.time, releasedAt].every(Number.isFinite) ||
      elapsed <= 0 || elapsed > 100 || releasedAt - latest.time > 95 || releasedAt < latest.time) return { x: 0, y: 0 };
  const vx = (latest.x - previous.x) * 1000 / elapsed;
  const vy = (latest.y - previous.y) * 1000 / elapsed;
  const speed = Math.hypot(vx, vy);
  const scale = speed > 5000 ? 5000 / speed : 1;
  return { x: vx * scale, y: vy * scale };
}

// A permuted cell order gives every region residents without visible rows.
function coveragePoint(index: number, columns: number, rows: number, stride: number, rng: () => number): Vec {
  const cell = (index * stride + 13) % (columns * rows);
  const column = cell % columns;
  const row = Math.floor(cell / columns);
  return { x: (column + .18 + rng() * .64) / columns, y: (row + .18 + rng() * .64) / rows };
}

function sameHandle(first: CreatureHandle | null, second: CreatureHandle) {
  return first?.kind === second.kind && first.index === second.index;
}

function creatureBodies(model: DeepSeaModel, viewport: Viewport, density: number): CreatureBody[] {
  const unit = Math.min(viewport.width, viewport.height);
  const bodies: CreatureBody[] = [
    { handle: { kind: "whale", index: 0 }, creature: model.whale, radius: model.whale.size * unit * 1.22, mass: Number.POSITIVE_INFINITY },
    { handle: { kind: "angler", index: 0 }, creature: model.angler, radius: unit * .12, mass: 3 },
  ];
  model.jellies.slice(0, 5 + Math.round(clamp(density, 0, 2) * 8)).forEach((creature, index) => bodies.push({ handle: { kind: "jelly", index }, creature, radius: creature.size * unit * 1.32, mass: 1.7 }));
  model.octopuses.slice(0, 18 + Math.round(clamp(density, 0, 2) * 26)).forEach((creature, index) => bodies.push({ handle: { kind: "octopus", index }, creature, radius: creature.size * unit * 1.35, mass: 1.2 }));
  model.sharks.slice(0, 3 + Math.round(clamp(density, 0, 2) * 4)).forEach((creature, index) => bodies.push({ handle: { kind: "shark", index }, creature, radius: creature.size * unit * 1.14, mass: 1.6 }));
  model.prey.slice(0, Math.round(18 + clamp(density, 0, 2) * 70)).forEach((creature, index) => {
    if (creature.alive) bodies.push({ handle: { kind: "prey", index }, creature, radius: creature.size * unit / 390 * 1.5, mass: .45 });
  });
  // The distant squid lives on another drawing plane. Its arms can cross foreground bodies.
  return bodies;
}

function resolveHandle(model: DeepSeaModel, handle: CreatureHandle): Moving | null {
  switch (handle.kind) {
    case "whale": return model.whale;
    case "angler": return model.angler;
    case "jelly": return model.jellies[handle.index] ?? null;
    case "octopus": return model.octopuses[handle.index] ?? null;
    case "squid": return model.squids[handle.index] ?? null;
    case "shark": return model.sharks[handle.index] ?? null;
    case "prey": return model.prey[handle.index]?.alive ? model.prey[handle.index] : null;
  }
}

/** Pick the creature under a pointer in normalized canvas coordinates. */
export function beginCreatureDrag(model: DeepSeaModel, x: number, y: number, viewport: Viewport, density: number): CreatureHandle | null {
  const bodies = creatureBodies(model, viewport, density);
  model.squids.forEach((creature, index) => bodies.push({ handle: { kind: "squid", index }, creature, radius: creature.size * Math.min(viewport.width, viewport.height) * .34, mass: 5 }));
  let best: { handle: CreatureHandle; score: number } | null = null;
  for (const body of bodies) {
    if (body.handle.kind === "whale") continue;
    const dx = (x - body.creature.x) * viewport.width;
    const dy = (y - body.creature.y) * viewport.height;
    const touchRadius = Math.max(body.radius, body.handle.kind === "prey" ? 9 : 14);
    const distance = Math.hypot(dx, dy);
    if (distance > touchRadius) continue;
    const score = distance / touchRadius;
    if (!best || score < best.score) best = { handle: body.handle, score };
  }
  model.dragged = best?.handle ?? null;
  if (model.dragged) {
    const creature = resolveHandle(model, model.dragged);
    if (creature) { creature.vx = 0; creature.vy = 0; creature.flight = 0; }
  }
  return model.dragged;
}

export function moveDraggedCreature(model: DeepSeaModel, x: number, y: number) {
  if (!model.dragged) return;
  const creature = resolveHandle(model, model.dragged);
  if (!creature) return;
  creature.x = clamp(x, .02, .98);
  creature.y = clamp(y, .03, .97);
}

export function releaseCreature(model: DeepSeaModel, velocityX: number, velocityY: number, viewport: Viewport) {
  if (!model.dragged) return;
  const creature = resolveHandle(model, model.dragged);
  if (creature) {
    if (!Number.isFinite(velocityX) || !Number.isFinite(velocityY)) { velocityX = 0; velocityY = 0; }
    const speed = Math.hypot(velocityX, velocityY);
    const limit = 2200;
    const scale = speed > limit ? limit / speed : 1;
    creature.vx = velocityX * scale * 1.6 / viewport.width;
    creature.vy = velocityY * scale * 1.6 / viewport.height;
    creature.flight = speed > 80 ? 1 : 0;
  }
  model.dragged = null;
}

/** A blank-water swipe sends a small impulse through nearby animals. */
export function stirWater(model: DeepSeaModel, x: number, y: number, deltaX: number, deltaY: number, viewport: Viewport, density: number) {
  for (const body of creatureBodies(model, viewport, density)) {
    const distance = Math.hypot((body.creature.x - x) * viewport.width, (body.creature.y - y) * viewport.height);
    const reach = 110;
    if (distance >= reach) continue;
    const strength = (1 - distance / reach) / Math.sqrt(body.mass);
    body.creature.vx += clamp(deltaX * 7, -130, 130) * strength / viewport.width;
    body.creature.vy += clamp(deltaY * 7, -130, 130) * strength / viewport.height;
  }
}

function separateBodies(model: DeepSeaModel, viewport: Viewport, density: number, passes: number) {
  const bodies = creatureBodies(model, viewport, density);
  for (let pass = 0; pass < passes; pass += 1) {
    for (let firstIndex = 0; firstIndex < bodies.length; firstIndex += 1) {
      const first = bodies[firstIndex];
      for (let secondIndex = firstIndex + 1; secondIndex < bodies.length; secondIndex += 1) {
        const second = bodies[secondIndex];
        const dx = (second.creature.x - first.creature.x) * viewport.width;
        const dy = (second.creature.y - first.creature.y) * viewport.height;
        const whalePair = first.handle.kind === "whale" || second.handle.kind === "whale";
        const contactDistance = whalePair ? model.whale.size * Math.min(viewport.width, viewport.height) * 1.73 + (first.handle.kind === "whale" ? second.radius : first.radius) : first.radius + second.radius + 1.5;
        if (Math.abs(dx) > contactDistance || Math.abs(dy) > contactDistance || dx * dx + dy * dy > contactDistance * contactDistance) continue;
        const distance = Math.hypot(dx, dy);
        let overlap = first.radius + second.radius + 1.5 - distance;
        let nx = distance > .001 ? dx / distance : 1;
        let ny = distance > .001 ? dy / distance : 0;
        // Laboon's body is long and low. An ellipse protects the face without
        // reserving a large empty circle above and below the drawing.
        if (first.handle.kind === "whale" || second.handle.kind === "whale") {
          const whaleFirst = first.handle.kind === "whale";
          const whale = whaleFirst ? first : second;
          const other = whaleFirst ? second : first;
          const size = model.whale.size * Math.min(viewport.width, viewport.height);
          const localX = (other.creature.x - whale.creature.x) * viewport.width - size * .2;
          const localY = (other.creature.y - whale.creature.y) * viewport.height + size * .16;
          const radiusX = size * 1.53 + other.radius;
          const radiusY = size * .78 + other.radius;
          const normalizedDistance = Math.hypot(localX / radiusX, localY / radiusY);
          const gradientX = localX / (radiusX * radiusX);
          const gradientY = localY / (radiusY * radiusY);
          const gradientLength = Math.hypot(gradientX, gradientY);
          const outwardX = gradientLength > 0 ? gradientX / gradientLength : 1;
          const outwardY = gradientLength > 0 ? gradientY / gradientLength : 0;
          nx = outwardX * (whaleFirst ? 1 : -1);
          ny = outwardY * (whaleFirst ? 1 : -1);
          const quadraticA = (outwardX / radiusX) ** 2 + (outwardY / radiusY) ** 2;
          const quadraticB = 2 * (localX * outwardX / (radiusX * radiusX) + localY * outwardY / (radiusY * radiusY));
          overlap = normalizedDistance < 1 ? (-quadraticB + Math.sqrt(quadraticB ** 2 + 4 * quadraticA * (1 - normalizedDistance ** 2))) / (2 * quadraticA) + 1.5 : 0;
        }
        if (overlap <= 0) continue;
        let firstShare = sameHandle(model.dragged, first.handle) ? 0 : 1 / first.mass;
        let secondShare = sameHandle(model.dragged, second.handle) ? 0 : 1 / second.mass;
        // Laboon is anchored even while a held creature is pulled into his space.
        if (firstShare + secondShare === 0) {
          if (first.handle.kind === "whale") secondShare = 1;
          else if (second.handle.kind === "whale") firstShare = 1;
        }
        const totalShare = firstShare + secondShare;
        if (totalShare === 0) continue;
        first.creature.x -= nx * overlap * firstShare / totalShare / viewport.width;
        first.creature.y -= ny * overlap * firstShare / totalShare / viewport.height;
        second.creature.x += nx * overlap * secondShare / totalShare / viewport.width;
        second.creature.y += ny * overlap * secondShare / totalShare / viewport.height;
        const approaching = (first.creature.vx - second.creature.vx) * viewport.width * nx + (first.creature.vy - second.creature.vy) * viewport.height * ny;
        if (approaching > 0) {
          const restitution = first.creature.flight || second.creature.flight ? .88 : .18;
          const bump = approaching * (1 + restitution);
          first.creature.vx -= nx * bump * firstShare / totalShare / viewport.width;
          first.creature.vy -= ny * bump * firstShare / totalShare / viewport.height;
          second.creature.vx += nx * bump * secondShare / totalShare / viewport.width;
          second.creature.vy += ny * bump * secondShare / totalShare / viewport.height;
          if (restitution > .5 && approaching > 70 && second.handle.kind !== "whale") second.creature.flight = Math.max(second.creature.flight ?? 0, .45);
        }
      }
    }
  }
}

/** A compact deterministic ecology vignette. Positions and velocities are normalized to the canvas. */
export function createDeepSeaModel(seed: number): DeepSeaModel {
  let state = (seed >>> 0) || 0x6d2b79f5;
  const rng = () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
  // Keep a seeded pool so the density control can reveal more or fewer original particles live.
  const count = 158;
  const angler: Angler = { x: .79, y: .82, vx: 0, vy: 0, phase: rng() * 6, facing: -1, resting: 0, hunger: .72 };
  const detritus = Array.from({ length: 5 }, (_, index) => ({ x: .16 + rng() * .67, y: .27 + rng() * .56 + index * .012 }));
  const prey = Array.from({ length: count }, (_, index) => {
    const place = coveragePoint(index, 13, 13, 73, rng);
    const kind: Prey["kind"] = rng() < .28 ? "copepod" : "fish";
    return { x: place.x, y: place.y, vx: 0, vy: 0, drift: .012 + rng() * .022, phase: rng() * 20, size: 4.3 + rng() * 2.5, alive: true, kind, depth: rng() };
  });
  const jellies = Array.from({ length: 21 }, (_, index) => {
    const place = coveragePoint(index, 7, 5, 13, rng);
    if (index % 5 === 4) {
      const patch = detritus[index % detritus.length];
      place.x = clamp(patch.x + (rng() - .5) * .21, .06, .94);
      place.y = clamp(patch.y + (rng() - .5) * .17, .08, .92);
    }
    return { ...place, vx: 0, vy: 0, phase: rng() * 6, drift: .006 + rng() * .01, size: index < 5 ? .059 + rng() * .014 : .04 + rng() * .016, hue: [178, 315, 48, 198, 285, 178, 315, 198][index % 8], pulse: .7 + rng() * .3 };
  });
  const octopuses = Array.from({ length: 70 }, (_, index) => {
    const place = coveragePoint(index, 9, 8, 19, rng);
    if (index % 3 === 2) {
      const patch = detritus[index % detritus.length];
      place.x = clamp(patch.x + (rng() - .5) * .28, .04, .96);
      place.y = clamp(patch.y + (rng() - .5) * .21, .06, .94);
    }
    return { ...place, vx: 0, vy: 0, phase: rng() * 6, drift: .006 + rng() * .012, size: .025 + rng() * .015, tint: [180, 306, 48, 200][index % 4], depth: rng() };
  });
  const squids = [{ x: .83, y: .52, vx: 0, vy: 0, phase: rng() * 6, drift: .002, size: .35 + rng() * .035, tint: 196 }];
  const whale: Whale = { x: .48, y: .45, vx: 0, vy: 0, phase: rng() * 6, drift: .0025 + rng() * .002, size: .156 + rng() * .012 };
  const sharks = Array.from({ length: 11 }, (_, index) => {
    const place = coveragePoint(index, 5, 4, 7, rng);
    return { ...place, vx: 0, vy: 0, phase: rng() * 6, drift: .008 + rng() * .008, size: .034 + rng() * .018, facing: (rng() > .5 ? 1 : -1) as -1 | 1 };
  });
  return { rng, prey, jellies, octopuses, squids, sharks, whale, angler, detritus, time: 0, dragged: null, layoutKey: "" };
}

export function stepDeepSeaModel(model: DeepSeaModel, dt: number, currentStrength: number, encounterDensity: number, viewport: Viewport = { width: 390, height: 844 }, tilt: Vec = { x: 0, y: 0 }) {
  const step = clamp(dt, 0, .04);
  const current = clamp(currentStrength, 0, 2);
  const wanted = Math.round(18 + clamp(encounterDensity, 0, 2) * 70);
  const layoutKey = `${wanted}:${Math.round(viewport.width)}:${Math.round(viewport.height)}`;
  if (step === 0 && model.layoutKey === layoutKey && !model.dragged) return;
  const a = model.angler;
  const heldCreature = model.dragged ? resolveHandle(model, model.dragged) : null;
  const heldPosition = heldCreature ? { x: heldCreature.x, y: heldCreature.y } : null;
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
  }
  for (const creature of model.octopuses) {
    creature.phase += step * 1.3;
    creature.x += (Math.sin(creature.phase * .31) * creature.drift + current * .003) * step;
    creature.y += Math.cos(creature.phase * .54) * creature.drift * .6 * step;
  }
  for (const squid of model.squids) {
    squid.phase += step * .7;
    squid.x += (Math.sin(squid.phase * .23) * squid.drift + current * .002) * step;
    squid.y += Math.cos(squid.phase * .31) * squid.drift * .45 * step;
  }
  model.whale.phase += step * .56;
  for (const shark of model.sharks) {
    shark.phase += step * 1.1;
    shark.x += shark.facing * shark.drift * step + current * .002 * step;
    shark.y += Math.sin(shark.phase * .35) * shark.drift * .5 * step;
    if (shark.x < .04 || shark.x > .96) shark.facing = shark.facing === 1 ? -1 : 1;
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
    if (distance < .047 && a.resting <= 0 && particle !== heldCreature) {
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
      restingParticle.vx = 0;
      restingParticle.vy = 0;
      restingParticle.alive = true;
    }
  }
  if (Math.abs(a.x - .53) > .14) a.facing = a.x > .53 ? -1 : 1;
  a.x += (Math.sin(a.phase * .11) * .003) * step;
  a.y += (Math.sin(a.phase * .19) * .002) * step;

  // A tossed animal ricochets for a while before settling back into its slow swim.
  const allMoving: Moving[] = [a, ...model.jellies, ...model.octopuses, ...model.squids, ...model.sharks, ...model.prey.filter((particle) => particle.alive)];
  const fastestFlight = allMoving.reduce((maximum, creature) => creature.flight ? Math.max(maximum, Math.hypot(creature.vx * viewport.width, creature.vy * viewport.height)) : maximum, 0);
  const substeps = Math.min(8, Math.max(1, Math.ceil(fastestFlight * step / 12)));
  const substep = step / substeps;
  for (let part = 0; part < substeps; part += 1) {
    for (const creature of allMoving) {
      if (creature === heldCreature) continue;
      const tiltWeight = creature === a ? .35 : model.squids.includes(creature as Squid) ? .16 : .7;
      const drag = Math.exp(-(creature.flight ? .08 : 2.5) * substep);
      creature.vx = (creature.vx + clamp(tilt.x, -1, 1) * .026 * tiltWeight * substep) * drag;
      creature.vy = (creature.vy + clamp(tilt.y, -1, 1) * .018 * tiltWeight * substep) * drag;
      creature.x += creature.vx * substep;
      creature.y += creature.vy * substep;
      creature.flight = Math.max(0, (creature.flight ?? 0) - substep * .13);
    }
    if (heldCreature && heldPosition) { heldCreature.x = heldPosition.x; heldCreature.y = heldPosition.y; }
    separateBodies(model, viewport, encounterDensity, model.layoutKey === layoutKey ? (substeps > 1 ? 1 : 3) : 12);
    model.layoutKey = layoutKey;
    for (const creature of allMoving) {
      if (creature === heldCreature) continue;
      const edge = creature === a ? .075 : .025;
      if (creature.x < edge || creature.x > 1 - edge) {
        creature.x = clamp(creature.x, edge, 1 - edge);
        creature.vx *= creature.flight ? -.995 : -.36;
      }
      if (creature.y < edge || creature.y > 1 - edge) {
        creature.y = clamp(creature.y, edge, 1 - edge);
        creature.vy *= creature.flight ? -.995 : -.36;
      }
    }
  }
}
