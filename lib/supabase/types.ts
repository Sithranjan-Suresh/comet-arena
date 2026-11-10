import type { Database } from "./database.types";

export type Tables = Database["public"]["Tables"];
export type Row<T extends keyof Tables> = Tables[T]["Row"];
export type InsertRow<T extends keyof Tables> = Tables[T]["Insert"];
export type UpdateRow<T extends keyof Tables> = Tables[T]["Update"];
export type CompetitionCardRow = Database["public"]["Views"]["competition_cards"]["Row"];
