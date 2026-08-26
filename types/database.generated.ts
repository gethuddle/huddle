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
      cities: {
        Row: {
          active: boolean
          center: unknown
          created_at: string
          id: string
          name_en: string
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          center: unknown
          created_at?: string
          id?: string
          name_en: string
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          center?: unknown
          created_at?: string
          id?: string
          name_en?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      competition_teams: {
        Row: {
          competition_id: string
          created_at: string
          season_label: string
          team_id: string
        }
        Insert: {
          competition_id: string
          created_at?: string
          season_label: string
          team_id: string
        }
        Update: {
          competition_id?: string
          created_at?: string
          season_label?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competition_teams_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_teams_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "public_future_matches"
            referencedColumns: ["competition_id"]
          },
          {
            foreignKeyName: "competition_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "public_future_matches"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "competition_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "public_future_matches"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "competition_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      competitions: {
        Row: {
          active: boolean
          code: string | null
          country_name: string | null
          created_at: string
          id: string
          last_synced_at: string
          name: string
          provider: string
          provider_external_id: string
          sport_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code?: string | null
          country_name?: string | null
          created_at?: string
          id?: string
          last_synced_at: string
          name: string
          provider: string
          provider_external_id: string
          sport_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string | null
          country_name?: string | null
          created_at?: string
          id?: string
          last_synced_at?: string
          name?: string
          provider?: string
          provider_external_id?: string
          sport_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitions_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "public_future_matches"
            referencedColumns: ["sport_id"]
          },
          {
            foreignKeyName: "competitions_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          created_at: string
          id: string
          requested_by: string
          responded_at: string | null
          status: Database["public"]["Enums"]["friendship_status"]
          updated_at: string
          user_high_id: string
          user_low_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          requested_by: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["friendship_status"]
          updated_at?: string
          user_high_id: string
          user_low_id: string
        }
        Update: {
          created_at?: string
          id?: string
          requested_by?: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["friendship_status"]
          updated_at?: string
          user_high_id?: string
          user_low_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendships_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_user_high_id_fkey"
            columns: ["user_high_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_user_low_id_fkey"
            columns: ["user_low_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_bans: {
        Row: {
          banned_by: string
          created_at: string
          group_id: string
          reason: string
          revoked_at: string | null
          revoked_by: string | null
          user_id: string
        }
        Insert: {
          banned_by: string
          created_at?: string
          group_id: string
          reason: string
          revoked_at?: string | null
          revoked_by?: string | null
          user_id: string
        }
        Update: {
          banned_by?: string
          created_at?: string
          group_id?: string
          reason?: string
          revoked_at?: string | null
          revoked_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_bans_banned_by_fkey"
            columns: ["banned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_bans_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_bans_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_bans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_invite_tokens: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string
          group_id: string
          id: string
          max_uses: number
          revoked_at: string | null
          token_hash: string
          updated_at: string
          use_count: number
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at: string
          group_id: string
          id?: string
          max_uses: number
          revoked_at?: string | null
          token_hash: string
          updated_at?: string
          use_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string
          group_id?: string
          id?: string
          max_uses?: number
          revoked_at?: string | null
          token_hash?: string
          updated_at?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "group_invite_tokens_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_invite_tokens_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_memberships: {
        Row: {
          application_message: string | null
          created_at: string
          group_id: string
          invite_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          role: Database["public"]["Enums"]["group_role"]
          status: Database["public"]["Enums"]["group_membership_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          application_message?: string | null
          created_at?: string
          group_id: string
          invite_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          role?: Database["public"]["Enums"]["group_role"]
          status?: Database["public"]["Enums"]["group_membership_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          application_message?: string | null
          created_at?: string
          group_id?: string
          invite_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          role?: Database["public"]["Enums"]["group_role"]
          status?: Database["public"]["Enums"]["group_membership_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_memberships_invite_group_fkey"
            columns: ["invite_id", "group_id"]
            isOneToOne: false
            referencedRelation: "group_invite_tokens"
            referencedColumns: ["id", "group_id"]
          },
          {
            foreignKeyName: "group_memberships_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_rules: {
        Row: {
          created_at: string
          group_id: string
          id: string
          position: number
          published_at: string | null
          text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          position: number
          published_at?: string | null
          text: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          position?: number
          published_at?: string | null
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_rules_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          activated_at: string | null
          city_id: string
          created_at: string
          description: string | null
          id: string
          lifecycle: Database["public"]["Enums"]["group_lifecycle"]
          name: string
          owner_id: string
          slug: string
          suspended_at: string | null
          team_id: string | null
          updated_at: string
          visibility: Database["public"]["Enums"]["group_visibility"]
        }
        Insert: {
          activated_at?: string | null
          city_id: string
          created_at?: string
          description?: string | null
          id?: string
          lifecycle: Database["public"]["Enums"]["group_lifecycle"]
          name: string
          owner_id: string
          slug: string
          suspended_at?: string | null
          team_id?: string | null
          updated_at?: string
          visibility: Database["public"]["Enums"]["group_visibility"]
        }
        Update: {
          activated_at?: string | null
          city_id?: string
          created_at?: string
          description?: string | null
          id?: string
          lifecycle?: Database["public"]["Enums"]["group_lifecycle"]
          name?: string
          owner_id?: string
          slug?: string
          suspended_at?: string | null
          team_id?: string | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["group_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "groups_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "public_future_matches"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "groups_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "public_future_matches"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "groups_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          away_team_id: string
          competition_id: string
          created_at: string
          home_team_id: string
          id: string
          last_synced_at: string
          matchday: number | null
          provider: string
          provider_external_id: string
          season_label: string | null
          stage: string | null
          starts_at: string
          status: Database["public"]["Enums"]["sports_match_status"]
          updated_at: string
        }
        Insert: {
          away_team_id: string
          competition_id: string
          created_at?: string
          home_team_id: string
          id?: string
          last_synced_at: string
          matchday?: number | null
          provider: string
          provider_external_id: string
          season_label?: string | null
          stage?: string | null
          starts_at: string
          status: Database["public"]["Enums"]["sports_match_status"]
          updated_at?: string
        }
        Update: {
          away_team_id?: string
          competition_id?: string
          created_at?: string
          home_team_id?: string
          id?: string
          last_synced_at?: string
          matchday?: number | null
          provider?: string
          provider_external_id?: string
          season_label?: string | null
          stage?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["sports_match_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "public_future_matches"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "public_future_matches"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "public_future_matches"
            referencedColumns: ["competition_id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "public_future_matches"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "public_future_matches"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_roles: {
        Row: {
          created_at: string
          profile_id: string
          role: Database["public"]["Enums"]["platform_role"]
        }
        Insert: {
          created_at?: string
          profile_id: string
          role: Database["public"]["Enums"]["platform_role"]
        }
        Update: {
          created_at?: string
          profile_id?: string
          role?: Database["public"]["Enums"]["platform_role"]
        }
        Relationships: [
          {
            foreignKeyName: "platform_roles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          adult_attested_at: string | null
          bio: string | null
          city_id: string | null
          created_at: string
          display_name: string | null
          handle: string | null
          id: string
          profile_completed_at: string | null
          rules_accepted_at: string | null
          rules_version: number | null
          suspended_at: string | null
          updated_at: string
        }
        Insert: {
          adult_attested_at?: string | null
          bio?: string | null
          city_id?: string | null
          created_at?: string
          display_name?: string | null
          handle?: string | null
          id: string
          profile_completed_at?: string | null
          rules_accepted_at?: string | null
          rules_version?: number | null
          suspended_at?: string | null
          updated_at?: string
        }
        Update: {
          adult_attested_at?: string | null
          bio?: string | null
          city_id?: string | null
          created_at?: string
          display_name?: string | null
          handle?: string | null
          id?: string
          profile_completed_at?: string | null
          rules_accepted_at?: string | null
          rules_version?: number | null
          suspended_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_sync_runs: {
        Row: {
          competitions_changed: number
          duration_ms: number | null
          error_code: string | null
          error_summary: string | null
          finished_at: string | null
          id: string
          matches_changed: number
          provider: string
          request_count: number
          retry_count: number
          started_at: string
          status: Database["public"]["Enums"]["provider_sync_status"]
          teams_changed: number
          trigger_source: string
          window_end: string
          window_start: string
        }
        Insert: {
          competitions_changed?: number
          duration_ms?: number | null
          error_code?: string | null
          error_summary?: string | null
          finished_at?: string | null
          id?: string
          matches_changed?: number
          provider: string
          request_count?: number
          retry_count?: number
          started_at?: string
          status?: Database["public"]["Enums"]["provider_sync_status"]
          teams_changed?: number
          trigger_source: string
          window_end: string
          window_start: string
        }
        Update: {
          competitions_changed?: number
          duration_ms?: number | null
          error_code?: string | null
          error_summary?: string | null
          finished_at?: string | null
          id?: string
          matches_changed?: number
          provider?: string
          request_count?: number
          retry_count?: number
          started_at?: string
          status?: Database["public"]["Enums"]["provider_sync_status"]
          teams_changed?: number
          trigger_source?: string
          window_end?: string
          window_start?: string
        }
        Relationships: []
      }
      security_audit_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          metadata: Json
          outcome: string
          request_id: string | null
          resource_id: string | null
          resource_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          outcome: string
          request_id?: string | null
          resource_id?: string | null
          resource_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          outcome?: string
          request_id?: string | null
          resource_id?: string | null
          resource_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_audit_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sports: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          competition_id: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["subscription_kind"]
          sport_id: string | null
          team_id: string | null
          user_id: string
        }
        Insert: {
          competition_id?: string | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["subscription_kind"]
          sport_id?: string | null
          team_id?: string | null
          user_id: string
        }
        Update: {
          competition_id?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["subscription_kind"]
          sport_id?: string | null
          team_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "public_future_matches"
            referencedColumns: ["competition_id"]
          },
          {
            foreignKeyName: "subscriptions_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "public_future_matches"
            referencedColumns: ["sport_id"]
          },
          {
            foreignKeyName: "subscriptions_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "public_future_matches"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "subscriptions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "public_future_matches"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "subscriptions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          active: boolean
          country_name: string | null
          created_at: string
          id: string
          last_synced_at: string
          name: string
          provider: string
          provider_external_id: string
          short_name: string | null
          sport_id: string
          tla: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          country_name?: string | null
          created_at?: string
          id?: string
          last_synced_at: string
          name: string
          provider: string
          provider_external_id: string
          short_name?: string | null
          sport_id: string
          tla?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          country_name?: string | null
          created_at?: string
          id?: string
          last_synced_at?: string
          name?: string
          provider?: string
          provider_external_id?: string
          short_name?: string | null
          sport_id?: string
          tla?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "public_future_matches"
            referencedColumns: ["sport_id"]
          },
          {
            foreignKeyName: "teams_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      public_future_matches: {
        Row: {
          away_team_id: string | null
          away_team_name: string | null
          away_team_short_name: string | null
          away_team_tla: string | null
          competition_code: string | null
          competition_id: string | null
          competition_name: string | null
          home_team_id: string | null
          home_team_name: string | null
          home_team_short_name: string | null
          home_team_tla: string | null
          id: string | null
          last_synced_at: string | null
          matchday: number | null
          season_label: string | null
          sport_id: string | null
          sport_slug: string | null
          stage: string | null
          starts_at: string | null
          status: Database["public"]["Enums"]["sports_match_status"] | null
        }
        Relationships: []
      }
    }
    Functions: {
      begin_sports_sync: {
        Args: {
          input_provider: string
          input_trigger_source: string
          input_window_end: string
          input_window_start: string
        }
        Returns: string
      }
      block_user: {
        Args: { audit_request_id?: string; target_handle: string }
        Returns: boolean
      }
      complete_profile: {
        Args: {
          input_adult_attested: boolean
          input_bio: string
          input_city_slug: string
          input_display_name: string
          input_handle: string
          input_rules_version: number
        }
        Returns: {
          handle: string
          profile_completed_at: string
        }[]
      }
      complete_sports_sync: {
        Args: {
          input_competition_teams: Json
          input_competitions: Json
          input_matches: Json
          input_request_count: number
          input_retry_count: number
          input_run_id: string
          input_sport_slug: string
          input_teams: Json
        }
        Returns: {
          competitions_changed: number
          duration_ms: number
          matches_changed: number
          teams_changed: number
        }[]
      }
      create_group: {
        Args: {
          audit_request_id?: string
          input_city_id: string
          input_description: string
          input_name: string
          input_slug: string
          input_team_id: string
          input_visibility: string
        }
        Returns: {
          group_id: string
          lifecycle: string
          slug: string
        }[]
      }
      current_actor_is_community_eligible: { Args: never; Returns: boolean }
      fail_sports_sync: {
        Args: {
          input_error_code: string
          input_error_summary: string
          input_request_count: number
          input_retry_count: number
          input_run_id: string
        }
        Returns: undefined
      }
      get_group_by_slug: {
        Args: { lookup_slug: string }
        Returns: {
          active_member_count: number
          can_view_member_content: boolean
          city_name: string
          description: string
          group_id: string
          lifecycle: string
          name: string
          owner_handle: string
          slug: string
          team_name: string
          viewer_role: string
          visibility: string
        }[]
      }
      get_public_profile_by_handle: {
        Args: { lookup_handle: string }
        Returns: {
          bio: string
          city_name: string
          display_name: string
          friendship_direction: string
          friendship_id: string
          friendship_status: string
          handle: string
          member_since: string
          viewer_has_blocked: boolean
        }[]
      }
      get_public_provider_freshness: {
        Args: { input_provider: string }
        Returns: {
          last_succeeded_at: string
          provider: string
        }[]
      }
      list_friendships: {
        Args: {
          input_bucket: string
          input_limit?: number
          input_offset?: number
        }
        Returns: {
          direction: string
          friendship_id: string
          other_city_name: string
          other_display_name: string
          other_handle: string
          requested_at: string
          responded_at: string
          status: string
          total_count: number
        }[]
      }
      list_safe_group_members: {
        Args: {
          input_group_id: string
          input_limit?: number
          input_offset?: number
        }
        Returns: {
          display_name: string
          handle: string
          member_since: string
          role: string
          total_count: number
        }[]
      }
      record_sports_sync_denial: {
        Args: { audit_request_id: string }
        Returns: undefined
      }
      remove_friendship: {
        Args: { audit_request_id?: string; input_friendship_id: string }
        Returns: boolean
      }
      request_friendship: {
        Args: { audit_request_id?: string; target_user_id: string }
        Returns: string
      }
      request_friendship_by_handle: {
        Args: { audit_request_id?: string; target_handle: string }
        Returns: string
      }
      respond_to_friendship: {
        Args: {
          audit_request_id?: string
          input_decision: string
          input_friendship_id: string
        }
        Returns: string
      }
      suggest_similar_groups: {
        Args: {
          input_city_id: string
          input_limit?: number
          input_name: string
          input_team_id: string
        }
        Returns: {
          city_name: string
          group_id: string
          lifecycle: string
          name: string
          similarity_score: number
          slug: string
          team_name: string
        }[]
      }
      unblock_user: {
        Args: { audit_request_id?: string; target_handle: string }
        Returns: boolean
      }
    }
    Enums: {
      friendship_status: "pending" | "accepted" | "declined"
      group_lifecycle: "forming" | "active" | "suspended" | "archived"
      group_membership_status:
        | "pending"
        | "active"
        | "rejected"
        | "left"
        | "banned"
      group_role: "owner" | "admin" | "member"
      group_visibility: "discoverable" | "unlisted"
      platform_role: "moderator" | "admin"
      provider_sync_status: "running" | "succeeded" | "failed"
      sports_match_status:
        | "scheduled"
        | "timed"
        | "postponed"
        | "cancelled"
        | "finished"
      subscription_kind: "sport" | "competition" | "team"
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
      friendship_status: ["pending", "accepted", "declined"],
      group_lifecycle: ["forming", "active", "suspended", "archived"],
      group_membership_status: [
        "pending",
        "active",
        "rejected",
        "left",
        "banned",
      ],
      group_role: ["owner", "admin", "member"],
      group_visibility: ["discoverable", "unlisted"],
      platform_role: ["moderator", "admin"],
      provider_sync_status: ["running", "succeeded", "failed"],
      sports_match_status: [
        "scheduled",
        "timed",
        "postponed",
        "cancelled",
        "finished",
      ],
      subscription_kind: ["sport", "competition", "team"],
    },
  },
} as const
