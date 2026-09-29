import { useEffect, useRef, type RefObject } from "react";
import p5 from "p5";
import { beginCreatureDrag, createDeepSeaModel, deriveTossVelocity, moveDraggedCreature, releaseCreature, stepDeepSeaModel, stirWater, type DeepSeaModel, type PointerSample } from "./model";

export type TiltReading = { x: number; y: number; at: number };

export type DeepSeaProps = {
  seed: number;
  currentStrength: number;
  encounterDensity: number;
  texture: number;
  paused: boolean;
  tiltRef: RefObject<TiltReading>;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function quadraticSegment(p: p5, startX: number, startY: number, controlX: number, controlY: number, endX: number, endY: number) {
  const firstX = startX + (controlX - startX) * (2 / 3);
  const firstY = startY + (controlY - startY) * (2 / 3);
  const secondX = endX + (controlX - endX) * (2 / 3);
  const secondY = endY + (controlY - endY) * (2 / 3);
  p.bezierVertex(firstX, firstY, secondX, secondY, endX, endY);
}

export function DeepSeaSketch({ seed, currentStrength, encounterDensity, texture, paused, tiltRef }: DeepSeaProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const initialSeedRef = useRef(seed);
  const valuesRef = useRef({ seed, currentStrength, encounterDensity, texture, paused });
  useEffect(() => { valuesRef.current = { seed, currentStrength, encounterDensity, texture, paused }; }, [seed, currentStrength, encounterDensity, texture, paused]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const initialSeed = initialSeedRef.current;
    let model: DeepSeaModel = createDeepSeaModel(initialSeed);
    let previousSeed = initialSeed;
    let canvasElement: HTMLCanvasElement | null = null;
    let refreshStaticLayers = () => {};
    let tracePositions = new WeakMap<object, { x: number; y: number }>();
    let motionMarks: Array<{ x1: number; y1: number; x2: number; y2: number; born: number }> = [];
    let activePointer: number | null = null;
    let interactionUntil = 0;
    let dragHistory: PointerSample[] = [];
    const viewport = () => ({ width: Math.max(1, host.clientWidth), height: Math.max(1, host.clientHeight) });
    const pointerPosition = (event: PointerEvent) => {
      const rect = canvasElement!.getBoundingClientRect();
      return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
    };
    const pointerDown = (event: PointerEvent) => {
      if (!canvasElement || activePointer !== null) return;
      event.preventDefault();
      canvasElement.setPointerCapture(event.pointerId);
      activePointer = event.pointerId;
      const position = pointerPosition(event);
      dragHistory = [{ x: event.clientX, y: event.clientY, time: event.timeStamp }];
      beginCreatureDrag(model, position.x, position.y, viewport(), valuesRef.current.encounterDensity);
    };
    const pointerMove = (event: PointerEvent) => {
      if (activePointer !== event.pointerId) return;
      event.preventDefault();
      const position = pointerPosition(event);
      if (model.dragged) moveDraggedCreature(model, position.x, position.y);
      else stirWater(model, position.x, position.y, event.clientX - dragHistory[dragHistory.length - 1].x, event.clientY - dragHistory[dragHistory.length - 1].y, viewport(), valuesRef.current.encounterDensity);
      interactionUntil = performance.now() + 2200;
      dragHistory.push({ x: event.clientX, y: event.clientY, time: event.timeStamp });
      dragHistory = dragHistory.filter((sample) => event.timeStamp - sample.time < 100);
    };
    const pointerEnd = (event: PointerEvent) => {
      if (activePointer !== event.pointerId) return;
      const velocity = event.type === "pointercancel" ? { x: 0, y: 0 } : deriveTossVelocity(dragHistory, event.timeStamp);
      releaseCreature(model, velocity.x, velocity.y, viewport());
      interactionUntil = performance.now() + 9000;
      activePointer = null;
      dragHistory = [];
    };
    const instance = (p: p5) => {
      let tiltX = 0;
      let tiltY = 0;
      let rng = () => 0;
      let visualSeed = initialSeed >>> 0;
      const paperLayer = document.createElement("canvas");
      const grainLayer = document.createElement("canvas");
      let cachedTexture = -1;
      const resetArtRandom = () => {
        let state = visualSeed || 0x6d2b79f5;
        rng = () => {
          state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
          return (state >>> 0) / 0x1_0000_0000;
        };
      };
      const drawPencilLine = (x1: number, y1: number, x2: number, y2: number, color: string, weight: number, passes = 3) => {
        p.noFill(); p.stroke(color); p.strokeWeight(weight); p.strokeCap(p.ROUND);
        for (let i = 0; i < passes; i += 1) {
          const startNudge = (rng() - .5) * weight * 2.2;
          const endNudge = (rng() - .5) * weight * 2.8;
          const shorten = i === 0 && passes > 1 ? rng() * .12 : 0;
          const startX = x1 + (x2 - x1) * shorten;
          const startY = y1 + (y2 - y1) * shorten;
          p.line(startX + startNudge, startY - startNudge * .7, x2 - (x2 - x1) * shorten + endNudge, y2 + endNudge);
        }
      };
      const handContour = (
        points: Array<{ x: number; y: number }>,
        line: string,
        weight: number,
        closed = true,
        echo = true,
      ) => {
        const rough = points.map(({ x, y }) => ({
          x: x + (rng() - .5) * weight * 2.5,
          y: y + (rng() - .5) * weight * 2.5,
        }));
        p.stroke(line); p.strokeWeight(weight); p.strokeCap(p.ROUND); p.strokeJoin(p.ROUND); p.noFill();
        p.beginShape();
        if (closed && rough.length > 2) {
          [rough[rough.length - 1], ...rough, rough[0], rough[1]].forEach((point) => p.curveVertex(point.x, point.y));
          p.endShape(p.CLOSE);
        } else {
          if (rough.length > 0) p.curveVertex(rough[0].x, rough[0].y);
          rough.forEach((point) => p.curveVertex(point.x, point.y));
          if (rough.length > 0) p.curveVertex(rough[rough.length - 1].x, rough[rough.length - 1].y);
          p.endShape();
        }
        if (echo) {
          p.noFill(); p.stroke("rgba(61,48,59,0.3)"); p.strokeWeight(Math.max(.75, weight * .52));
          for (let index = 0; index + 1 < rough.length; index += 3) {
            p.line(rough[index].x + weight * .65, rough[index].y - weight * .35, rough[index + 1].x + weight * .65, rough[index + 1].y - weight * .35);
          }
        }
      };
      const scribble = (x: number, y: number, length: number, angle: number, color: string, weight: number, count: number) => {
        p.noFill(); p.stroke(color); p.strokeWeight(weight); p.strokeCap(p.ROUND);
        for (let pass = 0; pass < count; pass += 1) {
          const offset = (pass - count / 2) * weight * .72;
          const x1 = x + Math.cos(angle + Math.PI / 2) * offset;
          const y1 = y + Math.sin(angle + Math.PI / 2) * offset;
          const bend = (rng() - .5) * 12;
          p.beginShape(); p.vertex(x1, y1);
          quadraticSegment(p, x1, y1, x1 + Math.cos(angle) * length * .48 + bend, y1 + Math.sin(angle) * length * .48 - bend, x1 + Math.cos(angle) * length, y1 + Math.sin(angle) * length);
          p.endShape();
        }
      };
      const rebuildStaticLayers = (texture: number) => {
        const w = Math.max(1, Math.round(p.width));
        const h = Math.max(1, Math.round(p.height));
        const unit = Math.min(w, h);
        paperLayer.width = w; paperLayer.height = h;
        grainLayer.width = w; grainLayer.height = h;
        const paper = paperLayer.getContext("2d")!;
        const grain = grainLayer.getContext("2d")!;
        let state = (visualSeed ^ 0x4f3a20bf) || 1;
        const staticRandom = () => {
          state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
          return (state >>> 0) / 0x1_0000_0000;
        };
        paper.lineCap = "round";
        for (let fleck = 0; fleck < 180; fleck += 1) {
          const x = staticRandom() * w;
          const y = staticRandom() * h;
          const radiusX = unit * (.002 + staticRandom() * .006) / 2;
          const radiusY = unit * (.002 + staticRandom() * .004) / 2;
          paper.strokeStyle = fleck % 4 ? "rgba(133,105,91,0.10)" : "rgba(255,255,250,0.4)";
          paper.lineWidth = .7;
          paper.beginPath(); paper.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2); paper.stroke();
        }
        for (let i = 0; i < 31; i += 1) {
          const y = ((i * 67 + 20) % (h + 90)) - 35;
          const x = ((i * 113 + 17) % (w + 100)) - 40;
          const length = unit * (.12 + (i % 4) * .018);
          paper.strokeStyle = i % 3 ? "rgba(136,110,113,0.105)" : "rgba(113,94,109,0.12)";
          paper.lineWidth = 1.05;
          paper.beginPath();
          paper.moveTo(x, y); paper.lineTo(x + length, y - length * .19);
          paper.moveTo(x + 2, y + 2); paper.lineTo(x + length * .85, y - length * .16 + 2);
          paper.stroke();
        }
        paper.strokeStyle = "rgba(115,133,131,0.085)";
        paper.lineWidth = .75;
        paper.beginPath();
        for (let i = 0; i < 9; i += 1) {
          const y = h * (.22 + i * .075);
          paper.moveTo(w * .04, y - 3); paper.lineTo(w * .96, y + w * .018 - 3);
        }
        paper.stroke();
        const grainCount = Math.round(clamp(texture, 0, 2) * 1250);
        grain.lineCap = "round";
        grain.lineWidth = .7;
        for (let i = 0; i < grainCount; i += 1) {
          const x = staticRandom() * w; const y = staticRandom() * h;
          grain.strokeStyle = i % 3 ? "rgba(151,119,106,0.11)" : "rgba(111,139,132,0.1)";
          grain.beginPath(); grain.moveTo(x, y); grain.lineTo(x + 1 + staticRandom() * 3, y - .8 + staticRandom() * 1.6); grain.stroke();
        }
        cachedTexture = texture;
      };      refreshStaticLayers = () => rebuildStaticLayers(valuesRef.current.texture);

      p.setup = () => {
        const rect = host.getBoundingClientRect();
        const renderer = p.createCanvas(Math.max(1, rect.width), Math.max(1, rect.height));
        canvasElement = renderer.elt as HTMLCanvasElement;
        canvasElement.addEventListener("pointerdown", pointerDown);
        canvasElement.addEventListener("pointermove", pointerMove);
        canvasElement.addEventListener("pointerup", pointerEnd);
        canvasElement.addEventListener("pointercancel", pointerEnd);
        p.pixelDensity(1);
        p.frameRate(120);
        p.noiseSeed(initialSeed);
        rebuildStaticLayers(valuesRef.current.texture);
      };
      p.draw = () => {
        const settings = valuesRef.current;
        if (settings.seed !== previousSeed) { model = createDeepSeaModel(settings.seed); previousSeed = settings.seed; visualSeed = settings.seed >>> 0; p.noiseSeed(settings.seed); activePointer = null; dragHistory = []; cachedTexture = -1; tracePositions = new WeakMap(); motionMarks = []; }
        if (settings.texture !== cachedTexture) rebuildStaticLayers(settings.texture);
        // Pencil grain and contour wobble stay fixed between frames; only the creatures move.
        resetArtRandom();
        const w = p.width; const h = p.height; const unit = Math.min(w, h);
        const dt = Math.min(.04, p.deltaTime / 1000);
        const reading = tiltRef.current;
        const liveTilt = reading && Date.now() - reading.at < 1500 && !settings.paused;
        const blend = 1 - Math.exp(-dt / .55);
        tiltX += ((liveTilt ? reading.x : 0) - tiltX) * blend;
        tiltY += ((liveTilt ? reading.y : 0) - tiltY) * blend;
        const interactiveMotion = performance.now() < interactionUntil;
        stepDeepSeaModel(model, settings.paused && !interactiveMotion ? 0 : dt * .5, settings.currentStrength, settings.encounterDensity, { width: w, height: h }, { x: tiltX, y: tiltY });
        p.background(246, 239, 224);
        (p.drawingContext as CanvasRenderingContext2D).drawImage(paperLayer, 0, 0);
        const now = performance.now();
        const trace = (creature: object & { x: number; y: number }) => {
          const x = creature.x * w; const y = creature.y * h;
          const previous = tracePositions.get(creature);
          if (previous) {
            const distance = Math.hypot(x - previous.x, y - previous.y);
            if (distance > 2 && distance < 95) motionMarks.push({ x1: previous.x, y1: previous.y, x2: x, y2: y, born: now });
          }
          tracePositions.set(creature, { x, y });
        };
        trace(model.angler);
        model.jellies.slice(0, 5 + Math.round(settings.encounterDensity * 8)).forEach(trace);
        model.octopuses.slice(0, 18 + Math.round(settings.encounterDensity * 26)).forEach(trace);
        model.sharks.slice(0, 3 + Math.round(settings.encounterDensity * 4)).forEach(trace);
        model.prey.slice(0, Math.round(18 + settings.encounterDensity * 70)).filter((prey) => prey.alive).forEach(trace);
        model.squids.forEach(trace);
        motionMarks = motionMarks.filter((mark) => now - mark.born < 650).slice(-420);
        const markContext = p.drawingContext as CanvasRenderingContext2D;
        markContext.save(); markContext.lineCap = "round";
        for (const mark of motionMarks) {
          const fade = 1 - (now - mark.born) / 650;
          markContext.strokeStyle = `rgba(99,82,117,${fade * .105})`;
          markContext.lineWidth = 1.2;
          markContext.beginPath();
          markContext.moveTo(mark.x1, mark.y1);
          markContext.lineTo(mark.x2, mark.y2);
          markContext.stroke();
        }
        markContext.restore();

        // Detrital material settles and streams together; prey distributions cluster around these patches.
        model.detritus.forEach((patch, index) => {
          const x = patch.x * w; const y = patch.y * h;
          for (let j = 0; j < 9; j += 1) {
            const sway = Math.sin(model.time * .18 + j + index) * unit * .009;
            const px = x + sway + (j - 4) * unit * .008;
            const py = y + j * unit * .009;
            p.noFill(); p.stroke(j % 3 ? "rgba(93,133,120,0.48)" : "rgba(155,112,59,0.48)"); p.strokeWeight(.85);
            p.ellipse(px, py, unit * (.003 + j % 2 * .001), unit * (.005 + j % 3 * .001));
          }
          scribble(x, y, unit * .09, .18, "rgba(176,164,153,0.14)", 1, 2);
        });
        model.squids.forEach((squid) => {
          const x = squid.x * w; const y = squid.y * h; const s = squid.size * unit;
          const pulse = Math.sin(squid.phase * .48);
          const tint = squid.tint === 196 ? [139, 207, 238] : [194, 151, 226];
          const ink = (alpha: number) => `rgba(${tint[0]},${tint[1]},${tint[2]},${alpha})`;
          // A single diagonal squid crosses behind the scene, with its mantle, head, eyes, and trailing arms readable.
          p.push(); p.translate(x, y); p.rotate(-.48 + pulse * .025);
          handContour([{ x: -s * .32, y: -s * .92 }, { x: -s * .17, y: -s * 1.08 }, { x: s * .08, y: -s * 1.12 }, { x: s * .31, y: -s * .94 }, { x: s * .44, y: -s * .53 }, { x: s * .46, y: -s * .12 }, { x: s * .31, y: s * .3 }, { x: s * .12, y: s * .48 }, { x: -s * .08, y: s * .52 }, { x: -s * .27, y: s * .31 }, { x: -s * .43, y: -s * .14 }, { x: -s * .45, y: -s * .57 }], ink(.3), 1.8, true, true);
          // Two broken echoes keep the squid hand-drawn without mapping every surface.
          p.noFill(); p.stroke(ink(.2)); p.strokeWeight(1.1);
          p.arc(-s * .02, -s * .12, s * .62, s * 1.18, p.PI * 1.1, p.PI * 1.76);
          p.arc(s * .04, -s * .2, s * .75, s * 1.3, p.PI * 1.78, p.PI * 2.42);
          p.noFill(); p.stroke("rgba(142,99,101,0.52)"); p.strokeWeight(.9);
          for (let spot = 0; spot < 3; spot += 1) {
            const spotY = -s * .42 + spot * s * .27;
            const halfWidth = s * .16 * Math.sin((spot + 1) / 4 * Math.PI);
            p.ellipse(Math.sin(spot * 8.7 + squid.phase) * halfWidth, spotY, 1.7, 1.7);
          }
          // A small head beneath the mantle; its two cream eyes distinguish the animal at a glance.
          p.stroke(ink(.6)); p.strokeWeight(1.2); p.noFill(); p.ellipse(0, s * .42, s * .43, s * .39);
          p.stroke("rgba(85,76,77,0.76)"); p.ellipse(-s * .14, s * .36, s * .105, s * .12); p.ellipse(s * .14, s * .36, s * .105, s * .12);
          p.stroke("rgba(44,45,74,0.9)"); p.ellipse(-s * .14, s * .36, s * .044, s * .055); p.ellipse(s * .14, s * .36, s * .044, s * .055);
          p.noFill(); p.stroke(ink(.46)); p.strokeWeight(1.05);
          for (let arm = 0; arm < 6; arm += 1) {
            const startX = (arm - 2.5) * s * .11;
            const sway = Math.sin(squid.phase * .35 + arm * 1.4) * s * .09;
            const reach = s * (2.35 + (arm % 3) * .27);
            p.bezier(startX, s * .53, startX + sway, s * 1.13, startX - sway * .7, reach * .72, startX + sway, reach);
          }
          p.pop();
        });
        // Sparse marine snow shares the flow, with finer particles to preserve negative space.
        for (let i = 0; i < 42; i += 1) {
          const phase = model.time * (.04 + (i % 5) * .009) + i * 7.31;
          const x = ((i * 173 + Math.sin(phase) * 22 + w) % w);
          const y = ((i * 239 + phase * unit * .16 + h) % h);
          p.noFill(); p.stroke(i % 7 ? "rgba(91,102,109,0.54)" : "rgba(140,99,52,0.62)"); p.strokeWeight(.8);
          p.ellipse(x, y, i % 8 === 0 ? 2.1 : 1.2, i % 8 === 0 ? 2.1 : 1.2);
        }
        const jellyCount = 5 + Math.round(clamp(settings.encounterDensity, 0, 2) * 8);
        model.jellies.slice(0, jellyCount).forEach((jelly, index) => {
          const x = jelly.x * w; const y = jelly.y * h; const s = jelly.size * unit;
          const pulse = .9 + Math.max(0, Math.sin(jelly.phase)) * .16;
          const hueColor = jelly.hue === 315 ? [237, 117, 215] : jelly.hue === 48 ? [255, 202, 108] : jelly.hue === 198 ? [103, 222, 223] : [158, 142, 255];
          const color = (alpha: number) => `rgba(${hueColor[0]},${hueColor[1]},${hueColor[2]},${alpha})`;
          // The bell is pigment and outline; pulse changes its shape, not a light halo.
          handContour([
            { x: x - s, y }, { x: x - s * .91, y: y - s * .48 * pulse },
            { x: x - s * .65, y: y - s * .86 * pulse }, { x: x - s * .24, y: y - s * .94 * pulse },
            { x: x + s * .19, y: y - s * .82 * pulse }, { x: x + s * .73, y: y - s * .9 * pulse },
            { x: x + s, y }, { x: x + s * .69, y: y + s * .24 },
            { x: x + s * .26, y: y + s * .3 }, { x: x - s * .21, y: y + s * .23 },
            { x: x - s * .74, y: y + s * .31 },
          ], "rgba(110,82,105,0.52)", 1.35, true, index < 4);
          p.noFill(); p.stroke(color(.43)); p.strokeWeight(.85);
          p.arc(x, y, s * .58, s * .75, p.PI * 1.08, p.PI * 1.88);
          if (index < 2) {
            p.stroke("rgba(150,115,117,0.35)"); p.strokeWeight(.9);
            p.arc(x - s * .08, y - s * .24, s * .95, s * .67, p.PI * 1.08, p.PI * 1.7);
            p.line(x - s * .3, y - s * .37, x - s * .18, y - s * .17);
            p.line(x + s * .06, y - s * .42, x + s * .18, y - s * .21);
          }
          for (let tentacle = -2; tentacle <= 2; tentacle += 1) {
            const tx = x + tentacle * s * .33; const length = s * (1.5 + .45 * Math.sin(jelly.phase + tentacle));
            const lag = Math.sin(jelly.phase * .74 + tentacle * 1.7) * s * .22;
            p.stroke(color(.58)); p.strokeWeight(tentacle === 0 ? 1.1 : .75); p.noFill();
            p.beginShape(); p.vertex(tx, y + s * .17); p.vertex(tx + lag * .42, y + length * .34); p.vertex(tx - lag * .35, y + length * .7); p.vertex(tx + lag, y + length); p.endShape();
          }
          p.noFill(); p.stroke(color(.72)); p.strokeWeight(.9); p.ellipse(x, y - s * .16, s * .12, s * .12);
        });

        // Small dumbo-like octopuses drift between the larger forms, each with independently lagging arms.
        const octopusCount = 18 + Math.round(clamp(settings.encounterDensity, 0, 2) * 26);
        const sharkCount = 3 + Math.round(clamp(settings.encounterDensity, 0, 2) * 4);
        const preyCount = Math.round(18 + clamp(settings.encounterDensity, 0, 2) * 70);
        drawPrey(p, model.prey, preyCount, w, h, unit);
        model.octopuses.slice(0, octopusCount).forEach((octopus) => drawOctopus(p, octopus, w, h, unit));
        model.sharks.slice(0, sharkCount).forEach((shark) => drawShark(p, shark, w, h, unit));
        drawBabyWhale(p, model.whale, w, h, unit, scribble, drawPencilLine, handContour);

        drawAngler(p, model, w, h, unit, scribble, drawPencilLine, handContour);
        (p.drawingContext as CanvasRenderingContext2D).drawImage(grainLayer, 0, 0);
      };
      p.windowResized = () => {
        const rect = host.getBoundingClientRect(); p.resizeCanvas(Math.max(1, rect.width), Math.max(1, rect.height)); rebuildStaticLayers(valuesRef.current.texture); tracePositions = new WeakMap(); motionMarks = [];
      };
    };
    const sketch = new p5(instance, host);
    const observer = new ResizeObserver(() => {
      const rect = host.getBoundingClientRect();
      if (Math.abs(sketch.width - rect.width) < 1 && Math.abs(sketch.height - rect.height) < 1) return;
      sketch.resizeCanvas(Math.max(1, rect.width), Math.max(1, rect.height));
      refreshStaticLayers();
      tracePositions = new WeakMap(); motionMarks = [];
    });
    observer.observe(host);
    return () => {
      observer.disconnect();
      canvasElement?.removeEventListener("pointerdown", pointerDown);
      canvasElement?.removeEventListener("pointermove", pointerMove);
      canvasElement?.removeEventListener("pointerup", pointerEnd);
      canvasElement?.removeEventListener("pointercancel", pointerEnd);
      sketch.remove();
    };
  }, [tiltRef]);

  return <div ref={hostRef} className="deepsea-sketch" aria-label="A living deep sea ecology illustration" style={{ width: "100%", height: "100%", overflow: "hidden" }} />;
}

