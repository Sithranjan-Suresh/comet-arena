import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { SubscribeStore, SubscriberRow } from "./subscribe";

const COLS = "email,confirm_token,confirmed_at,confirmation_sent_at";

export function supabaseSubscribeStore(db: SupabaseClient<Database>): SubscribeStore {
  return {
    async get(email) {
      const { data, error } = await db
        .from("email_subscribers")
        .select(COLS)
        .eq("email", email)
        .maybeSingle();
      if (error) throw error;
      return data as SubscriberRow | null;
    },
    async create(email, source) {
      const { data, error } = await db
        .from("email_subscribers")
        .insert({ email, source })
        .select(COLS)
        .single();
      if (error) throw error;
      return data as SubscriberRow;
    },
    async markConfirmationSent(email, at) {
      const { error } = await db
        .from("email_subscribers")
        .update({ confirmation_sent_at: at.toISOString() })
        .eq("email", email);
      if (error) throw error;
    },
    async confirmByToken(token, at) {
      const { data, error } = await db
        .from("email_subscribers")
        .update({ confirmed_at: at.toISOString() })
        .eq("confirm_token", token)
        .is("confirmed_at", null)
        .select("email");
      if (error) throw error;
      if ((data ?? []).length > 0) return true;
      // Already confirmed earlier (double click): still a success for the person.
      const { data: existing } = await db
        .from("email_subscribers")
        .select("email")
        .eq("confirm_token", token)
        .not("confirmed_at", "is", null)
        .maybeSingle();
      return !!existing;
    },
  };
}
