import type { Genome, Species } from "./types";

/** Stable, genotype-only appearance. Small genetic changes should be visually legible. */
export function organismAppearance(genome: Genome, species: Species) {
  const hue = ((genome.hue % 360) + 360) % 360;
  const saturation = Math.round(52 + genome.vision * 12);
  const lightness = species === "predator" ? 43 : 48;
  return {
    fill: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
    edge: `hsl(${(hue + 30) % 360}, ${Math.min(90, saturation + 18)}%, ${Math.min(80, lightness + 18)}%)`,
    pattern: Math.abs(Math.floor(genome.pattern * 1000)) % 3,
    size: Math.max(3, 4 + genome.size * 5),
    eye: species === "predator" ? "#f8e8bd" : "#fff7e4",
  };
}
