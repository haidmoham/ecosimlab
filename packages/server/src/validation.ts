import { z } from "zod";
import type { ClientMessage } from "@ecosystem/protocol";

const coordinate = z.number().finite();
export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hello"), protocolVersion: z.number().int() }),
  z.object({ type: z.literal("set-running"), running: z.boolean() }),
  z.object({ type: z.literal("set-speed"), speed: z.union([z.literal(1), z.literal(10)]) }),
  z.object({ type: z.literal("spawn-food"), x: coordinate, y: coordinate, amount: z.number().finite().positive().max(100).optional() }),
  z.object({ type: z.literal("spawn-organism"), x: coordinate, y: coordinate, species: z.union([z.literal("herbivore"), z.literal("predator")]) }),
  z.object({ type: z.literal("select-organism"), organismId: z.number().int().positive().nullable() }),
  z.object({ type: z.literal("request-reset"), confirmed: z.boolean() }),
]);

export function parseClientMessage(value: unknown): ClientMessage | null {
  const result = clientMessageSchema.safeParse(value);
  return result.success ? result.data : null;
}
