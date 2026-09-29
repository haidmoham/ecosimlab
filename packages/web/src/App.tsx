import { useEffect, useState } from "react";
import { DeepSeaSketch } from "./deepsea";
import "./styles.css";

const defaults = { currentStrength: 0.55, encounterDensity: 0.5, texture: 0.72 };

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="tune-row">
    <span>{label}</span>
    <input type="range" min="0" max="1" step="0.01" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    <output>{Math.round(value * 100)}%</output>
  </label>;
}

export default function App() {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 0x7fffffff));
  const [paused, setPaused] = useState(false);
  const [tuneOpen, setTuneOpen] = useState(false);
  const [currentStrength, setCurrentStrength] = useState(defaults.currentStrength);
  const [encounterDensity, setEncounterDensity] = useState(defaults.encounterDensity);
  const [texture, setTexture] = useState(defaults.texture);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setPaused(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const reset = () => {
    setCurrentStrength(defaults.currentStrength);
    setEncounterDensity(defaults.encounterDensity);
    setTexture(defaults.texture);
  };

  return <main className="aquarium" aria-label="laboon's club, a living deep-sea drawing">
    <DeepSeaSketch seed={seed} currentStrength={currentStrength} encounterDensity={encounterDensity} texture={texture} paused={paused} />
    <div className="aquarium-vignette" aria-hidden="true" />
    <div className="aquarium-controls" aria-label="aquarium controls">
      <button type="button" aria-label="begin a new tide" onClick={() => setSeed(Math.floor(Math.random() * 0x7fffffff))}>✳</button>
      <button type="button" aria-label={paused ? "resume animation" : "pause animation"} onClick={() => setPaused((value) => !value)}>{paused ? "▶" : "Ⅱ"}</button>
      <button type="button" aria-label="tune the aquarium" aria-expanded={tuneOpen} aria-controls="tune-panel" onClick={() => setTuneOpen((value) => !value)}>≋</button>
    </div>
    {tuneOpen && <section className="tune-panel" id="tune-panel" aria-label="tune the aquarium">
      <div className="tune-panel-top"><span>tune</span><button type="button" aria-label="close tuning controls" onClick={() => setTuneOpen(false)}>×</button></div>
      <Slider label="current" value={currentStrength} onChange={setCurrentStrength} />
      <Slider label="encounters" value={encounterDensity} onChange={setEncounterDensity} />
      <Slider label="pencil" value={texture} onChange={setTexture} />
      <button type="button" className="reset-tune" onClick={reset}>reset</button>
    </section>}
  </main>;
}
