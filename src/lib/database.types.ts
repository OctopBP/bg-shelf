export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      collection_items: {
        Row: {
          added_at: string
          added_by: string | null
          collection_id: string
          game_id: number
          id: string
          notes: string | null
          tags: string[]
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          collection_id: string
          game_id: number
          id?: string
          notes?: string | null
          tags?: string[]
        }
        Update: {
          added_at?: string
          added_by?: string | null
          collection_id?: string
          game_id?: number
          id?: string
          notes?: string | null
          tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "collection_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_items_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_members: {
        Row: {
          added_at: string
          collection_id: string
          role: string
          user_id: string
        }
        Insert: {
          added_at?: string
          collection_id: string
          role: string
          user_id: string
        }
        Update: {
          added_at?: string
          collection_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_members_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          owner_id: string
          visibility: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          owner_id: string
          visibility?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          owner_id?: string
          visibility?: string
        }
        Relationships: []
      }
      contributor_external_ids: {
        Row: {
          contributor_id: number
          external_id: string
          source: string
          url: string | null
        }
        Insert: {
          contributor_id: number
          external_id: string
          source: string
          url?: string | null
        }
        Update: {
          contributor_id?: number
          external_id?: string
          source?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contributor_external_ids_contributor_id_fkey"
            columns: ["contributor_id"]
            isOneToOne: false
            referencedRelation: "contributors"
            referencedColumns: ["id"]
          },
        ]
      }
      contributors: {
        Row: {
          id: number
          name: string
        }
        Insert: {
          id?: never
          name: string
        }
        Update: {
          id?: never
          name?: string
        }
        Relationships: []
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: string
          updated_at: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      game_bgg_stats: {
        Row: {
          average: number | null
          bayes_average: number | null
          best_players: string | null
          game_id: number
          rank: number | null
          recommended_players: string | null
          subcategory_ranks: Json
          updated_at: string
          users_rated: number | null
        }
        Insert: {
          average?: number | null
          bayes_average?: number | null
          best_players?: string | null
          game_id: number
          rank?: number | null
          recommended_players?: string | null
          subcategory_ranks?: Json
          updated_at?: string
          users_rated?: number | null
        }
        Update: {
          average?: number | null
          bayes_average?: number | null
          best_players?: string | null
          game_id?: number
          rank?: number | null
          recommended_players?: string | null
          subcategory_ranks?: Json
          updated_at?: string
          users_rated?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "game_bgg_stats_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: true
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_contributors: {
        Row: {
          contributor_id: number
          game_id: number
          role: string
        }
        Insert: {
          contributor_id: number
          game_id: number
          role: string
        }
        Update: {
          contributor_id?: number
          game_id?: number
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_contributors_contributor_id_fkey"
            columns: ["contributor_id"]
            isOneToOne: false
            referencedRelation: "contributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_contributors_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_external_ids: {
        Row: {
          external_id: string
          game_id: number
          source: string
          url: string | null
        }
        Insert: {
          external_id: string
          game_id: number
          source: string
          url?: string | null
        }
        Update: {
          external_id?: string
          game_id?: number
          source?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_external_ids_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_links: {
        Row: {
          from_game_id: number
          link_type: string
          to_game_id: number
        }
        Insert: {
          from_game_id: number
          link_type: string
          to_game_id: number
        }
        Update: {
          from_game_id?: number
          link_type?: string
          to_game_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_links_from_game_id_fkey"
            columns: ["from_game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_links_to_game_id_fkey"
            columns: ["to_game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_names: {
        Row: {
          game_id: number
          id: number
          lang: string | null
          name: string
          name_type: string
          norm: string
        }
        Insert: {
          game_id: number
          id?: never
          lang?: string | null
          name: string
          name_type: string
          norm?: string
        }
        Update: {
          game_id?: number
          id?: never
          lang?: string | null
          name?: string
          name_type?: string
          norm?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_names_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          bgg_id: number | null
          categories: string[] | null
          created_at: string
          description: string | null
          families: string[]
          id: number
          image_url: string | null
          is_expansion: boolean
          max_players: number | null
          max_playtime: number | null
          mechanics: string[] | null
          min_age: number | null
          min_players: number | null
          min_playtime: number | null
          name: string
          original_name: string | null
          playing_time: number | null
          rating: number | null
          slug: string | null
          source: string
          thumbnail_url: string | null
          type: string | null
          updated_at: string
          weight: number | null
          year_published: number | null
        }
        Insert: {
          bgg_id?: number | null
          categories?: string[] | null
          created_at?: string
          description?: string | null
          families?: string[]
          id?: never
          image_url?: string | null
          is_expansion?: boolean
          max_players?: number | null
          max_playtime?: number | null
          mechanics?: string[] | null
          min_age?: number | null
          min_players?: number | null
          min_playtime?: number | null
          name: string
          original_name?: string | null
          playing_time?: number | null
          rating?: number | null
          slug?: string | null
          source?: string
          thumbnail_url?: string | null
          type?: string | null
          updated_at?: string
          weight?: number | null
          year_published?: number | null
        }
        Update: {
          bgg_id?: number | null
          categories?: string[] | null
          created_at?: string
          description?: string | null
          families?: string[]
          id?: never
          image_url?: string | null
          is_expansion?: boolean
          max_players?: number | null
          max_playtime?: number | null
          mechanics?: string[] | null
          min_age?: number | null
          min_players?: number | null
          min_playtime?: number | null
          name?: string
          original_name?: string | null
          playing_time?: number | null
          rating?: number | null
          slug?: string | null
          source?: string
          thumbnail_url?: string | null
          type?: string | null
          updated_at?: string
          weight?: number | null
          year_published?: number | null
        }
        Relationships: []
      }
      preorder_drafts: {
        Row: {
          currency: string
          description: string | null
          id: string
          image_url: string | null
          price: number | null
          publisher_id: string | null
          raw: Json | null
          release_date: string | null
          scraped_at: string
          source_url: string
          status: Database["public"]["Enums"]["draft_status"]
          title: string
          updated_at: string
        }
        Insert: {
          currency?: string
          description?: string | null
          id?: string
          image_url?: string | null
          price?: number | null
          publisher_id?: string | null
          raw?: Json | null
          release_date?: string | null
          scraped_at?: string
          source_url: string
          status?: Database["public"]["Enums"]["draft_status"]
          title: string
          updated_at?: string
        }
        Update: {
          currency?: string
          description?: string | null
          id?: string
          image_url?: string | null
          price?: number | null
          publisher_id?: string | null
          raw?: Json | null
          release_date?: string | null
          scraped_at?: string
          source_url?: string
          status?: Database["public"]["Enums"]["draft_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "preorder_drafts_publisher_id_fkey"
            columns: ["publisher_id"]
            isOneToOne: false
            referencedRelation: "publishers"
            referencedColumns: ["id"]
          },
        ]
      }
      preorders: {
        Row: {
          approved_at: string
          approved_by: string | null
          created_at: string
          currency: string
          description: string | null
          draft_id: string | null
          game_id: number | null
          id: string
          image_url: string | null
          is_published: boolean
          price: number | null
          publisher_id: string | null
          release_date: string | null
          source_url: string
          title: string
        }
        Insert: {
          approved_at?: string
          approved_by?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          draft_id?: string | null
          game_id?: number | null
          id?: string
          image_url?: string | null
          is_published?: boolean
          price?: number | null
          publisher_id?: string | null
          release_date?: string | null
          source_url: string
          title: string
        }
        Update: {
          approved_at?: string
          approved_by?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          draft_id?: string | null
          game_id?: number | null
          id?: string
          image_url?: string | null
          is_published?: boolean
          price?: number | null
          publisher_id?: string | null
          release_date?: string | null
          source_url?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "preorders_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "preorder_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preorders_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preorders_publisher_id_fkey"
            columns: ["publisher_id"]
            isOneToOne: false
            referencedRelation: "publishers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          role: string
          username: string
        }
        Insert: {
          created_at?: string
          id: string
          role?: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          username?: string
        }
        Relationships: []
      }
      publishers: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          slug: string
          website_url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          slug: string
          website_url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          slug?: string
          website_url?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      collection_item_counts: {
        Row: {
          collection_id: string | null
          game_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "collection_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      approve_draft: {
        Args: { p_draft_id: string }
        Returns: {
          approved_at: string
          approved_by: string | null
          created_at: string
          currency: string
          description: string | null
          draft_id: string | null
          game_id: number | null
          id: string
          image_url: string | null
          is_published: boolean
          price: number | null
          publisher_id: string | null
          release_date: string | null
          source_url: string
          title: string
        }
        SetofOptions: {
          from: "*"
          to: "preorders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      are_friends: { Args: { other: string }; Returns: boolean }
      cache_game: {
        Args: {
          p_bgg_id: number
          p_categories?: string[]
          p_description?: string
          p_image_url?: string
          p_is_expansion?: boolean
          p_max_players?: number
          p_mechanics?: string[]
          p_min_players?: number
          p_name: string
          p_original_name?: string
          p_playing_time?: number
          p_rating?: number
          p_thumbnail_url?: string
          p_weight?: number
          p_year_published?: number
        }
        Returns: {
          bgg_id: number | null
          categories: string[] | null
          created_at: string
          description: string | null
          families: string[]
          id: number
          image_url: string | null
          is_expansion: boolean
          max_players: number | null
          max_playtime: number | null
          mechanics: string[] | null
          min_age: number | null
          min_players: number | null
          min_playtime: number | null
          name: string
          original_name: string | null
          playing_time: number | null
          rating: number | null
          slug: string | null
          source: string
          thumbnail_url: string | null
          type: string | null
          updated_at: string
          weight: number | null
          year_published: number | null
        }
        SetofOptions: {
          from: "*"
          to: "games"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      collection_member_emails: {
        Args: { cid: string }
        Returns: {
          email: string
          role: string
          user_id: string
        }[]
      }
      create_collection: {
        Args: { name: string }
        Returns: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          owner_id: string
          visibility: string
        }
        SetofOptions: {
          from: "*"
          to: "collections"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      generate_username: { Args: { email: string }; Returns: string }
      is_admin: { Args: { uid: string }; Returns: boolean }
      is_collection_member: {
        Args: { cid: string; min_role?: string }
        Returns: boolean
      }
      is_friend_collection: { Args: { cid: string }; Returns: boolean }
      is_public_collection: { Args: { cid: string }; Returns: boolean }
      link_expansion: {
        Args: { p_from_game_id: number; p_to_game_id: number }
        Returns: undefined
      }
      search_games: {
        Args: { lim?: number; q: string }
        Returns: {
          bgg_id: number | null
          categories: string[] | null
          created_at: string
          description: string | null
          families: string[]
          id: number
          image_url: string | null
          is_expansion: boolean
          max_players: number | null
          max_playtime: number | null
          mechanics: string[] | null
          min_age: number | null
          min_players: number | null
          min_playtime: number | null
          name: string
          original_name: string | null
          playing_time: number | null
          rating: number | null
          slug: string | null
          source: string
          thumbnail_url: string | null
          type: string | null
          updated_at: string
          weight: number | null
          year_published: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "games"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      share_collection: {
        Args: { cid: string; invitee_email: string; member_role: string }
        Returns: undefined
      }
      share_collection_with_user: {
        Args: { cid: string; invitee_id: string; member_role: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      unaccent: { Args: { "": string }; Returns: string }
    }
    Enums: {
      draft_status: "pending" | "approved" | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      draft_status: ["pending", "approved", "rejected"],
    },
  },
} as const

