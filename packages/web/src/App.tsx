import { useEffect, useRef, useState } from "react";
import { DeepSeaSketch, type TiltReading } from "./deepsea";
import "./styles.css";

const presentation = { currentStrength: 0.45, encounterDensity: 2, texture: 0.5 };

const wrapDegrees = (angle: number) => ((angle + 180) % 360 + 360) % 360 - 180;
const tiltAxis = (angle: number) => {
  const magnitude = Math.max(0, Math.abs(angle) - 2);
  return Math.sign(angle) * Math.min(1, magnitude / 18);
};

export default function App() {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 0x7fffffff));
  const [paused, setPaused] = useState(false);
  const tiltRef = useRef<TiltReading>({ x: 0, y: 0, at: 0 });
  const neutralRef = useRef<{ beta: number; gamma: number } | null>(null);
  const motionListenerRef = useRef<((event: DeviceOrientationEvent) => void) | null>(null);
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [motionUnavailable, setMotionUnavailable] = useState(false);
  const motionPossible = typeof window !== "undefined" && window.isSecureContext && "DeviceOrientationEvent" in window && window.matchMedia("(pointer: coarse)").matches;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setPaused(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const recalibrate = () => { neutralRef.current = null; };
    window.addEventListener("orientationchange", recalibrate);
    return () => {
      window.removeEventListener("orientationchange", recalibrate);
      if (motionListenerRef.current) window.removeEventListener("deviceorientation", motionListenerRef.current);
    };
  }, []);

  const toggleMotion = async () => {
    if (motionEnabled) {
      if (motionListenerRef.current) window.removeEventListener("deviceorientation", motionListenerRef.current);
      motionListenerRef.current = null;
      tiltRef.current = { x: 0, y: 0, at: 0 };
      neutralRef.current = null;
      setMotionEnabled(false);
      return;
    }
    if (!motionPossible) return;
    const orientationApi = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & { requestPermission?: () => Promise<"granted" | "denied"> };
    // On iPhone the permission call must begin during this exact tap handler.
    const permission = orientationApi.requestPermission ? orientationApi.requestPermission() : Promise.resolve("granted");
    try {
      if (await permission !== "granted") { setMotionUnavailable(true); return; }
    } catch { setMotionUnavailable(true); return; }
    const listener = (event: DeviceOrientationEvent) => {
      if (event.beta === null || event.gamma === null || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
      if (!neutralRef.current) neutralRef.current = { beta: event.beta, gamma: event.gamma };
      const sideways = wrapDegrees(event.gamma - neutralRef.current.gamma);
      const forward = wrapDegrees(event.beta - neutralRef.current.beta);
      const angle = (window.screen.orientation?.angle ?? 0) * Math.PI / 180;
      const x = sideways * Math.cos(angle) - forward * Math.sin(angle);
      const y = sideways * Math.sin(angle) + forward * Math.cos(angle);
      tiltRef.current = { x: tiltAxis(x), y: tiltAxis(y), at: Date.now() };
    };
    motionListenerRef.current = listener;
    neutralRef.current = null;
    window.addEventListener("deviceorientation", listener);
    setMotionUnavailable(false);
    setMotionEnabled(true);
  };

  return <main className="aquarium" aria-label="laboon's club, a living deep-sea drawing">
    <DeepSeaSketch seed={seed} currentStrength={presentation.currentStrength} encounterDensity={presentation.encounterDensity} texture={presentation.texture} paused={paused} tiltRef={tiltRef} />
    <div className="aquarium-vignette" aria-hidden="true" />
    <div className="aquarium-controls" aria-label="aquarium controls">
      <button type="button" aria-label="begin a new tide" onClick={() => setSeed(Math.floor(Math.random() * 0x7fffffff))}>✳</button>
      <button type="button" aria-label={paused ? "resume animation" : "pause animation"} onClick={() => setPaused((value) => !value)}>{paused ? "▶" : "Ⅱ"}</button>
      {motionPossible && <button type="button" aria-label={motionEnabled ? "turn off tilt steering" : motionUnavailable ? "tilt steering unavailable; tap to retry" : "enable tilt steering"} aria-pressed={motionEnabled} onClick={toggleMotion}>◌</button>}
    </div>
  </main>;
}
