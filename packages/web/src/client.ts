import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, ServerMessage, Stats, WorldView } from "./types";

export type ConnectionState = "connecting" | "connected" | "reconnecting" | "offline";

function readMessage(data: unknown): ServerMessage | null {
  try {
    const parsed = JSON.parse(typeof data === "string" ? data : new TextDecoder().decode(data as ArrayBuffer));
    return parsed && typeof parsed.type === "string" ? (parsed as ServerMessage) : null;
  } catch {
    return null;
  }
}

const fallbackWorld = (): WorldView => {
  const organisms = Array.from({ length: 34 }, (_, index) => {
    const species: "predator" | "herbivore" = index % 6 === 0 ? "predator" : "herbivore";
    const genome = { speed: .8 + (index % 5) * .16, size: .5 + (index % 4) * .2, vision: .8 + (index % 6) * .12, turnRate: .2, metabolism: .2, reproduceAt: 70, hue: species === "predator" ? 8 + index * 1.7 : 112 + index * 2.2, pattern: index * .37 };
    const phenotype = { radius: 5 + genome.size * 5, maxSpeed: genome.speed, visionRange: genome.vision * 100, color: `hsl(${genome.hue}, 65%, 48%)`, pattern: ["stripe", "spot", "ring"][index % 3] as "stripe" | "spot" | "ring" };
    return { id: index, species, parentId: null, generation: index % 4, x: 300 + (index * 337) % 3400, y: 280 + (index * 563) % 3400, heading: index * .7, energy: 45 + (index % 5) * 8, age: index * 14, genome, phenotype, behavior: index % 3 === 0 ? "foraging" : "cruising" };
  });
  const plants = Array.from({ length: 120 }, (_, index) => ({ id: index, x: (index * 173) % 3900 + 50, y: (index * 293) % 3900 + 50, energy: 10 + index % 4, maxEnergy: 14 }));
  return { protocolVersion: 1, tick: 0, width: 4000, height: 4000, organisms, plants, running: true, speed: 1, stats: { herbivores: 28, predators: 6, plants: 120, births: 0, deaths: 0, averageEnergy: 62 }, restored: false };
};

export function useEcosystemClient() {
  const [world, setWorld] = useState<WorldView>(() => fallbackWorld());
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [notice, setNotice] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const worldRef = useRef(world);
  useEffect(() => { worldRef.current = world; }, [world]);

  const send = useCallback((message: ClientMessage) => {
    const socket = wsRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }, []);

  useEffect(() => {
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const url = import.meta.env.VITE_WS_URL || `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
    const connect = () => {
      if (disposed) return;
      setConnection((state) => state === "connecting" ? state : "reconnecting");
      let socket: WebSocket;
      try { socket = new WebSocket(url); } catch { setConnection("offline"); retry = setTimeout(connect, 2500); return; }
      wsRef.current = socket;
      socket.onopen = () => { setConnection("connected"); socket.send(JSON.stringify({ type: "hello", protocolVersion: 1 })); };
      socket.onmessage = (event) => {
        const message = readMessage(event.data);
        if (!message) return;
        if (message.type === "world-init") setWorld({ ...message.world, running: message.running, speed: message.speed, restored: message.restored });
        if (message.type === "world-update") setWorld((current) => ({ ...message.world, running: current.running, speed: current.speed, restored: current.restored, stats: { ...message.world.stats, history: current.stats.history } }));
        if (message.type === "simulation-status") setWorld((current) => ({ ...current, running: message.running, speed: message.speed }));
        if (message.type === "selection-update") setWorld((current) => ({ ...current, selectedId: message.organism?.id ?? null }));
        if (message.type === "statistics") setWorld((current) => ({ ...current, stats: { ...message.stats, history: mergeStatsHistory(message.stats, current.stats.history) } }));
        if (message.type === "error" || (message.type === "command-result" && !message.ok)) { setNotice(message.message ?? "The server rejected that command."); setTimeout(() => setNotice(null), 3000); }
      };
      socket.onclose = () => { if (!disposed) { setConnection("reconnecting"); retry = setTimeout(connect, 1800); } };
      socket.onerror = () => socket.close();
    };
    connect();
    return () => { disposed = true; if (retry) clearTimeout(retry); wsRef.current?.close(); };
  }, []);

  return { world, connection, notice, send };
}

export function mergeStatsHistory(stats: Stats, prior: Stats["history"] = []) {
  const current = { herbivores: stats.herbivores, predators: stats.predators, plants: stats.plants, averageEnergy: stats.averageEnergy };
  return [...prior, current].slice(-36);
}
