import type { ClientMessage, ServerMessage } from "@ecosystem/protocol";
import { PROTOCOL_VERSION } from "@ecosystem/protocol";
import { Ecosystem, type WorldConfig } from "@ecosystem/simulation";
import { SnapshotStore } from "./persistence.js";

export interface SocketLike { send(data: string): void; readyState?: number; }
interface ClientState { socket: SocketLike; selectedId: number | null; commandTimes: number[]; }

export interface WorldServerOptions {
  config?: Partial<WorldConfig>;
  snapshotPath?: string;
  snapshotIntervalMs?: number;
}

/** Owns the only mutable world. Fastify is deliberately just an adapter around it. */
export class WorldServer {
  world: Ecosystem;
  running = true;
  speed: 1 | 10 = 1;
  restored = false;
  private clients = new Map<SocketLike, ClientState>();
  private readonly config: Partial<WorldConfig>;
  private store?: SnapshotStore;
  private simulationTimer?: ReturnType<typeof setInterval>;
  private broadcastTimer?: ReturnType<typeof setInterval>;
  private persistenceTimer?: ReturnType<typeof setInterval>;

  constructor(options: WorldServerOptions = {}) {
    this.config = options.config ?? {};
    if (options.snapshotPath) this.store = new SnapshotStore(options.snapshotPath);
    const saved = this.store?.load();
    try { this.world = saved ? Ecosystem.fromSnapshot(saved) : new Ecosystem(this.config); this.restored = Boolean(saved); }
    catch { this.world = new Ecosystem(this.config); this.restored = false; }
    if (options.snapshotIntervalMs && this.store) this.persistenceTimer = setInterval(() => this.persist(), options.snapshotIntervalMs);
  }

  start(): void {
    this.simulationTimer ??= setInterval(() => { if (this.running) this.world.step(this.speed); }, 50);
    this.broadcastTimer ??= setInterval(() => this.broadcastWorld(), 100);
  }
  stop(): void {
    if (this.simulationTimer) clearInterval(this.simulationTimer);
    if (this.broadcastTimer) clearInterval(this.broadcastTimer);
    if (this.persistenceTimer) clearInterval(this.persistenceTimer);
    this.simulationTimer = this.broadcastTimer = this.persistenceTimer = undefined;
    this.persist(); this.store?.close();
  }
  persist(): void { this.store?.save(this.world.snapshot()); }

  connect(socket: SocketLike): void {
    this.clients.set(socket, { socket, selectedId: null, commandTimes: [] });
    this.send(socket, { type: "world-init", world: this.world.view(), running: this.running, speed: this.speed, restored: this.restored });
  }
  disconnect(socket: SocketLike): void { this.clients.delete(socket); }

  command(socket: SocketLike, message: ClientMessage): void {
    const client = this.clients.get(socket);
    if (!client) return;
    if (!this.rateLimit(client)) return this.send(socket, { type: "error", code: "rate_limited", message: "Too many commands; please slow down." });
    if (message.type === "hello") {
      if (message.protocolVersion !== PROTOCOL_VERSION) return this.send(socket, { type: "error", code: "protocol_version", message: `Expected protocol version ${PROTOCOL_VERSION}.` });
      return this.send(socket, { type: "world-init", world: this.world.view(), running: this.running, speed: this.speed, restored: this.restored });
    }
    if (message.type === "set-running") { this.running = message.running; this.broadcastStatus(); return this.result(socket, message.type, true); }
    if (message.type === "set-speed") { this.speed = message.speed; this.broadcastStatus(); return this.result(socket, message.type, true); }
    if (message.type === "select-organism") { client.selectedId = message.organismId; return this.send(socket, { type: "selection-update", organism: message.organismId === null ? null : this.world.getOrganism(message.organismId) ?? null }); }
    if (message.type === "request-reset") {
      if (!message.confirmed) return this.result(socket, message.type, false, "Reset requires confirmation.");
      this.world = new Ecosystem(this.config); this.restored = false;
      for (const connected of this.clients.values()) connected.selectedId = null;
      this.persist(); this.broadcastInit(); return this.result(socket, message.type, true);
    }
    if (!this.insideWorld(message.x, message.y)) return this.result(socket, message.type, false, "Coordinates are outside the world.");
    if (message.type === "spawn-food") {
      const plant = this.world.addPlant(message, message.amount); if (!plant) return this.result(socket, message.type, false, "Plant population cap reached.");
    } else {
      const organism = this.world.spawnOrganism(message.species, message); if (!organism) return this.result(socket, message.type, false, `${message.species} population cap reached.`);
    }
    this.broadcastWorld(); this.result(socket, message.type, true);
  }

  private insideWorld(x: number, y: number): boolean { return x >= 0 && x <= this.world.config.width && y >= 0 && y <= this.world.config.height; }
  private rateLimit(client: ClientState): boolean {
    const now = Date.now(); client.commandTimes = client.commandTimes.filter((time) => now - time < 1000);
    if (client.commandTimes.length >= 30) return false; client.commandTimes.push(now); return true;
  }
  private result(socket: SocketLike, command: ClientMessage["type"], ok: boolean, message?: string): void { this.send(socket, { type: "command-result", command, ok, message }); }
  private send(socket: SocketLike, message: ServerMessage): void { try { socket.send(JSON.stringify(message)); } catch { this.disconnect(socket); } }
  private broadcast(message: ServerMessage): void { for (const socket of this.clients.keys()) this.send(socket, message); }
  private broadcastInit(): void { this.broadcast({ type: "world-init", world: this.world.view(), running: this.running, speed: this.speed, restored: this.restored }); }
  private broadcastStatus(): void { this.broadcast({ type: "simulation-status", running: this.running, speed: this.speed, tick: this.world.tick }); }
  broadcastWorld(): void {
    const world = this.world.view(); this.broadcast({ type: "world-update", world }); this.broadcast({ type: "statistics", tick: world.tick, stats: world.stats });
    for (const client of this.clients.values()) if (client.selectedId !== null) this.send(client.socket, { type: "selection-update", organism: this.world.getOrganism(client.selectedId) ?? null });
  }
}
