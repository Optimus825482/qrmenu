import { z } from "zod";
const item = z.object({ token: z.string().min(1).max(64), menuNodeId: z.string().min(1) });
export const targetSchema = z.object({
  baseUrl: z.url(),
  tables: z.array(item.extend({ outletId: z.string().min(1) }).strict()).min(1),
  rooms: z.array(item.strict()).min(1),
  staff: z.array(z.object({ username: z.string().startsWith("yuk."), role: z.string().min(1), outletId: z.string().optional(), outletName: z.string().optional() }).strict()).min(1),
}).strict();
export type Targets = z.infer<typeof targetSchema>;
