import type { Genome, OrganismView, Phenotype, PlantView, Species, WorldStats, WorldView } from "@ecosystem/protocol";
import { PROTOCOL_VERSION } from "@ecosystem/protocol";
import { Random } from "./random.js";

export { Random } from "./random.js";
export type { Genome, OrganismView, Phenotype, PlantView, Species, WorldStats, WorldView } from "@ecosystem/protocol";

export const SNAPSHOT_VERSION = 1;

export interface WorldConfig {
  width: number;
  height: number;
  seed: number;
  initialHerbivores: number;
  initialPredators: number;
  initialPlants: number;
  maxHerbivores: number;
  maxPredators: number;
  maxPlants: number;
  plantRegrowth: number;
  plantEnergy: number;
}

export const defaultWorldConfig: WorldConfig = {
  width: 4000, height: 4000, seed: 0xdecafbad,
  initialHerbivores: 150, initialPredators: 25, initialPlants: 700,
  maxHerbivores: 700, maxPredators: 220, maxPlants: 1200,
  plantRegrowth: 0.08, plantEnergy: 24,
};

type Plant = PlantView;
interface Organism extends Omit<OrganismView, "phenotype"> { phenotype: Phenotype }
export interface WorldSnapshot {
  version: number;
  config: WorldConfig;
  tick: number;
  nextId: number;
  randomState: number;
  births: number;
  deaths: number;
  organisms: OrganismView[];
  plants: PlantView[];
}

const TAU = Math.PI * 2;
const clamp = (v: number, low: number, high: number) => Math.min(high, Math.max(low, v));
const wrap = (v: number, limit: number) => ((v % limit) + limit) % limit;
const angleDelta = (from: number, to: number) => ((to - from + Math.PI * 3) % TAU) - Math.PI;

export function toroidalDelta(from: number, to: number, size: number): number {
  let delta = to - from;
  if (delta > size / 2) delta -= size;
  if (delta < -size / 2) delta += size;
  return delta;
}

export function toroidalDistance(a: { x: number; y: number }, b: { x: number; y: number }, config: Pick<WorldConfig, "width" | "height">): number {
  return Math.hypot(toroidalDelta(a.x, b.x, config.width), toroidalDelta(a.y, b.y, config.height));
}

export function phenotypeFromGenome(genome: Genome): Phenotype {
  const hue = Math.round(wrap(genome.hue, 360));
  return {
    radius: 4 + genome.size * 9,
    maxSpeed: 0.6 + genome.speed * 2.8,
    visionRange: 45 + genome.vision * 250,
    color: `hsl(${hue} 72% ${48 + Math.round(genome.size * 16)}%)`,
    pattern: genome.pattern < 1 / 3 ? "stripe" : genome.pattern < 2 / 3 ? "spot" : "ring",
  };
}

export class Ecosystem {
  readonly config: WorldConfig;
  private readonly random: Random;
  private organisms = new Map<number, Organism>();
  private plants = new Map<number, Plant>();
  private nextId = 1;
  private births = 0;
  private deaths = 0;
  tick = 0;

  constructor(config: Partial<WorldConfig> = {}, hydrate?: WorldSnapshot) {
    this.config = { ...defaultWorldConfig, ...config };
    this.random = new Random(this.config.seed);
    if (hydrate) this.restore(hydrate);
    else this.seed();
  }

  static fromSnapshot(snapshot: WorldSnapshot): Ecosystem {
    if (snapshot.version !== SNAPSHOT_VERSION) throw new Error(`Unsupported world snapshot version: ${snapshot.version}`);
    return new Ecosystem(snapshot.config, snapshot);
  }

  private seed(): void {
    for (let i = 0; i < this.config.initialPlants; i++) this.addPlant(this.randomPosition(), this.config.plantEnergy);
    for (let i = 0; i < this.config.initialHerbivores; i++) this.spawnOrganism("herbivore", this.randomPosition());
    for (let i = 0; i < this.config.initialPredators; i++) this.spawnOrganism("predator", this.randomPosition());
  }

  private restore(snapshot: WorldSnapshot): void {
    this.tick = snapshot.tick;
    this.nextId = snapshot.nextId;
    this.births = snapshot.births;
    this.deaths = snapshot.deaths;
    this.random.state = snapshot.randomState;
    for (const plant of snapshot.plants) this.plants.set(plant.id, { ...plant });
    for (const entry of snapshot.organisms) this.organisms.set(entry.id, { ...entry, genome: { ...entry.genome }, phenotype: phenotypeFromGenome(entry.genome) });
  }

