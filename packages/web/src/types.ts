import type {
  ClientMessage as ProtocolClientMessage,
  Genome,
  OrganismView,
  PlantView,
  ServerMessage as ProtocolServerMessage,
  Species,
  WorldStats,
  WorldView as ProtocolWorldView,
} from "@ecosystem/protocol";

export type { Genome, OrganismView, PlantView, Species };
export type Stats = WorldStats & { history?: Array<Pick<WorldStats, "herbivores" | "predators" | "plants" | "averageEnergy">> };

export type WorldView = ProtocolWorldView & {
  running: boolean;
  speed: 1 | 10;
  restored?: boolean;
  selectedId?: number | null;
  stats: Stats;
};

export type Tool = "inspect" | "food" | "herbivore" | "predator";

export type ClientMessage = ProtocolClientMessage;

export type ServerMessage = ProtocolServerMessage;
