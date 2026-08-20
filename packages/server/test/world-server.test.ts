import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WorldServer } from "../src/world-server.js";
import { Ecosystem, type WorldSnapshot } from "@ecosystem/simulation";
import { SnapshotStore } from "../src/persistence.js";
import type { ServerMessage } from "@ecosystem/protocol";

class FakeSocket {
  readonly sent: ServerMessage[] = [];
  send(data: string): void { this.sent.push(JSON.parse(data) as ServerMessage); }
  last(): ServerMessage { return this.sent.at(-1)!; }
}

const config = { width: 100, height: 100, initialHerbivores: 0, initialPredators: 0, initialPlants: 0, maxHerbivores: 2, maxPredators: 2, maxPlants: 2 };

describe("authoritative world server", () => {
  it("synchronizes a new client and broadcasts shared controls", () => {
    const server = new WorldServer({ config }); const first = new FakeSocket(); const second = new FakeSocket();
    server.connect(first); server.connect(second);
    expect(first.last().type).toBe("world-init");
    server.command(first, { type: "set-speed", speed: 10 });
    expect(second.last()).toMatchObject({ type: "simulation-status", speed: 10 });
    server.stop();
  });

  it("validates coordinates and honors population caps", () => {
    const server = new WorldServer({ config }); const socket = new FakeSocket(); server.connect(socket);
    server.command(socket, { type: "spawn-food", x: -1, y: 5 });
    expect(socket.last()).toMatchObject({ type: "command-result", ok: false });
    server.command(socket, { type: "spawn-organism", x: 5, y: 5, species: "herbivore" });
    server.command(socket, { type: "spawn-organism", x: 6, y: 6, species: "herbivore" });
    server.command(socket, { type: "spawn-organism", x: 7, y: 7, species: "herbivore" });
    expect(socket.last()).toMatchObject({ type: "command-result", ok: false, message: expect.stringContaining("cap") });
    server.stop();
  });

  it("broadcasts fresh initialization metadata when reset replaces a restored world", () => {
    const server = new WorldServer({ config }); const first = new FakeSocket(); const second = new FakeSocket();
    server.connect(first); server.connect(second); server.restored = true;
    server.command(first, { type: "request-reset", confirmed: true });
    const init = second.sent.filter((message) => message.type === "world-init").at(-1);
    expect(init).toMatchObject({ type: "world-init", restored: false, running: true, speed: 1 });
    server.stop();
  });

  it("persists and restores a valid snapshot", () => {
    const database = join(mkdtempSync(join(tmpdir(), "ecosystem-")), "world.sqlite");
    const first = new WorldServer({ config, snapshotPath: database }); const socket = new FakeSocket(); first.connect(socket);
    first.command(socket, { type: "spawn-organism", x: 5, y: 5, species: "herbivore" }); first.persist(); first.stop();
    const restored = new WorldServer({ config, snapshotPath: database });
    expect(restored.restored).toBe(true); expect(restored.world.view().stats.herbivores).toBe(1); restored.stop();
  });

  it("falls back when stored JSON is corrupt", () => {
    const database = join(mkdtempSync(join(tmpdir(), "ecosystem-")), "world.sqlite");
    const store = new SnapshotStore(database);
    store.save({ version: 999, config, tick: 0, nextId: 1, randomState: 1, births: 0, deaths: 0, organisms: [], plants: [] } as unknown as WorldSnapshot);
    store.close();
    const server = new WorldServer({ config, snapshotPath: database });
    expect(server.restored).toBe(false); expect(server.world).toBeInstanceOf(Ecosystem); server.stop();
  });
});
