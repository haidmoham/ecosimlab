/** Stable JSON wire types shared by the simulation server and browser. */
export const PROTOCOL_VERSION = 1 as const;

export type Species = "herbivore" | "predator";

export interface Genome {
  speed: number;
  size: number;
  vision: number;
  turnRate: number;
  metabolism: number;
  reproduceAt: number;
  hue: number;
  pattern: number;
}

export interface Phenotype {
  radius: number;
  maxSpeed: number;
  visionRange: number;
  color: string;
  pattern: "stripe" | "spot" | "ring";
}

export interface OrganismView {
  id: number;
  species: Species;
  parentId: number | null;
  generation: number;
  x: number;
  y: number;
  heading: number;
  energy: number;
  age: number;
  behavior: string;
  genome: Genome;
  phenotype: Phenotype;
}

export interface PlantView {
  id: number;
  x: number;
  y: number;
  energy: number;
  maxEnergy: number;
}

export interface WorldStats {
  herbivores: number;
  predators: number;
  plants: number;
  births: number;
  deaths: number;
  averageEnergy: number;
}

export interface WorldView {
  protocolVersion: typeof PROTOCOL_VERSION;
  tick: number;
  width: number;
  height: number;
  organisms: OrganismView[];
  plants: PlantView[];
  stats: WorldStats;
}

export type ClientMessage =
  | { type: "hello"; protocolVersion: number }
  | { type: "set-running"; running: boolean }
  | { type: "set-speed"; speed: 1 | 10 }
  | { type: "spawn-food"; x: number; y: number; amount?: number }
  | { type: "spawn-organism"; x: number; y: number; species: Species }
  | { type: "select-organism"; organismId: number | null }
  | { type: "request-reset"; confirmed: boolean };

export type ServerMessage =
  | { type: "world-init"; world: WorldView; running: boolean; speed: 1 | 10; restored: boolean }
  | { type: "world-update"; world: WorldView }
  | { type: "simulation-status"; running: boolean; speed: 1 | 10; tick: number }
  | { type: "selection-update"; organism: OrganismView | null }
  | { type: "statistics"; tick: number; stats: WorldStats }
  | { type: "command-result"; command: ClientMessage["type"]; ok: boolean; message?: string }
  | { type: "error"; code: string; message: string };
