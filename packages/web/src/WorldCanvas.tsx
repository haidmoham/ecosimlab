import { useEffect, useRef } from "react";
import { organismAppearance } from "./appearance";
import type { OrganismView, PlantView, Tool, WorldView } from "./types";

type Point = { x: number; y: number };
type Camera = { x: number; y: number; zoom: number };

type Props = {
  world: WorldView;
  tool: Tool;
  selectedId: number | null;
  reducedMotion: boolean;
  onSelect: (id: number | null) => void;
  onAction: (tool: Exclude<Tool, "inspect">, point: Point) => void;
  recenterSignal?: number;
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function WorldCanvas({ world, tool, selectedId, reducedMotion, onSelect, onAction, recenterSignal = 0 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<Camera>({ x: world.width / 2, y: world.height / 2, zoom: .2 });
  const pointers = useRef(new Map<number, Point>());
  const gestureRef = useRef<{ start?: Point; origin?: Camera; pinch?: number }>({});
  const worldRef = useRef(world);
  useEffect(() => { worldRef.current = world; }, [world]);

  useEffect(() => {
    cameraRef.current = { x: world.width / 2, y: world.height / 2, zoom: Math.min(cameraRef.current.zoom, .8) };
  }, [recenterSignal, world.width, world.height]);

  const worldPoint = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const camera = cameraRef.current;
    return { x: camera.x + (clientX - rect.left - rect.width / 2) / camera.zoom, y: camera.y + (clientY - rect.top - rect.height / 2) / camera.zoom };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let frame = 0;
    const resize = () => {
      const rect = host.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };
    const draw = () => {
      const rect = host.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const camera = cameraRef.current;
      const current = worldRef.current;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, rect.width, rect.height);
      context.fillStyle = "#0a1214";
      context.fillRect(0, 0, rect.width, rect.height);
      const toScreen = (x: number, y: number) => ({ x: (x - camera.x) * camera.zoom + rect.width / 2, y: (y - camera.y) * camera.zoom + rect.height / 2 });
      const left = camera.x - rect.width / camera.zoom / 2;
      const right = camera.x + rect.width / camera.zoom / 2;
      const top = camera.y - rect.height / camera.zoom / 2;
      const bottom = camera.y + rect.height / camera.zoom / 2;
      // A quiet graph-paper field makes scale and movement readable without competing with life.
      const grid = 200;
      context.strokeStyle = "rgba(145, 191, 166, .06)";
      context.lineWidth = 1;
      context.beginPath();
      for (let x = Math.floor(left / grid) * grid; x <= right; x += grid) { const sx = toScreen(x, 0).x; context.moveTo(sx, 0); context.lineTo(sx, rect.height); }
      for (let y = Math.floor(top / grid) * grid; y <= bottom; y += grid) { const sy = toScreen(0, y).y; context.moveTo(0, sy); context.lineTo(rect.width, sy); }
      context.stroke();
      const drawPlant = (plant: PlantView) => {
        const p = toScreen(plant.x, plant.y);
        if (p.x < -15 || p.x > rect.width + 15 || p.y < -15 || p.y > rect.height + 15) return;
        const radius = Math.max(2, (6 + (plant.energy / Math.max(1, plant.maxEnergy)) * 3) * camera.zoom);
        const vitality = clamp((plant.energy ?? 5) / (plant.maxEnergy || 14), .2, 1);
        context.fillStyle = `rgba(102, 194, 130, ${.24 + vitality * .45})`;
        context.beginPath(); context.arc(p.x, p.y, radius, 0, Math.PI * 2); context.fill();
        context.fillStyle = "rgba(176, 228, 161, .7)";
        context.beginPath(); context.arc(p.x - radius * .3, p.y - radius * .25, Math.max(1, radius * .25), 0, Math.PI * 2); context.fill();
      };
      current.plants.forEach(drawPlant);
      const drawOrganism = (organism: OrganismView) => {
        const p = toScreen(organism.x, organism.y);
        const appearance = organismAppearance(organism.genome, organism.species);
        const radius = Math.max(3, appearance.size * camera.zoom);
        if (p.x < -radius - 20 || p.x > rect.width + radius + 20 || p.y < -radius - 20 || p.y > rect.height + radius + 20) return;
        const heading = organism.heading ?? 0;
        context.save(); context.translate(p.x, p.y); context.rotate(heading);
        context.fillStyle = appearance.fill; context.strokeStyle = appearance.edge; context.lineWidth = Math.max(1, camera.zoom);
        context.beginPath();
        if (organism.species === "predator") { context.moveTo(radius * 1.45, 0); context.lineTo(-radius, radius * .9); context.lineTo(-radius * .6, 0); context.lineTo(-radius, -radius * .9); context.closePath(); } else { context.arc(0, 0, radius, 0, Math.PI * 2); }
        context.fill(); context.stroke();
        context.globalAlpha = .52;
        if (appearance.pattern === 0) { context.strokeStyle = appearance.edge; context.lineWidth = Math.max(1, radius * .28); context.beginPath(); context.moveTo(-radius * .7, -radius * .55); context.lineTo(radius * .7, radius * .55); context.stroke(); }
        if (appearance.pattern === 1) { context.fillStyle = appearance.edge; context.beginPath(); context.arc(-radius * .35, -radius * .35, Math.max(1, radius * .22), 0, Math.PI * 2); context.arc(radius * .35, radius * .35, Math.max(1, radius * .17), 0, Math.PI * 2); context.fill(); }
        context.globalAlpha = 1; context.fillStyle = appearance.eye; context.beginPath(); context.arc(radius * .62, -radius * .33, Math.max(1.2, radius * .19), 0, Math.PI * 2); context.fill(); context.restore();
        if (Number(organism.id) === Number(selectedId)) {
          context.strokeStyle = "#f4cb71"; context.lineWidth = 2; context.setLineDash([4, 4]); context.beginPath(); context.arc(p.x, p.y, radius + 7, 0, Math.PI * 2); context.stroke(); context.setLineDash([]);
        }
      };
      current.organisms.forEach(drawOrganism);
      context.fillStyle = "rgba(215, 238, 222, .48)"; context.font = "11px ui-monospace, SFMono-Regular, monospace"; context.fillText(`${Math.round(camera.zoom * 100)}% · ${current.width} × ${current.height}`, 16, rect.height - 17);
      if (!reducedMotion) frame = requestAnimationFrame(draw);
    };
    // Canvas dimension writes clear the bitmap, so resize must always be paired
    // with a draw. This is especially important when reduced-motion disables RAF.
    const resizeObserver = new ResizeObserver(() => { resize(); draw(); });
    resizeObserver.observe(host); resize(); draw();
    return () => { resizeObserver?.disconnect(); cancelAnimationFrame(frame); };
  }, [reducedMotion, selectedId, world.tick]);

  const pick = (point: Point) => {
    const camera = cameraRef.current;
    const hit = world.organisms.find((organism) => {
      const dx = organism.x - point.x; const dy = organism.y - point.y;
      const radius = (organism.phenotype?.radius ?? 8) * 2.3;
      return dx * dx + dy * dy < radius * radius / Math.max(.1, camera.zoom);
    });
    return hit?.id ?? null;
  };

  return <div ref={hostRef} className="world-stage" aria-label="Interactive ecosystem map">
    <canvas ref={canvasRef}
      onWheel={(event) => { event.preventDefault(); const before = worldPoint(event.clientX, event.clientY); const camera = cameraRef.current; camera.zoom = clamp(camera.zoom * Math.exp(-event.deltaY * .001), .12, 3.5); const after = worldPoint(event.clientX, event.clientY); camera.x += before.x - after.x; camera.y += before.y - after.y; }}
      onPointerDown={(event) => { (event.currentTarget as HTMLCanvasElement).setPointerCapture(event.pointerId); const point = { x: event.clientX, y: event.clientY }; pointers.current.set(event.pointerId, point); if (pointers.current.size === 1) gestureRef.current = { start: point, origin: { ...cameraRef.current } }; else if (pointers.current.size === 2) { const [a, b] = [...pointers.current.values()]; gestureRef.current.pinch = distance(a, b); gestureRef.current.origin = { ...cameraRef.current }; } }}
      onPointerMove={(event) => { if (!pointers.current.has(event.pointerId)) return; pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); const values = [...pointers.current.values()]; const camera = cameraRef.current; if (values.length === 2 && gestureRef.current.pinch && gestureRef.current.origin) { const [a, b] = values; const factor = distance(a, b) / gestureRef.current.pinch; camera.zoom = clamp(gestureRef.current.origin.zoom * factor, .12, 3.5); } else if (values.length === 1 && gestureRef.current.start && gestureRef.current.origin && (event.pointerType === "touch" || event.buttons === 1)) { const dx = event.clientX - gestureRef.current.start.x; const dy = event.clientY - gestureRef.current.start.y; camera.x = gestureRef.current.origin.x - dx / camera.zoom; camera.y = gestureRef.current.origin.y - dy / camera.zoom; } }}
      onPointerUp={(event) => { const point = { x: event.clientX, y: event.clientY }; const start = gestureRef.current.start; const moved = start ? distance(start, point) : 99; pointers.current.delete(event.pointerId); if (moved < 8 && pointers.current.size === 0) { const worldPosition = worldPoint(event.clientX, event.clientY); if (tool === "inspect") onSelect(pick(worldPosition)); else onAction(tool, worldPosition); } if (pointers.current.size < 2) gestureRef.current.pinch = undefined; }}
      onPointerCancel={(event) => { pointers.current.delete(event.pointerId); }}
    />
  </div>;
}