  private randomPosition(): { x: number; y: number } { return { x: this.random.between(0, this.config.width), y: this.random.between(0, this.config.height) }; }
  private genome(species: Species): Genome {
    return {
      speed: this.random.between(0.25, 0.85), size: this.random.between(0.25, 0.8), vision: this.random.between(0.2, 0.9),
      turnRate: this.random.between(0.1, 0.85), metabolism: this.random.between(0.25, 0.75), reproduceAt: this.random.between(0.45, 0.85),
      hue: species === "predator" ? this.random.between(0, 55) : this.random.between(90, 240), pattern: this.random.next(),
    };
  }

  spawnOrganism(species: Species, position: { x: number; y: number }, genome = this.genome(species), parentId: number | null = null, generation = 0): Organism | null {
    const count = this.count(species);
    const cap = species === "herbivore" ? this.config.maxHerbivores : this.config.maxPredators;
    if (count >= cap) return null;
    const id = this.nextId++;
    const normalized = { x: wrap(position.x, this.config.width), y: wrap(position.y, this.config.height) };
    const organism: Organism = { id, species, parentId, generation, ...normalized, heading: this.random.between(0, TAU), energy: 48, age: 0, behavior: "wandering", genome, phenotype: phenotypeFromGenome(genome) };
    this.organisms.set(id, organism);
    return organism;
  }

  addPlant(position: { x: number; y: number }, energy = this.config.plantEnergy): Plant | null {
    if (this.plants.size >= this.config.maxPlants) return null;
    const plant: Plant = { id: this.nextId++, x: wrap(position.x, this.config.width), y: wrap(position.y, this.config.height), energy: clamp(energy, 0.1, this.config.plantEnergy * 2), maxEnergy: this.config.plantEnergy };
    this.plants.set(plant.id, plant);
    return plant;
  }

  count(species: Species): number { let count = 0; for (const value of this.organisms.values()) if (value.species === species) count++; return count; }
  getOrganism(id: number): OrganismView | undefined { const value = this.organisms.get(id); return value && this.copyOrganism(value); }

  step(steps = 1): void {
    for (let step = 0; step < steps; step++) {
      this.tick++;
      this.growPlants();
      const dead = new Set<number>();
      const newborns: Array<{ parent: Organism; position: { x: number; y: number }; genome: Genome }> = [];
      for (const organism of this.organisms.values()) {
        if (dead.has(organism.id)) continue;
        this.moveAndEat(organism, dead);
        organism.age++;
        organism.energy = Math.max(0, organism.energy - (0.018 + organism.genome.metabolism * 0.04 + organism.genome.size * 0.02));
        if (organism.energy <= 0 || organism.age > 17000) { dead.add(organism.id); continue; }
        const threshold = 65 + organism.genome.reproduceAt * 80;
        if (organism.energy >= threshold && this.random.next() < 0.015) {
          organism.energy *= 0.5;
          newborns.push({ parent: organism, position: { x: wrap(organism.x + Math.cos(organism.heading) * 18, this.config.width), y: wrap(organism.y + Math.sin(organism.heading) * 18, this.config.height) }, genome: this.mutate(organism.genome) });
        }
      }
      for (const id of dead) { this.organisms.delete(id); this.deaths++; }
      for (const child of newborns) {
        const created = this.spawnOrganism(child.parent.species, child.position, child.genome, child.parent.id, child.parent.generation + 1);
        if (created) { created.energy = child.parent.energy; this.births++; }
      }
    }
  }

  private growPlants(): void {
    for (const plant of this.plants.values()) plant.energy = Math.min(plant.maxEnergy, plant.energy + this.config.plantRegrowth);
    if (this.plants.size < this.config.maxPlants && this.random.next() < 0.12) this.addPlant(this.randomPosition(), this.random.between(2, this.config.plantEnergy));
  }

