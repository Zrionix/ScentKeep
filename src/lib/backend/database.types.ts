// ---------------------------------------------------------------------------
// Generated from the live ScentKeep Postgres schema (project iqpknjohrjieepvzgqoz).
// Regenerate after any migration:
//   npx supabase gen types typescript --project-id iqpknjohrjieepvzgqoz > src/lib/backend/database.types.ts
// Kept hand-trimmed to the tables the client actually touches.
// ---------------------------------------------------------------------------

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; created_at: string; prefs: Json };
        Insert: { id: string; created_at?: string; prefs?: Json };
        Update: { id?: string; created_at?: string; prefs?: Json };
        Relationships: [];
      };
      fragrances: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          brand: string;
          photo_url: string | null;
          notes_top: string | null;
          notes_heart: string | null;
          notes_base: string | null;
          family: string | null;
          size_ml: number | null;
          price: number | null;
          currency: string;
          purchase_date: string | null;
          seasons: string[];
          occasions: string[];
          longevity: number;
          sillage: number;
          rating: number;
          in_wishlist: boolean;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          brand?: string;
          photo_url?: string | null;
          notes_top?: string | null;
          notes_heart?: string | null;
          notes_base?: string | null;
          family?: string | null;
          size_ml?: number | null;
          price?: number | null;
          currency?: string;
          purchase_date?: string | null;
          seasons?: string[];
          occasions?: string[];
          longevity?: number;
          sillage?: number;
          rating?: number;
          in_wishlist?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['fragrances']['Insert']>;
        Relationships: [];
      };
      sotd_entries: {
        Row: {
          id: string;
          user_id: string;
          fragrance_id: string;
          date: string;
          occasion: string | null;
          weather: string | null;
          mood: string | null;
          note: string | null;
          rating: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          fragrance_id: string;
          date: string;
          occasion?: string | null;
          weather?: string | null;
          mood?: string | null;
          note?: string | null;
          rating?: number;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['sotd_entries']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'sotd_entries_fragrance_fkey';
            columns: ['fragrance_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'fragrances';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
      settings: {
        Row: {
          user_id: string;
          reminder_enabled: boolean;
          reminder_time: string;
          rediscover_enabled: boolean;
          theme_preference: string;
          currency: string;
          favorite_families: string[];
          collection_size_band: string | null;
          onboarded_at: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          reminder_enabled?: boolean;
          reminder_time?: string;
          rediscover_enabled?: boolean;
          theme_preference?: string;
          currency?: string;
          favorite_families?: string[];
          collection_size_band?: string | null;
          onboarded_at?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['settings']['Insert']>;
        Relationships: [];
      };
      subscriptions: {
        Row: {
          user_id: string;
          entitlement: string;
          status: string;
          product_id: string | null;
          store: string | null;
          period_type: string | null;
          expires_at: string | null;
          last_event_id: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          entitlement?: string;
          status?: string;
          product_id?: string | null;
          store?: string | null;
          period_type?: string | null;
          expires_at?: string | null;
          last_event_id?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['subscriptions']['Insert']>;
        Relationships: [];
      };
      billing_events: {
        Row: {
          event_id: string;
          user_id: string | null;
          event_type: string | null;
          received_at: string;
          payload: Json | null;
        };
        Insert: {
          event_id: string;
          user_id?: string | null;
          event_type?: string | null;
          received_at?: string;
          payload?: Json | null;
        };
        Update: Partial<Database['public']['Tables']['billing_events']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}

type PublicTables = Database['public']['Tables'];

export type Tables<T extends keyof PublicTables> = PublicTables[T]['Row'];
export type TablesInsert<T extends keyof PublicTables> = PublicTables[T]['Insert'];
export type TablesUpdate<T extends keyof PublicTables> = PublicTables[T]['Update'];

export type FragranceRow = Tables<'fragrances'>;
export type SotdRow = Tables<'sotd_entries'>;
export type SettingsRow = Tables<'settings'>;
export type SubscriptionRow = Tables<'subscriptions'>;
