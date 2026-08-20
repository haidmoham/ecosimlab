import { useCallback, useEffect, useMemo, useState } from "react";
import { WorldCanvas } from "./WorldCanvas";
import { useEcosystemClient } from "./client";
import type { ClientMessage, Species, Tool } from "./types";
import "./styles.css";

const format = (value: number) => Number.isFinite(value) ? value.toFixed(value > 100 ? 0 : 1) : "—";

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1); const min = Math.min(...values, 0); const range = Math.max(max - min, 1);
  return <div className="sparkline" aria-hidden="true">{values.slice(-24).map((value, index) => <i key={`${index}-${value}`} style={{ height: `${Math.max(8, ((value - min) / range) * 100)}%`, background: color }} />)}</div>;
}

function StatCard({ label, value, values, color }: { label: string; value: string | number; values: number[]; color: string }) {
  return <div className="stat-card"><span>{label}</span><strong>{value}</strong><Sparkline values={values} color={color} /></div>;
}

function Inspector({ organism, onClose }: { organism: ReturnType<typeof useEcosystemClient>["world"]["organisms"][number] | undefined; onClose: () => void }) {
  if (!organism) return <section className="inspector empty-inspector"><div className="inspector-icon">◎</div><h2>Observe a lifeform</h2><p>Choose an organism on the field to follow its lineage, energy, and evolving body plan.</p></section>;
  const genes = [["speed", organism.genome.speed], ["size", organism.genome.size], ["vision", organism.genome.vision], ["turn rate", organism.genome.turnRate], ["metabolism", organism.genome.metabolism], ["reproduce at", organism.genome.reproduceAt]];
  return <section className="inspector">
    <div className="inspector-heading"><div><div className={`species-mark ${organism.species}`} /> <div><span className="eyebrow">{organism.species}</span><h2>Organism #{organism.id}</h2></div></div><button className="icon-button" onClick={onClose} aria-label="Close inspector">×</button></div>
    <div className="vitals"><div><span>energy</span><strong>{format(organism.energy)}</strong></div><div><span>age</span><strong>{format(organism.age)}</strong></div><div><span>generation</span><strong>{organism.generation}</strong></div></div>
    <div className="energy-bar"><span style={{ width: `${Math.min(100, organism.energy)}%` }} /></div>
    <div className="behavior"><span>current behavior</span><strong>{organism.behavior || "exploring"}</strong></div>
    <div className="inspector-section"><div className="section-title"><span>PHENOTYPE</span><small>expressed traits</small></div><dl className="trait-list"><div><dt>body radius</dt><dd>{format(organism.phenotype.radius)}</dd></div><div><dt>max speed</dt><dd>{format(organism.phenotype.maxSpeed)}</dd></div><div><dt>vision range</dt><dd>{format(organism.phenotype.visionRange)}</dd></div><div><dt>pattern</dt><dd>{organism.phenotype.pattern}</dd></div></dl></div>
    <div className="inspector-section"><div className="section-title"><span>GENOME</span><small>mutable · inherited</small></div><dl className="trait-list gene-list">{genes.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{format(Number(value))}</dd></div>)}<div><dt>parent</dt><dd>{organism.parentId ?? "founder"}</dd></div></dl></div>
  </section>;
}