  private moveAndEat(organism: Organism, dead: Set<number>): void {
    const target = organism.species === "herbivore" ? this.closestPlant(organism) : this.closestPrey(organism, dead);
    if (target) {
      const dx = toroidalDelta(organism.x, target.x, this.config.width);
      const dy = toroidalDelta(organism.y, target.y, this.config.height);
      const desired = Math.atan2(dy, dx);
      const maxTurn = 0.02 + organism.genome.turnRate * 0.22;
      organism.heading += clamp(angleDelta(organism.heading, desired), -maxTurn, maxTurn);
      organism.behavior = organism.species === "herbivore" ? "foraging" : "hunting";
    } else {
      organism.heading += this.random.gaussian() * (0.02 + organism.genome.turnRate * 0.05);
      organism.behavior = "wandering";
    }
    organism.heading = wrap(organism.heading, TAU);
    const distance = organism.phenotype.maxSpeed;
    organism.x = wrap(organism.x + Math.cos(organism.heading) * distance, this.config.width);
    organism.y = wrap(organism.y + Math.sin(organism.heading) * distance, this.config.height);
    const reach = organism.phenotype.radius + 6;
    if (organism.species === "herbivore") {
      for (const plant of this.plants.values()) {
        if (toroidalDistance(organism, plant, this.config) <= reach && plant.energy > 0) {
          const eaten = Math.min(3.5, plant.energy); plant.energy -= eaten; organism.energy = Math.min(180, organism.energy + eaten * 1.35); organism.behavior = "eating"; break;
        }
      }
    } else {
      for (const prey of this.organisms.values()) {
        if (prey.species === "herbivore" && !dead.has(prey.id) && toroidalDistance(organism, prey, this.config) <= reach + prey.phenotype.radius) {
          dead.add(prey.id); organism.energy = Math.min(190, organism.energy + prey.energy * 0.72); organism.behavior = "eating"; break;
        }
      }
    }
  }

  private closestPlant(from: Organism): Plant | undefined {
    let best: Plant | undefined; let bestDistance = from.phenotype.visionRange;
    for (const plant of this.plants.values()) { if (plant.energy <= 0) continue; const distance = toroidalDistance(from, plant, this.config); if (distance < bestDistance) { best = plant; bestDistance = distance; } }
    return best;
  }
  private closestPrey(from: Organism, dead: Set<number>): Organism | undefined {
    let best: Organism | undefined; let bestDistance = from.phenotype.visionRange;
    for (const prey of this.organisms.values()) { if (prey.species !== "herbivore" || dead.has(prey.id)) continue; const distance = toroidalDistance(from, prey, this.config); if (distance < bestDistance) { best = prey; bestDistance = distance; } }
    return best;
  }
  private mutate(parent: Genome): Genome {
    return {
      speed: clamp(parent.speed + this.random.gaussian() * 0.06, 0.05, 1), size: clamp(parent.size + this.random.gaussian() * 0.06, 0.05, 1), vision: clamp(parent.vision + this.random.gaussian() * 0.06, 0.05, 1),
      turnRate: clamp(parent.turnRate + this.random.gaussian() * 0.06, 0.02, 1), metabolism: clamp(parent.metabolism + this.random.gaussian() * 0.05, 0.05, 1), reproduceAt: clamp(parent.reproduceAt + this.random.gaussian() * 0.05, 0.05, 1),
      hue: wrap(parent.hue + this.random.gaussian() * 8, 360), pattern: clamp(parent.pattern + this.random.gaussian() * 0.06, 0, 0.999),
    };
  }
  private copyOrganism(organism: Organism): OrganismView { return { ...organism, genome: { ...organism.genome }, phenotype: { ...organism.phenotype } }; }
  statistics(): WorldStats {
    const organisms = [...this.organisms.values()]; const herbivores = organisms.filter((o) => o.species === "herbivore").length;
    return { herbivores, predators: organisms.length - herbivores, plants: this.plants.size, births: this.births, deaths: this.deaths, averageEnergy: organisms.length ? organisms.reduce((sum, organism) => sum + organism.energy, 0) / organisms.length : 0 };
  }
  view(): WorldView { return { protocolVersion: PROTOCOL_VERSION, tick: this.tick, width: this.config.width, height: this.config.height, organisms: [...this.organisms.values()].map((organism) => this.copyOrganism(organism)), plants: [...this.plants.values()].map((plant) => ({ ...plant })), stats: this.statistics() }; }
  snapshot(): WorldSnapshot { return { version: SNAPSHOT_VERSION, config: { ...this.config }, tick: this.tick, nextId: this.nextId, randomState: this.random.state, births: this.births, deaths: this.deaths, organisms: this.view().organisms, plants: this.view().plants }; }
}