function drawAngler(
  p: p5,
  model: DeepSeaModel,
  w: number,
  h: number,
  unit: number,
  scribble: (x: number, y: number, length: number, angle: number, color: string, weight: number, count: number) => void,
  pencil: (x1: number, y1: number, x2: number, y2: number, color: string, weight: number, passes?: number) => void,
  handContour: (points: Array<{ x: number; y: number }>, line: string, weight: number, closed?: boolean, echo?: boolean) => void,
) {
  const fish = model.angler; const x = fish.x * w; const y = fish.y * h; const s = unit * .085;
  const breathe = 1 + Math.sin(fish.phase * .7) * .012;
  p.push(); p.translate(x, y); p.scale(fish.facing * breathe, breathe);
  // Tapered fins and tail create one readable silhouette before the interior pencil marks.
  handContour([{ x: -s * .65, y: -.08 * s }, { x: -s * 1.03, y: -s * .3 }, { x: -s * 1.55, y: -s * .7 }, { x: -s * 1.4, y: -s * .12 }, { x: -s * 1.35, y: s * .28 }, { x: -s * 1.65, y: s * .77 }, { x: -s * .54, y: s * .5 }], "rgba(121,102,186,0.82)", 1.8, true, true);
  handContour([{ x: -s * .28, y: -s * .42 }, { x: -s * .13, y: -s * .72 }, { x: s * .27, y: -s * .96 }, { x: s * .68, y: -s * .9 }, { x: s * 1.01, y: -s * .48 }, { x: s * 1.28, y: -s * .23 }, { x: s * 1.45, y: s * .08 }, { x: s * 1.13, y: s * .41 }, { x: s * .76, y: s * .54 }, { x: s * .42, y: s * .76 }, { x: -s * .1, y: s * .58 }, { x: -s * .63, y: s * .27 }], "rgba(121,102,186,0.92)", 2, true, true);
  // Lower jaw and tooth comb remain visible in the small mobile composition.
  handContour([{ x: s * .55, y: s * .26 }, { x: s * .84, y: s * .48 }, { x: s * 1.08, y: s * .54 }, { x: s * 1.3, y: s * .27 }, { x: s * 1.05, y: s * .1 }], "rgba(146,115,191,0.75)", 1.4, true, false);
  p.stroke("rgba(196,174,231,0.9)"); p.strokeWeight(1.25);
  for (let tooth = 0; tooth < 4; tooth += 1) { const tx = s * (.68 + tooth * .16); p.line(tx, s * .23, tx - s * .04, s * (.34 + (tooth % 2) * .04)); }
  // Head and flank hatching: repeated imperfect strokes make the creature read as colored pencil.
  for (let hatch = 0; hatch < 4; hatch += 1) {
    const hx = -s * .44 + hatch * s * .2;
    pencil(hx, -s * .35, hx + s * .11, s * .13, hatch % 2 ? "rgba(165,119,220,0.48)" : "rgba(243,144,197,0.34)", 1, 2);
  }
  for (let fin = 0; fin < 3; fin += 1) pencil(-s * (.6 + fin * .18), s * .25, -s * (.85 + fin * .18), s * (.55 + fin * .04), "rgba(134,193,208,0.48)", 1.1, 2);
  p.noFill(); p.stroke("rgba(237,163,205,0.72)"); p.strokeWeight(1.2); p.arc(s * .36, -s * .14, s * 1.12, s * .62, p.PI * 1.08, p.PI * 1.84);
  p.noFill(); p.stroke("rgba(91,67,65,0.95)"); p.strokeWeight(1.25); p.ellipse(s * .73, -s * .19, s * .095, s * .095);
  p.stroke("rgba(13,10,34,0.95)"); p.ellipse(s * .75, -s * .19, s * .04, s * .06);
  p.pop();

  // The arched lure sways with a slow lag; its point light is the main luminous cue.
  const lureX = x + fish.facing * s * .28; const lureY = y - s * .4;
  const sway = Math.sin(fish.phase * .54) * s * .2;
  const tipX = x + fish.facing * s * .05 + sway;
  const tipY = y - s * 1.64 + Math.sin(fish.phase * .36) * s * .09;
  p.noFill(); p.stroke("rgba(197,162,216,0.92)"); p.strokeWeight(2.1);
  p.bezier(lureX, lureY, lureX + fish.facing * s * .08, y - s * 1.06, tipX - fish.facing * s * .42, tipY - s * .1, tipX, tipY);
  const glow = fish.resting > 0 ? .62 : .88;
  // The lure is a small point of light, without a surrounding halo.
  p.noFill(); p.stroke(`rgba(145,100,46,${glow})`); p.strokeWeight(1.1); p.ellipse(tipX, tipY, s * .105, s * .14);
  p.stroke("rgba(117,83,57,0.9)"); p.strokeWeight(.8); p.ellipse(tipX - 1, tipY - 1, s * .035, s * .045);
  scribble(x - s * .7, y + s * .45, s * .25, .52, "rgba(94,197,194,0.28)", 1, 2);
}