export default function App() {
  const { world, connection, notice, send } = useEcosystemClient();
  const [tool, setTool] = useState<Tool>("inspect");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [recenterSignal, setRecenterSignal] = useState(0);
  const selected = useMemo(() => world.organisms.find((organism) => organism.id === selectedId), [world.organisms, selectedId]);
  const stats = world.stats;
  const history = stats.history ?? [];
  const sendMessage = useCallback((message: ClientMessage) => send(message), [send]);
  const select = useCallback((id: number | null) => { setSelectedId(id); sendMessage({ type: "select-organism", organismId: id }); }, [sendMessage]);
  const action = useCallback((actionTool: Exclude<Tool, "inspect">, point: { x: number; y: number }) => {
    if (actionTool === "food") sendMessage({ type: "spawn-food", x: point.x, y: point.y, amount: 12 });
    else sendMessage({ type: "spawn-organism", species: actionTool as Species, x: point.x, y: point.y });
  }, [sendMessage]);

  useEffect(() => { const media = matchMedia("(prefers-reduced-motion: reduce)"); const update = () => setReducedMotion(media.matches); update(); media.addEventListener("change", update); return () => media.removeEventListener("change", update); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.code === "Space") { event.preventDefault(); sendMessage({ type: "set-running", running: !world.running }); }
      if (event.key.toLowerCase() === "r") setRecenterSignal((value) => value + 1);
      if (event.key === "1") sendMessage({ type: "set-speed", speed: 1 });
      if (event.key === "0") sendMessage({ type: "set-speed", speed: 10 });
      if (event.key === "Escape") select(null);
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [world.running, sendMessage, selectedId, select]);

  const reset = () => { if (window.confirm("Reset the shared ecosystem? This clears the saved world for everyone.")) sendMessage({ type: "request-reset", confirmed: true }); };
  const connectionLabel = { connected: "LIVE", connecting: "CONNECTING", reconnecting: "RECONNECTING", offline: "OFFLINE" }[connection];

  return <main className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-glyph"><span /><span /><span /></div><div><div className="brand-name">ECOSYSTEM <em>LAB</em></div><div className="brand-subtitle">a living field study</div></div></div><div className="topbar-right"><div className={`connection ${connection}`}><i />{connectionLabel}</div><span className="tick">TICK {world.tick.toString().padStart(7, "0")}</span></div></header>
    <div className="workspace">
      <section className="field-column">
        <div className="field-toolbar"><div className="toolbar-group"><button className={`tool-button ${tool === "inspect" ? "active" : ""}`} onClick={() => setTool("inspect")}><span>◎</span> Observe</button><button className={`tool-button ${tool === "food" ? "active food" : ""}`} onClick={() => setTool("food")}><span>✦</span> Plant food</button><button className={`tool-button ${tool === "herbivore" ? "active herbivore" : ""}`} onClick={() => setTool("herbivore")}><span>◉</span> Herbivore</button><button className={`tool-button ${tool === "predator" ? "active predator" : ""}`} onClick={() => setTool("predator")}><span>◆</span> Predator</button></div><div className="toolbar-group camera-tools"><button className="tool-button" onClick={() => setRecenterSignal((value) => value + 1)} aria-label="Recenter world">⌖ Recenter</button></div></div>
        <div className="canvas-wrap"><WorldCanvas world={world} tool={tool} selectedId={selectedId} reducedMotion={reducedMotion} onSelect={select} onAction={action} recenterSignal={recenterSignal} /><div className="field-hint">{tool === "inspect" ? "Click a lifeform to inspect · drag to pan · scroll to zoom" : `Click field to ${tool === "food" ? "plant food" : `spawn a ${tool}`} · drag to pan`}</div>{notice && <div className="toast" role="status">{notice}</div>}</div>
        <div className="field-footer"><span><i className="legend-dot herbivore" /> herbivores</span><span><i className="legend-dot predator" /> predators</span><span><i className="legend-dot plant" /> plant energy</span><span className="field-footer-note">{world.restored ? "restored from snapshot" : "seeded field"}</span></div>
      </section>
      <aside className="side-panel"><section className="control-panel"><div className="panel-heading"><div><span className="eyebrow">FIELD CONTROL</span><h1>One world, many eyes</h1></div><div className="shared-badge">SHARED</div></div><div className="transport"><button className="play-button" onClick={() => sendMessage({ type: "set-running", running: !world.running })} aria-label={world.running ? "Pause simulation" : "Resume simulation"}>{world.running ? "Ⅱ" : "▶"}</button><div className="speed-buttons"><button className={world.speed === 1 ? "selected" : ""} onClick={() => sendMessage({ type: "set-speed", speed: 1 })}>1×</button><button className={world.speed === 10 ? "selected" : ""} onClick={() => sendMessage({ type: "set-speed", speed: 10 })}>10×</button></div><span className="status-copy">{world.running ? "running" : "paused"}<small>server canonical</small></span><button className="reset-button" onClick={reset}>Reset</button></div><div className="motion-choice"><label><input type="checkbox" checked={reducedMotion} onChange={(event) => setReducedMotion(event.target.checked)} /> reduce field motion</label></div></section>
        <section className="stats-panel"><div className="section-title"><span>POPULATION PULSE</span><small>live · tick {world.tick}</small></div><div className="stats-grid"><StatCard label="herbivores" value={stats.herbivores} values={history.map((value) => value.herbivores)} color="#8dbd91" /><StatCard label="predators" value={stats.predators} values={history.map((value) => value.predators)} color="#d47e6f" /><StatCard label="plant patches" value={stats.plants} values={history.map((value) => value.plants)} color="#d5ba68" /><StatCard label="avg. energy" value={format(stats.averageEnergy)} values={history.map((value) => value.averageEnergy)} color="#75b8c5" /></div><div className="demography"><span><b className="birth-dot" /> {stats.births} births</span><span><b className="death-dot" /> {stats.deaths} deaths</span></div></section>
        <Inspector organism={selected} onClose={() => select(null)} />
      </aside>
    </div>
    <footer className="app-footer"><span>FIELD SIZE <b>{world.width.toLocaleString()} × {world.height.toLocaleString()}</b></span><span>FIXED STEP <b>20 Hz</b></span><span>NETWORK <b>10 Hz</b></span><span className="footer-right">Space pause · R recenter · 1 / 0 speed</span></footer>
  </main>;
}
