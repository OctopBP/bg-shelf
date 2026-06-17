import { bggHandlers } from "./bgg";
import { anthropicHandlers } from "./anthropic";
import { supabaseHandlers } from "./supabase";

export const handlers = [
  ...bggHandlers,
  ...anthropicHandlers,
  ...supabaseHandlers,
];
