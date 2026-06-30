export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
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
          version_id: number | null
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          collection_id: string
          game_id: number
          id?: string
          notes?: string | null
          tags?: string[]
          version_id?: number | null
        }
        Update: {
          added_at?: string
          added_by?: string | null
          collection_id?: string
          game_id?: number
          id?: string
          notes?: string | null
          tags?: string[]
          version_id?: number | null
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
          {
            foreignKeyName: "collection_items_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "game_bgg_versions"
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
      companies: {
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
      company_external_ids: {
        Row: {
          company_id: number
          external_id: string
          source_id: number
          url: string | null
        }
        Insert: {
          company_id: number
          external_id: string
          source_id?: number
          url?: string | null
        }
        Update: {
          company_id?: number
          external_id?: string
          source_id?: number
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_external_ids_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_external_ids_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
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
      game_bgg_versions: {
        Row: {
          bgg_version_id: number | null
          canonical_name: string
          game_id: number
          id: number
          image_url: string | null
          language_id: number | null
          norm: string
          thumbnail_url: string | null
          year_published: number | null
        }
        Insert: {
          bgg_version_id?: number | null
          canonical_name: string
          game_id: number
          id?: never
          image_url?: string | null
          language_id?: number | null
          norm?: string
          thumbnail_url?: string | null
          year_published?: number | null
        }
        Update: {
          bgg_version_id?: number | null
          canonical_name?: string
          game_id?: number
          id?: never
          image_url?: string | null
          language_id?: number | null
          norm?: string
          thumbnail_url?: string | null
          year_published?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "game_bgg_versions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_bgg_versions_language_id_fkey"
            columns: ["language_id"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["id"]
          },
        ]
      }
      game_credits: {
        Row: {
          game_id: number
          person_id: number
          role: string
          source_id: number
        }
        Insert: {
          game_id: number
          person_id: number
          role: string
          source_id?: number
        }
        Update: {
          game_id?: number
          person_id?: number
          role?: string
          source_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_credits_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_credits_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_credits_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      game_external_ids: {
        Row: {
          external_id: string
          game_id: number
          source_id: number
          url: string | null
        }
        Insert: {
          external_id: string
          game_id: number
          source_id?: number
          url?: string | null
        }
        Update: {
          external_id?: string
          game_id?: number
          source_id?: number
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
          {
            foreignKeyName: "game_external_ids_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      game_links: {
        Row: {
          game_id: number
          link_type: string
          name: string | null
          source_id: number
          target_bgg_id: number
          target_game_id: number | null
        }
        Insert: {
          game_id: number
          link_type: string
          name?: string | null
          source_id?: number
          target_bgg_id: number
          target_game_id?: number | null
        }
        Update: {
          game_id?: number
          link_type?: string
          name?: string | null
          source_id?: number
          target_bgg_id?: number
          target_game_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "game_links_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_links_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_links_target_game_id_fkey"
            columns: ["target_game_id"]
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
          is_display: boolean
          lang: string | null
          name: string
          name_type: string
          norm: string
          source_id: number
        }
        Insert: {
          game_id: number
          id?: never
          is_display?: boolean
          lang?: string | null
          name: string
          name_type: string
          norm?: string
          source_id?: number
        }
        Update: {
          game_id?: number
          id?: never
          is_display?: boolean
          lang?: string | null
          name?: string
          name_type?: string
          norm?: string
          source_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_names_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_names_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      game_publishers: {
        Row: {
          company_id: number
          game_id: number
          source_id: number
        }
        Insert: {
          company_id: number
          game_id: number
          source_id?: number
        }
        Update: {
          company_id?: number
          game_id?: number
          source_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_publishers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_publishers_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_publishers_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      game_tags: {
        Row: {
          game_id: number
          source_id: number
          tag_id: number
        }
        Insert: {
          game_id: number
          source_id?: number
          tag_id: number
        }
        Update: {
          game_id?: number
          source_id?: number
          tag_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_tags_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_tags_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      game_version_artists: {
        Row: {
          person_id: number
          role: string
          version_id: number
        }
        Insert: {
          person_id: number
          role?: string
          version_id: number
        }
        Update: {
          person_id?: number
          role?: string
          version_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_version_artists_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_version_artists_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "game_bgg_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      game_version_publishers: {
        Row: {
          company_id: number
          version_id: number
        }
        Insert: {
          company_id: number
          version_id: number
        }
        Update: {
          company_id?: number
          version_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_version_publishers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_version_publishers_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "game_bgg_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          created_at: string
          id: number
          image_url: string | null
          is_expansion: boolean
          max_players: number | null
          min_players: number | null
          name: string
          num_ratings: number | null
          playing_time: number | null
          primary_source_id: number
          rank: number | null
          rating: number | null
          slug: string | null
          thumbnail_url: string | null
          updated_at: string
          year_published: number | null
        }
        Insert: {
          created_at?: string
          id?: never
          image_url?: string | null
          is_expansion?: boolean
          max_players?: number | null
          min_players?: number | null
          name: string
          num_ratings?: number | null
          playing_time?: number | null
          primary_source_id?: number
          rank?: number | null
          rating?: number | null
          slug?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          year_published?: number | null
        }
        Update: {
          created_at?: string
          id?: never
          image_url?: string | null
          is_expansion?: boolean
          max_players?: number | null
          min_players?: number | null
          name?: string
          num_ratings?: number | null
          playing_time?: number | null
          primary_source_id?: number
          rank?: number | null
          rating?: number | null
          slug?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          year_published?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "games_primary_source_id_fkey"
            columns: ["primary_source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      games_bgg: {
        Row: {
          average_rating: number | null
          bgg_id: number
          description: string | null
          game_id: number
          image_url: string | null
          max_players: number | null
          max_playtime: number | null
          min_age: number | null
          min_players: number | null
          min_playtime: number | null
          num_ratings: number | null
          playing_time: number | null
          primary_name: string
          rank_overall: number | null
          raw: Json | null
          suggested_numplayers: Json
          thumbnail_url: string | null
          updated_at: string
          year_published: number | null
        }
        Insert: {
          average_rating?: number | null
          bgg_id: number
          description?: string | null
          game_id: number
          image_url?: string | null
          max_players?: number | null
          max_playtime?: number | null
          min_age?: number | null
          min_players?: number | null
          min_playtime?: number | null
          num_ratings?: number | null
          playing_time?: number | null
          primary_name: string
          rank_overall?: number | null
          raw?: Json | null
          suggested_numplayers?: Json
          thumbnail_url?: string | null
          updated_at?: string
          year_published?: number | null
        }
        Update: {
          average_rating?: number | null
          bgg_id?: number
          description?: string | null
          game_id?: number
          image_url?: string | null
          max_players?: number | null
          max_playtime?: number | null
          min_age?: number | null
          min_players?: number | null
          min_playtime?: number | null
          num_ratings?: number | null
          playing_time?: number | null
          primary_name?: string
          rank_overall?: number | null
          raw?: Json | null
          suggested_numplayers?: Json
          thumbnail_url?: string | null
          updated_at?: string
          year_published?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "games_bgg_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: true
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      languages: {
        Row: {
          bgg_id: number | null
          code: string | null
          id: number
          name: string
        }
        Insert: {
          bgg_id?: number | null
          code?: string | null
          id?: never
          name: string
        }
        Update: {
          bgg_id?: number | null
          code?: string | null
          id?: never
          name?: string
        }
        Relationships: []
      }
      person_external_ids: {
        Row: {
          external_id: string
          person_id: number
          source_id: number
          url: string | null
        }
        Insert: {
          external_id: string
          person_id: number
          source_id?: number
          url?: string | null
        }
        Update: {
          external_id?: string
          person_id?: number
          source_id?: number
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "person_external_ids_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_external_ids_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      persons: {
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
          lang: string
          role: string
          username: string
        }
        Insert: {
          created_at?: string
          id: string
          lang?: string
          role?: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          lang?: string
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
      sources: {
        Row: {
          code: string
          id: number
          name: string | null
        }
        Insert: {
          code: string
          id: number
          name?: string | null
        }
        Update: {
          code?: string
          id?: number
          name?: string | null
        }
        Relationships: []
      }
      tags: {
        Row: {
          bgg_id: number | null
          id: number
          name: string
          type: string
        }
        Insert: {
          bgg_id?: number | null
          id?: never
          name: string
          type: string
        }
        Update: {
          bgg_id?: number | null
          id?: never
          name?: string
          type?: string
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
      browse_games: {
        Args: {
          p_collection_id?: string
          p_lang?: string
          p_limit?: number
          p_offset?: number
          p_query?: string
        }
        Returns: {
          bgg_id: number
          id: number
          in_collection: boolean
          name: string
          thumbnail_url: string
          total_count: number
          year_published: number
        }[]
      }
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
          created_at: string
          id: number
          image_url: string | null
          is_expansion: boolean
          max_players: number | null
          min_players: number | null
          name: string
          num_ratings: number | null
          playing_time: number | null
          primary_source_id: number
          rank: number | null
          rating: number | null
          slug: string | null
          thumbnail_url: string | null
          updated_at: string
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
      search_games: {
        Args: { lim?: number; p_lang?: string; q: string }
        Returns: {
          bgg_id: number
          id: number
          is_expansion: boolean
          name: string
          thumbnail_url: string
          year_published: number
        }[]
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