function drawPrey(p: p5, prey: DeepSeaModel["prey"], count: number, w: number, h: number, unit: number) {
  const context = p.drawingContext as CanvasRenderingContext2D;
  for (let index = 0; index < count; index += 1) {
    const particle = prey[index];
    if (!particle?.alive) continue;
    const s = particle.size * unit / 390;
    const alpha = .34 + particle.depth * .48;
    context.save();
    context.translate(particle.x * w, particle.y * h);
    context.rotate(Math.sin(particle.phase * .22) * .28);
    context.lineCap = "round";
    context.lineWidth = .85;
    context.strokeStyle = `rgba(${particle.kind === "fish" ? "127,79,78" : "75,111,100"},${alpha})`;
    context.beginPath();
    context.ellipse(0, 0, s, s * .675, 0, 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = `rgba(70,59,63,${alpha * .72})`;
    context.beginPath();
    if (particle.kind === "fish") {
      context.moveTo(-s * .72, 0); context.lineTo(-s * 1.65, -s * .48);
      context.moveTo(-s * .72, 0); context.lineTo(-s * 1.65, s * .48);
    } else {
      context.moveTo(s * .45, -s * .25);
      context.bezierCurveTo(s * .8, -s * .9, s * 1.15, -s * .85, s * 1.5, -s * .6);
      context.moveTo(-s * .65, s * .12); context.lineTo(-s * 1.35, s * .52);
    }
    context.stroke();
    if (particle.kind === "fish" && index % 4 === 0) {
      context.strokeStyle = `rgba(47,41,48,${alpha})`;
      context.beginPath(); context.ellipse(s * .58, -s * .1, .575, .575, 0, 0, Math.PI * 2); context.stroke();
    }
    context.restore();
  }
}

function drawOctopus(p: p5, octopus: DeepSeaModel["octopuses"][number], w: number, h: number, unit: number) {
  const x = octopus.x * w;
  const y = octopus.y * h;
  const s = octopus.size * unit;
  const phase = octopus.phase;
  const clarity = .58 + octopus.depth * .42;
  const palette = octopus.tint === 306 ? [242, 132, 218] : octopus.tint === 48 ? [244, 193, 124] : octopus.tint === 200 ? [119, 217, 218] : [183, 155, 248];
  const ink = (alpha: number) => `rgba(${palette[0]},${palette[1]},${palette[2]},${alpha * clarity})`;
  const context = p.drawingContext as CanvasRenderingContext2D;
  context.save();
  context.translate(x, y);
  context.lineCap = "round";
  context.lineJoin = "round";

  // A few continuous pencil paths keep each little body readable at crowd scale.
  context.strokeStyle = ink(.82);
  context.lineWidth = 1.15;
  context.beginPath();
  context.moveTo(-s * .62, -s * .03);
  context.bezierCurveTo(-s * .85, -s * .65, -s * .18, -s * .88, s * .22, -s * .72);
  context.bezierCurveTo(s * .78, -s * .59, s * .75, -s * .02, s * .03, s * .35);
  context.quadraticCurveTo(-s * .48, s * .26, -s * .62, -s * .03);
  context.stroke();

  context.strokeStyle = ink(.68);
  context.lineWidth = .9;
  const leftLift = Math.sin(phase) * s * .1;
  const rightLift = Math.sin(phase + 1) * s * .1;
  context.beginPath();
  context.moveTo(-s * .52, -s * .32);
  context.quadraticCurveTo(-s * 1.42, -s * .95 + leftLift, -s * 1.38, -s * .7 + leftLift);
  context.quadraticCurveTo(-s * 1.15, -s * .05, -s * .55, s * .03);
  context.moveTo(s * .52, -s * .32);
  context.quadraticCurveTo(s * 1.43, -s * .72 + rightLift, s * 1.35, -s * .35 + rightLift);
  context.quadraticCurveTo(s * 1.15, s * .05, s * .55, s * .03);
  context.stroke();

  context.strokeStyle = ink(.83);
  context.lineWidth = .8;
  context.beginPath();
  for (let arm = 0; arm < 8; arm += 1) {
    const side = arm < 4 ? -1 : 1;
    const lane = arm % 4;
    const startX = (lane - 1.5) * s * .23;
    const length = s * (.52 + lane * .11);
    const curl = Math.sin(phase * .8 + arm * 1.4) * s * .22;
    const endX = startX + side * (s * .12 + Math.abs(lane - 1.5) * s * .12) + curl;
    context.moveTo(startX, s * .18);
    context.bezierCurveTo(startX + curl * .35, length * .43, endX - curl * .4, length - s * .08, endX + curl, length);
  }
  context.stroke();

  context.strokeStyle = "rgba(71,52,70,0.8)";
  context.lineWidth = .9;
  context.beginPath();
  context.ellipse(-s * .2, -s * .13, s * .075, s * .075, 0, 0, Math.PI * 2);
  context.ellipse(s * .2, -s * .13, s * .075, s * .075, 0, 0, Math.PI * 2);
  context.stroke();
  context.strokeStyle = "rgba(34,20,56,0.95)";
  context.beginPath();
  context.ellipse(-s * .2, -s * .13, s * .035, s * .043, 0, 0, Math.PI * 2);
  context.ellipse(s * .2, -s * .13, s * .035, s * .043, 0, 0, Math.PI * 2);
  context.stroke();
  context.strokeStyle = "rgba(255,235,224,0.42)";
  context.beginPath();
  context.ellipse(-s * .04, -s * .24, s * .38, s * .215, 0, Math.PI * 1.08, Math.PI * 1.8);
  context.stroke();
  if (octopus.depth > .78) {
    context.strokeStyle = ink(.58);
    context.beginPath();
    for (let hatch = 0; hatch < 2; hatch += 1) {
      context.moveTo(-s * .14 + hatch * s * .25, -s * .06);
      context.lineTo(-s * .06 + hatch * s * .25, s * .1);
    }
    context.stroke();
  }
  context.restore();
}
function drawBabyWhale(
  p: p5,
  whale: DeepSeaModel["whale"],
  w: number,
  h: number,
  unit: number,
  scribble: (x: number, y: number, length: number, angle: number, color: string, weight: number, count: number) => void,
  pencil: (x1: number, y1: number, x2: number, y2: number, color: string, weight: number, passes?: number) => void,
  handContour: (points: Array<{ x: number; y: number }>, line: string, weight: number, closed?: boolean, echo?: boolean) => void,
) {
  const x = whale.x * w; const y = whale.y * h; const s = whale.size * unit;
  const bob = Math.sin(whale.phase * .7) * s * .018;
  // Warm loose marks around the whale suggest a little dusky reflected light.
  scribble(x - s * 1.45, y + s * .35 + bob, s * 1.0, .08, "rgba(111,206,219,0.18)", 1.3, 2);
  scribble(x + s * 1.0, y - s * .56 + bob, s * .74, .03, "rgba(240,157,191,0.16)", 1.1, 2);

  p.push(); p.translate(x, y + bob); p.scale(1 + Math.sin(whale.phase * .7) * .008, 1);
  // Tail sits left; broad forehead and short snout make the juvenile whale friendly and unmistakable.
  handContour([
    { x: -s * 1.13, y: -s * .13 }, { x: -s * 1.02, y: -s * .53 },
    { x: -s * .78, y: -s * .86 }, { x: -s * .38, y: -s * .98 },
    { x: s * .12, y: -s * .89 }, { x: s * .46, y: -s * .77 },
    { x: s * .78, y: -s * .62 }, { x: s * 1.04, y: -s * .42 },
    { x: s * 1.37, y: -s * .31 }, { x: s * 1.68, y: -s * .14 },
    { x: s * 1.62, y: s * .07 }, { x: s * 1.35, y: s * .2 },
    { x: s * .94, y: s * .24 }, { x: s * .57, y: s * .34 },
    { x: s * .24, y: s * .52 }, { x: -s * .18, y: s * .63 },
    { x: -s * .68, y: s * .51 }, { x: -s * 1.02, y: s * .23 },
  ], "rgba(77,91,158,0.96)", 2.7, true, true);
  // Cream belly patch, tail flukes, and fins use separate shapes so the contour reads at phone size.
  handContour([{ x: -s * .78, y: s * .29 }, { x: -s * .42, y: s * .42 }, { x: -s * .08, y: s * .44 }, { x: s * .28, y: s * .33 }, { x: s * .72, y: s * .22 }, { x: s * .42, y: s * .45 }, { x: s * .02, y: s * .65 }, { x: -s * .4, y: s * .61 }], "rgba(173,176,210,0.72)", 1.35, true, false);
  handContour([{ x: -s * 1.1, y: -s * .08 }, { x: -s * 1.37, y: -s * .31 }, { x: -s * 1.62, y: -s * .51 }, { x: -s * 1.85, y: -s * .42 }, { x: -s * 1.7, y: -s * .16 }, { x: -s * 1.8, y: s * .02 }, { x: -s * 1.57, y: s * .17 }, { x: -s * 1.1, y: s * .2 }], "rgba(77,91,158,0.94)", 2, true, false);
  handContour([{ x: s * .05, y: s * .29 }, { x: -s * .2, y: s * .55 }, { x: -s * .44, y: s * .75 }, { x: -s * .68, y: s * .75 }, { x: -s * .76, y: s * .61 }, { x: -s * .39, y: s * .54 }, { x: -s * .13, y: s * .39 }], "rgba(77,91,158,0.85)", 1.6, true, false);
  p.noFill(); p.stroke("rgba(77,91,158,0.84)"); p.strokeWeight(1.2); p.beginShape(); p.vertex(s * .46, -s * .72); quadraticSegment(p, s * .46, -s * .72, s * .55, -s * .99, s * .83, -s * .81); quadraticSegment(p, s * .83, -s * .81, s * .65, -s * .75, s * .46, -s * .72); p.endShape(p.CLOSE);
  // Rose cheeks and soft snout dots, then a big friendly eye and curved smile.
  p.noFill(); p.stroke("rgba(180,103,123,0.72)"); p.strokeWeight(1); p.ellipse(s * .99, -s * .18, s * .24, s * .14);
  p.stroke("rgba(180,103,123,0.85)"); p.ellipse(s * .96, -s * .31, s * .035, s * .035); p.ellipse(s * 1.14, -s * .26, s * .03, s * .03);
  p.stroke("rgba(64,49,69,0.88)"); p.strokeWeight(1.4); p.ellipse(s * .78, -s * .42, s * .25, s * .28);
  p.stroke("rgba(47,47,80,1)"); p.ellipse(s * .81, -s * .42, s * .105, s * .14);
  p.stroke("rgba(255,255,242,0.9)"); p.strokeWeight(.8); p.ellipse(s * .83, -s * .46, s * .036, s * .04);
  p.noFill(); p.stroke("rgba(180,190,224,0.64)"); p.strokeWeight(1.6);
  p.line(s * .34, -s * .76, s * .48, -s * .62); p.line(s * .48, -s * .76, s * .34, -s * .62);
  p.noFill(); p.stroke("rgba(69,67,111,0.95)"); p.strokeWeight(2); p.arc(s * 1.21, -s * .02, s * .25, s * .19, .12, p.PI * .76);
  // Fine broken contours and blue/rose pencil hatch keep the pale fill tactile.
  for (let stroke = 0; stroke < 4; stroke += 1) {
    const hx = -s * .42 + stroke * s * .19;
    const hue = stroke % 2 === 0 ? "rgba(235,157,180,0.32)" : "rgba(154,172,218,0.48)";
    pencil(hx, -s * (.58 - (stroke % 2) * .06), hx + s * .1, -s * .32, hue, 1.25, 2);
  }
  pencil(-s * .29, s * .47, -s * .1, s * .31, "rgba(205,184,205,0.45)", 1.2, 2);
  for (let dash = 0; dash < 3; dash += 1) pencil(s * (.22 + dash * .17), s * (.18 - dash * .025), s * (.31 + dash * .17), s * (.24 - dash * .025), "rgba(235,141,169,0.35)", .9, 2);
  p.pop();

  // A little stern pole carries a flag bearing the baby's straw hat emblem.
  const poleX = x - s * .28; const poleY = y - s * .78 + bob;
  p.stroke("rgba(91,69,105,0.92)"); p.strokeWeight(1.8); p.line(poleX, poleY, poleX - s * .02, poleY - s * .56);
  p.stroke("rgba(255,221,151,0.88)"); p.strokeWeight(.9); p.noFill(); p.line(poleX + 1, poleY - s * .49, poleX + s * .78, poleY - s * .39);
  p.noFill(); p.stroke("rgba(54,43,62,0.94)"); p.strokeWeight(1.4);
  p.beginShape(); p.vertex(poleX + 1, poleY - s * .49); p.vertex(poleX + s * .78, poleY - s * .4); p.vertex(poleX + s * .62, poleY - s * .16); p.vertex(poleX + 1, poleY - s * .22); p.endShape(p.CLOSE);
  p.stroke("rgba(99,74,79,0.82)"); p.strokeWeight(.8); p.line(poleX + s * .17, poleY - s * .24, poleX + s * .48, poleY - s * .32); p.line(poleX + s * .17, poleY - s * .32, poleX + s * .48, poleY - s * .24);
  p.noFill(); p.stroke("rgba(54,43,62,0.94)"); p.ellipse(poleX + s * .35, poleY - s * .28, s * .15, s * .16);
  p.ellipse(poleX + s * .33, poleY - s * .29, s * .022, s * .026); p.ellipse(poleX + s * .38, poleY - s * .29, s * .022, s * .026);
  p.stroke("rgba(145,105,47,0.96)"); p.strokeWeight(1.1); p.arc(poleX + s * .35, poleY - s * .36, s * .29, s * .13, p.PI, p.TWO_PI);
  p.line(poleX + s * .24, poleY - s * .37, poleX + s * .46, poleY - s * .37);
  p.stroke("rgba(177,65,77,0.96)"); p.line(poleX + s * .245, poleY - s * .34, poleX + s * .45, poleY - s * .34);
}

function drawShark(p: p5, shark: DeepSeaModel["sharks"][number], w: number, h: number, unit: number) {
  const x = shark.x * w; const y = shark.y * h; const s = shark.size * unit;
  p.push(); p.translate(x, y); p.scale(shark.facing, 1);
  p.noFill(); p.stroke("rgba(92,111,132,0.82)"); p.strokeWeight(1.25);
  p.beginShape(); p.vertex(-s * .72, 0); p.vertex(-s * 1.14, -s * .31); p.vertex(-s * 1.08, s * .26); p.vertex(-s * .7, s * .16);
  p.bezierVertex(-s * .53, -s * .27, s * .42, -s * .29, s * .75, -s * .06); p.vertex(s * 1.13, -s * .12); p.vertex(s * .87, s * .06); p.bezierVertex(s * .5, s * .3, -s * .35, s * .29, -s * .72, 0); p.endShape(p.CLOSE);
  p.noFill(); p.stroke("rgba(114,119,121,0.62)"); p.strokeWeight(.8); p.beginShape(); p.vertex(-s * .45, s * .1); p.bezierVertex(-s * .05, s * .28, s * .43, s * .22, s * .76, s * .08); p.bezierVertex(s * .34, s * .34, -s * .2, s * .31, -s * .45, s * .1); p.endShape(p.CLOSE);
  p.noFill(); p.stroke("rgba(215,219,210,0.62)"); p.strokeWeight(.8);
  for (let gill = 0; gill < 3; gill += 1) p.arc(s * (.17 + gill * .085), .015, s * .12, s * .23, p.PI * .35, p.PI * .86);
  p.noFill(); p.stroke("rgba(92,111,132,0.82)"); p.beginShape(); p.vertex(-s * .16, -s * .2); p.vertex(s * .03, -s * .62); p.vertex(s * .29, -s * .16); p.endShape(p.CLOSE);
  p.beginShape(); p.vertex(-s * .38, s * .15); p.vertex(-s * .08, s * .51); p.vertex(s * .2, s * .18); p.endShape(p.CLOSE);
  p.stroke("rgba(67,88,124,0.74)"); p.strokeWeight(.9); p.line(s * .41, -s * .03, s * .5, s * .08);
  p.noFill(); p.stroke("rgba(65,56,58,0.9)"); p.ellipse(s * .48, -s * .12, s * .12, s * .12);
  p.ellipse(s * .5, -s * .12, s * .058, s * .065);
  p.pop();
}
