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
      event_attendance: {
        Row: {
          created_at: string
          event_id: string
          id: string
          left_at: string | null
          removal_reason: string | null
          removed_at: string | null
          removed_by: string | null
          requested_at: string
          reviewed_at: string | null
          reviewed_by: string | null
          source: Database["public"]["Enums"]["attendance_source"]
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          left_at?: string | null
          removal_reason?: string | null
          removed_at?: string | null
          removed_by?: string | null
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source: Database["public"]["Enums"]["attendance_source"]
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          left_at?: string | null
          removal_reason?: string | null
          removed_at?: string | null
          removed_by?: string | null
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: Database["public"]["Enums"]["attendance_source"]
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_attendance_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendance_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendance_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_draft_private_locations: {
        Row: {
          address_text: string
          created_at: string
          directions_text: string | null
          draft_id: string
          location: unknown
          updated_at: string
        }
        Insert: {
          address_text: string
          created_at?: string
          directions_text?: string | null
          draft_id: string
          location: unknown
          updated_at?: string
        }
        Update: {
          address_text?: string
          created_at?: string
          directions_text?: string | null
          draft_id?: string
          location?: unknown
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_draft_private_locations_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: true
            referencedRelation: "event_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      event_drafts: {
        Row: {
          created_at: string
          draft_values: Json
          id: string
          organizing_group_id: string | null
          owner_id: string
          step: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          draft_values?: Json
          id?: string
          organizing_group_id?: string | null
          owner_id: string
          step: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          draft_values?: Json
          id?: string
          organizing_group_id?: string | null
          owner_id?: string
          step?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_drafts_organizing_group_id_fkey"
            columns: ["organizing_group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_drafts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_invitations: {
        Row: {
          created_at: string
          event_id: string
          id: string
          invite_token_id: string | null
          invited_by: string
          invitee_id: string
          responded_at: string | null
          status: Database["public"]["Enums"]["invitation_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          invite_token_id?: string | null
          invited_by: string
          invitee_id: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["invitation_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          invite_token_id?: string | null
          invited_by?: string
          invitee_id?: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["invitation_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_invitations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_invitations_invite_token_id_fkey"
            columns: ["invite_token_id"]
            isOneToOne: false
            referencedRelation: "event_invite_tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_invitations_invitee_id_fkey"
            columns: ["invitee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_invite_tokens: {
        Row: {
          created_at: string
          created_by: string
          event_id: string
          expires_at: string
          id: string
          max_uses: number
          revoked_at: string | null
          revoked_by: string | null
          token_hash: string
          updated_at: string
          use_count: number
        }
        Insert: {
          created_at?: string
          created_by: string
          event_id: string
          expires_at: string
          id?: string
          max_uses: number
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash: string
          updated_at?: string
          use_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          event_id?: string
          expires_at?: string
          id?: string
          max_uses?: number
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash?: string
          updated_at?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_invite_tokens_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_invite_tokens_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_invite_tokens_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_private_locations: {
        Row: {
          address_text: string
          created_at: string
          directions: string | null
          event_id: string
          location: unknown
          updated_at: string
        }
        Insert: {
          address_text: string
          created_at?: string
          directions?: string | null
          event_id: string
          location: unknown
          updated_at?: string
        }
        Update: {
          address_text?: string
          created_at?: string
          directions?: string | null
          event_id?: string
          location?: unknown
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_private_locations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          attendance_mode: Database["public"]["Enums"]["event_attendance_mode"]
          audience: Database["public"]["Enums"]["event_audience"]
          audience_group_id: string | null
          audience_team_id: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          capacity: number | null
          commercial_affiliation: string
          cost_description: string
          created_at: string
          created_by: string
          description: string
          ends_at: string
          event_rules: string
          expected_activity: string
          host_presence_confirmed_at: string
          host_user_id: string | null
          host_venue_id: string | null
          id: string
          match_id: string
          organizing_group_id: string | null
          place_kind: Database["public"]["Enums"]["event_place_kind"]
          public_address_text: string | null
          public_location: unknown
          public_place_name: string | null
          published_at: string | null
          requires_approval: boolean
          starts_at: string
          status: Database["public"]["Enums"]["event_status"]
          title: string
          updated_at: string
          venue_id: string | null
          venue_space_id: string | null
        }
        Insert: {
          attendance_mode?: Database["public"]["Enums"]["event_attendance_mode"]
          audience: Database["public"]["Enums"]["event_audience"]
          audience_group_id?: string | null
          audience_team_id?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          capacity?: number | null
          commercial_affiliation: string
          cost_description: string
          created_at?: string
          created_by: string
          description: string
          ends_at: string
          event_rules: string
          expected_activity: string
          host_presence_confirmed_at: string
          host_user_id?: string | null
          host_venue_id?: string | null
          id?: string
          match_id: string
          organizing_group_id?: string | null
          place_kind: Database["public"]["Enums"]["event_place_kind"]
          public_address_text?: string | null
          public_location?: unknown
          public_place_name?: string | null
          published_at?: string | null
          requires_approval: boolean
          starts_at: string
          status?: Database["public"]["Enums"]["event_status"]
          title: string
          updated_at?: string
          venue_id?: string | null
          venue_space_id?: string | null
        }
        Update: {
          attendance_mode?: Database["public"]["Enums"]["event_attendance_mode"]
          audience?: Database["public"]["Enums"]["event_audience"]
          audience_group_id?: string | null
          audience_team_id?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          capacity?: number | null
          commercial_affiliation?: string
          cost_description?: string
          created_at?: string
          created_by?: string
          description?: string
          ends_at?: string
          event_rules?: string
          expected_activity?: string
          host_presence_confirmed_at?: string
          host_user_id?: string | null
          host_venue_id?: string | null
          id?: string
          match_id?: string
          organizing_group_id?: string | null
          place_kind?: Database["public"]["Enums"]["event_place_kind"]
          public_address_text?: string | null
          public_location?: unknown
          public_place_name?: string | null
          published_at?: string | null
          requires_approval?: boolean
          starts_at?: string
          status?: Database["public"]["Enums"]["event_status"]
          title?: string
          updated_at?: string
          venue_id?: string | null
          venue_space_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_audience_group_id_fkey"
            columns: ["audience_group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_audience_team_id_fkey"
            columns: ["audience_team_id"]
            isOneToOne: false
            referencedRelation: "public_future_matches"
            referencedColumns: ["away_team_id"]
          },
          {
            foreignKeyName: "events_audience_team_id_fkey"
            columns: ["audience_team_id"]
            isOneToOne: false
            referencedRelation: "public_future_matches"
            referencedColumns: ["home_team_id"]
          },
          {
            foreignKeyName: "events_audience_team_id_fkey"
            columns: ["audience_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_host_user_id_fkey"
            columns: ["host_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_host_venue_id_fkey"
            columns: ["host_venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "public_future_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_organizing_group_id_fkey"
            columns: ["organizing_group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_venue_space_id_fkey"
            columns: ["venue_space_id"]
            isOneToOne: false
            referencedRelation: "venue_spaces"
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
      group_invitations: {
        Row: {
          created_at: string
          group_id: string
          id: string
          invited_by: string
          invitee_id: string
          responded_at: string | null
          revoked_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          invited_by: string
          invitee_id: string
          responded_at?: string | null
          revoked_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          invited_by?: string
          invitee_id?: string
          responded_at?: string | null
          revoked_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_invitations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_invitations_invitee_id_fkey"
            columns: ["invitee_id"]
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
      moderation_actions: {
        Row: {
          action: Database["public"]["Enums"]["moderation_action_kind"]
          created_at: string
          event_id: string | null
          expires_at: string | null
          group_id: string | null
          id: string
          moderator_id: string
          profile_id: string | null
          reason: string
          report_id: string | null
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          state_before: Json
          target_type: Database["public"]["Enums"]["moderation_target_type"]
          venue_id: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["moderation_action_kind"]
          created_at?: string
          event_id?: string | null
          expires_at?: string | null
          group_id?: string | null
          id?: string
          moderator_id: string
          profile_id?: string | null
          reason: string
          report_id?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          state_before?: Json
          target_type: Database["public"]["Enums"]["moderation_target_type"]
          venue_id?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["moderation_action_kind"]
          created_at?: string
          event_id?: string | null
          expires_at?: string | null
          group_id?: string | null
          id?: string
          moderator_id?: string
          profile_id?: string | null
          reason?: string
          report_id?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          state_before?: Json
          target_type?: Database["public"]["Enums"]["moderation_target_type"]
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moderation_actions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_actions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_actions_moderator_id_fkey"
            columns: ["moderator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_actions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_actions_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_actions_reversed_by_fkey"
            columns: ["reversed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_actions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_appeals: {
        Row: {
          appellant_id: string
          created_at: string
          id: string
          moderation_action_id: string
          outcome_reason: string | null
          reason: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["appeal_status"]
          updated_at: string
        }
        Insert: {
          appellant_id: string
          created_at?: string
          id?: string
          moderation_action_id: string
          outcome_reason?: string | null
          reason: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["appeal_status"]
          updated_at?: string
        }
        Update: {
          appellant_id?: string
          created_at?: string
          id?: string
          moderation_action_id?: string
          outcome_reason?: string | null
          reason?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["appeal_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_appeals_appellant_id_fkey"
            columns: ["appellant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_appeals_moderation_action_id_fkey"
            columns: ["moderation_action_id"]
            isOneToOne: false
            referencedRelation: "moderation_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_appeals_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          community_restricted_at: string | null
          community_restricted_until: string | null
          created_at: string
          deleted_at: string | null
          display_name: string | null
          fan_enabled_at: string | null
          handle: string | null
          id: string
          profile_completed_at: string | null
          rules_accepted_at: string | null
          rules_version: number | null
          suspended_at: string | null
          suspension_expires_at: string | null
          updated_at: string
        }
        Insert: {
          adult_attested_at?: string | null
          bio?: string | null
          community_restricted_at?: string | null
          community_restricted_until?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          fan_enabled_at?: string | null
          handle?: string | null
          id: string
          profile_completed_at?: string | null
          rules_accepted_at?: string | null
          rules_version?: number | null
          suspended_at?: string | null
          suspension_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          adult_attested_at?: string | null
          bio?: string | null
          community_restricted_at?: string | null
          community_restricted_until?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          fan_enabled_at?: string | null
          handle?: string | null
          id?: string
          profile_completed_at?: string | null
          rules_accepted_at?: string | null
          rules_version?: number | null
          suspended_at?: string | null
          suspension_expires_at?: string | null
          updated_at?: string
        }
        Relationships: []
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
      reports: {
        Row: {
          assigned_to: string | null
          category: Database["public"]["Enums"]["report_category"]
          created_at: string
          details: string
          event_id: string | null
          group_id: string | null
          id: string
          profile_id: string | null
          reporter_id: string
          resolution_note: string | null
          status: Database["public"]["Enums"]["report_status"]
          target_type: Database["public"]["Enums"]["moderation_target_type"]
          updated_at: string
          venue_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          category: Database["public"]["Enums"]["report_category"]
          created_at?: string
          details: string
          event_id?: string | null
          group_id?: string | null
          id?: string
          profile_id?: string | null
          reporter_id: string
          resolution_note?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          target_type: Database["public"]["Enums"]["moderation_target_type"]
          updated_at?: string
          venue_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          category?: Database["public"]["Enums"]["report_category"]
          created_at?: string
          details?: string
          event_id?: string | null
          group_id?: string | null
          id?: string
          profile_id?: string | null
          reporter_id?: string
          resolution_note?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          target_type?: Database["public"]["Enums"]["moderation_target_type"]
          updated_at?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
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
          crest_url: string | null
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
          crest_url?: string | null
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
          crest_url?: string | null
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
      venue_follows: {
        Row: {
          created_at: string
          user_id: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
          venue_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_follows_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_follows_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_memberships: {
        Row: {
          created_at: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["venue_member_role"]
          status: Database["public"]["Enums"]["venue_membership_status"]
          updated_at: string
          user_id: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          revoked_at?: string | null
          role: Database["public"]["Enums"]["venue_member_role"]
          status?: Database["public"]["Enums"]["venue_membership_status"]
          updated_at?: string
          user_id: string
          venue_id: string
        }
        Update: {
          created_at?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["venue_member_role"]
          status?: Database["public"]["Enums"]["venue_membership_status"]
          updated_at?: string
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_memberships_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_spaces: {
        Row: {
          active: boolean
          capacity: number | null
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
          venue_id: string
        }
        Insert: {
          active?: boolean
          capacity?: number | null
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
          venue_id: string
        }
        Update: {
          active?: boolean
          capacity?: number | null
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_spaces_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          address_text: string
          archived_at: string | null
          archived_by: string | null
          business_representation_attested_at: string | null
          business_representation_attested_by: string | null
          created_at: string
          default_attendance_mode: Database["public"]["Enums"]["event_attendance_mode"]
          default_requires_approval: boolean
          description: string
          facilities: Database["public"]["Enums"]["venue_facility"][]
          house_information: string
          id: string
          location: unknown
          name: string
          owner_id: string
          screen_count: number | null
          slug: string
          stated_capacity: number | null
          suspended_at: string | null
          updated_at: string
          verification_status: Database["public"]["Enums"]["venue_verification_status"]
        }
        Insert: {
          address_text: string
          archived_at?: string | null
          archived_by?: string | null
          business_representation_attested_at?: string | null
          business_representation_attested_by?: string | null
          created_at?: string
          default_attendance_mode?: Database["public"]["Enums"]["event_attendance_mode"]
          default_requires_approval?: boolean
          description: string
          facilities?: Database["public"]["Enums"]["venue_facility"][]
          house_information?: string
          id?: string
          location: unknown
          name: string
          owner_id: string
          screen_count?: number | null
          slug: string
          stated_capacity?: number | null
          suspended_at?: string | null
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["venue_verification_status"]
        }
        Update: {
          address_text?: string
          archived_at?: string | null
          archived_by?: string | null
          business_representation_attested_at?: string | null
          business_representation_attested_by?: string | null
          created_at?: string
          default_attendance_mode?: Database["public"]["Enums"]["event_attendance_mode"]
          default_requires_approval?: boolean
          description?: string
          facilities?: Database["public"]["Enums"]["venue_facility"][]
          house_information?: string
          id?: string
          location?: unknown
          name?: string
          owner_id?: string
          screen_count?: number | null
          slug?: string
          stated_capacity?: number | null
          suspended_at?: string | null
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["venue_verification_status"]
        }
        Relationships: [
          {
            foreignKeyName: "venues_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venues_business_representation_attested_by_fkey"
            columns: ["business_representation_attested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venues_owner_id_fkey"
            columns: ["owner_id"]
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
          away_team_crest_url: string | null
          away_team_id: string | null
          away_team_name: string | null
          away_team_short_name: string | null
          away_team_tla: string | null
          competition_code: string | null
          competition_id: string | null
          competition_name: string | null
          home_team_crest_url: string | null
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
      accept_common_onboarding: {
        Args: { input_adult_attested: boolean; input_rules_version: number }
        Returns: {
          adult_attested_at: string
          rules_accepted_at: string
          rules_version: number
        }[]
      }
      activate_fan_workspace: {
        Args: {
          audit_request_id?: string
          input_adult_attested: boolean
          input_bio: string
          input_display_name: string
          input_handle: string
          input_rules_version: number
        }
        Returns: {
          fan_enabled_at: string
          handle: string
          profile_completed_at: string
        }[]
      }
      apply_moderation_action: {
        Args: {
          audit_request_id?: string
          input_action: string
          input_duration_hours?: number
          input_reason: string
          input_report_id: string
        }
        Returns: {
          action: string
          moderation_action_id: string
        }[]
      }
      apply_to_group: {
        Args: {
          audit_request_id?: string
          input_group_id: string
          input_message: string
        }
        Returns: {
          group_id: string
          status: string
        }[]
      }
      archive_group: {
        Args: { audit_request_id?: string; input_group_id: string }
        Returns: boolean
      }
      archive_venue: {
        Args: {
          audit_request_id?: string
          input_confirmation: string
          input_venue_id: string
        }
        Returns: boolean
      }
      assign_report: {
        Args: { audit_request_id?: string; input_report_id: string }
        Returns: boolean
      }
      ban_group_member: {
        Args: {
          audit_request_id?: string
          input_group_id: string
          input_reason: string
          input_user_id: string
        }
        Returns: {
          group_id: string
          status: string
          user_id: string
        }[]
      }
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
      cancel_event: {
        Args: {
          audit_request_id?: string
          input_event_id: string
          input_reason: string
        }
        Returns: boolean
      }
      change_group_member_role: {
        Args: {
          audit_request_id?: string
          input_group_id: string
          input_role: string
          input_user_id: string
        }
        Returns: {
          group_id: string
          role: string
          user_id: string
        }[]
      }
      claim_assisted_discovery_interpretation: { Args: never; Returns: boolean }
      claim_ephemeral_location_search: {
        Args: { input_purpose: string }
        Returns: {
          claim_granted: boolean
        }[]
      }
      claim_public_address_search: {
        Args: {
          input_country_code: string
          input_location_kind: string
          input_query: string
        }
        Returns: {
          cache_hit: boolean
          claim_granted: boolean
          query_digest: string
          result_payload: Json
          retry_after_ms: number
        }[]
      }
      complete_profile: {
        Args: {
          input_adult_attested: boolean
          input_bio: string
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
      consume_group_invite: {
        Args: {
          audit_request_id?: string
          input_message: string
          input_token: string
        }
        Returns: {
          group_id: string
          slug: string
          status: string
        }[]
      }
      create_event_invitation: {
        Args: {
          audit_request_id?: string
          input_event_id: string
          input_invitee_handle: string
        }
        Returns: {
          event_id: string
          invitation_id: string
          status: string
        }[]
      }
      create_event_invite_token: {
        Args: {
          audit_request_id?: string
          input_event_id: string
          input_expires_at: string
          input_max_uses: number
        }
        Returns: {
          created_at: string
          expires_at: string
          invite_token: string
          invite_token_id: string
          max_uses: number
          use_count: number
        }[]
      }
      create_group: {
        Args: {
          audit_request_id?: string
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
      create_group_event: {
        Args: {
          audit_request_id?: string
          input_audience: string
          input_audience_group_id: string
          input_capacity: number
          input_commercial_affiliation: string
          input_cost_description: string
          input_description: string
          input_ends_at: string
          input_event_rules: string
          input_expected_activity: string
          input_host_presence_confirmed: boolean
          input_intent: string
          input_match_id: string
          input_organizing_group_id: string
          input_place_kind: string
          input_private_address_text: string
          input_private_directions: string
          input_private_latitude: number
          input_private_longitude: number
          input_public_address_text: string
          input_public_latitude: number
          input_public_longitude: number
          input_public_place_name: string
          input_starts_at: string
          input_title: string
        }
        Returns: {
          event_id: string
          status: string
        }[]
      }
      create_group_invitation: {
        Args: {
          audit_request_id?: string
          input_group_id: string
          input_invitee_id: string
        }
        Returns: {
          group_id: string
          invitation_id: string
          invitee_id: string
          status: string
        }[]
      }
      create_group_invite: {
        Args: {
          audit_request_id?: string
          input_expires_at: string
          input_group_id: string
          input_max_uses: number
          input_token_hash: string
        }
        Returns: {
          created_at: string
          expires_at: string
          invite_id: string
          max_uses: number
          revoked_at: string
          use_count: number
        }[]
      }
      create_group_rule: {
        Args: {
          audit_request_id?: string
          input_group_id: string
          input_publish?: boolean
          input_text: string
        }
        Returns: {
          published_at: string
          rule_id: string
          rule_position: number
          rule_text: string
        }[]
      }
      create_or_update_event: {
        Args: {
          audit_request_id?: string
          input_audience: string
          input_audience_group_id: string
          input_audience_team_id: string
          input_capacity: number
          input_commercial_affiliation: string
          input_cost_description: string
          input_description: string
          input_ends_at: string
          input_event_id: string
          input_event_rules: string
          input_expected_activity: string
          input_host_presence_confirmed: boolean
          input_host_venue_id: string
          input_intent: string
          input_match_id: string
          input_organizing_group_id: string
          input_place_kind: string
          input_private_address_text: string
          input_private_directions: string
          input_private_latitude: number
          input_private_longitude: number
          input_public_address_text: string
          input_public_latitude: number
          input_public_longitude: number
          input_public_place_name: string
          input_requires_approval: boolean
          input_starts_at: string
          input_title: string
          input_venue_id: string
        }
        Returns: {
          event_id: string
          status: string
        }[]
      }
      create_venue: {
        Args: {
          audit_request_id?: string
          input_address_text: string
          input_description: string
          input_latitude: number
          input_longitude: number
          input_name: string
          input_screen_count: number
          input_slug: string
          input_stated_capacity: number
        }
        Returns: {
          slug: string
          venue_id: string
          verification_status: string
        }[]
      }
      create_venue_workspace: {
        Args: {
          audit_request_id?: string
          input_address_text: string
          input_adult_attested: boolean
          input_default_requires_approval: boolean
          input_description: string
          input_facilities: string[]
          input_house_information: string
          input_latitude: number
          input_longitude: number
          input_main_space_capacity: number
          input_main_space_name: string
          input_name: string
          input_representation_attested: boolean
          input_rules_version: number
          input_slug: string
        }
        Returns: {
          slug: string
          venue_id: string
          verification_status: string
        }[]
      }
      create_venue_workspace_v2: {
        Args: {
          audit_request_id?: string
          input_address_text: string
          input_adult_attested: boolean
          input_default_attendance_mode: string
          input_default_requires_approval: boolean
          input_description: string
          input_facilities: string[]
          input_house_information: string
          input_latitude: number
          input_longitude: number
          input_main_space_capacity: number
          input_main_space_name: string
          input_name: string
          input_representation_attested: boolean
          input_rules_version: number
          input_slug: string
        }
        Returns: {
          slug: string
          venue_id: string
          verification_status: string
        }[]
      }
      current_actor_is_community_eligible: { Args: never; Returns: boolean }
      discard_event_draft: {
        Args: { input_draft_id: string }
        Returns: boolean
      }
      discover_events: {
        Args: {
          input_after_distance_band?: number
          input_after_event_id?: string
          input_after_interest_score?: number
          input_after_starts_at?: string
          input_competition_id?: string
          input_from: string
          input_lat: number
          input_limit?: number
          input_lng: number
          input_match_id?: string
          input_radius_km: number
          input_team_id?: string
          input_to: string
        }
        Returns: {
          approved_attendee_count: number
          audience: string
          audience_group_name: string
          audience_team_name: string
          away_team_name: string
          capacity: number
          competition_name: string
          cursor_distance_band: number
          ends_at: string
          event_id: string
          has_more: boolean
          home_team_name: string
          host_display_name: string
          host_kind: string
          host_venue_slug: string
          interest_score: number
          location_summary: string
          match_id: string
          place_kind: string
          remaining_capacity: number
          requires_approval: boolean
          starts_at: string
          title: string
          venue_verification_status: string
        }[]
      }
      discover_open_door_events: {
        Args: {
          input_after_distance_band?: number
          input_after_event_id?: string
          input_after_interest_score?: number
          input_after_starts_at?: string
          input_competition_id?: string
          input_from: string
          input_lat: number
          input_limit?: number
          input_lng: number
          input_match_id?: string
          input_radius_km: number
          input_team_id?: string
          input_to: string
        }
        Returns: {
          approved_attendee_count: number
          audience: string
          audience_group_name: string
          audience_team_name: string
          away_team_name: string
          capacity: number
          competition_name: string
          cursor_distance_band: number
          ends_at: string
          event_id: string
          has_more: boolean
          home_team_name: string
          host_display_name: string
          host_kind: string
          host_venue_slug: string
          interest_score: number
          location_summary: string
          match_id: string
          place_kind: string
          remaining_capacity: number
          requires_approval: boolean
          starts_at: string
          title: string
          venue_verification_status: string
        }[]
      }
      discover_owned_venue_events: {
        Args: {
          input_after_distance_band?: number
          input_after_event_id?: string
          input_after_interest_score?: number
          input_after_starts_at?: string
          input_competition_id?: string
          input_from: string
          input_lat: number
          input_limit?: number
          input_lng: number
          input_match_id?: string
          input_radius_km: number
          input_team_id?: string
          input_to: string
        }
        Returns: {
          approved_attendee_count: number
          audience: string
          audience_group_name: string
          audience_team_name: string
          away_team_name: string
          capacity: number
          competition_name: string
          cursor_distance_band: number
          ends_at: string
          event_id: string
          has_more: boolean
          home_team_name: string
          host_display_name: string
          host_kind: string
          host_venue_slug: string
          interest_score: number
          location_summary: string
          match_id: string
          place_kind: string
          remaining_capacity: number
          requires_approval: boolean
          starts_at: string
          title: string
          venue_verification_status: string
        }[]
      }
      dismiss_report: {
        Args: {
          audit_request_id?: string
          input_reason: string
          input_report_id: string
        }
        Returns: boolean
      }
      evaluate_group_discoverability: {
        Args: { input_group_id: string }
        Returns: {
          active_member_count: number
          active_moderator_count: number
          gate_satisfied: boolean
          has_description: boolean
          has_future_event: boolean
          has_published_rule: boolean
          lifecycle: string
          owner_is_active: boolean
        }[]
      }
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
      finalize_event_draft: {
        Args: { audit_request_id?: string; input_draft_id: string }
        Returns: {
          event_id: string
          status: string
        }[]
      }
      get_calendar_event: {
        Args: { audit_request_id?: string; input_event_id: string }
        Returns: {
          description: string
          ends_at: string
          event_id: string
          location_text: string
          public_cacheable: boolean
          starts_at: string
          title: string
          updated_at: string
        }[]
      }
      get_event_draft: {
        Args: { input_draft_id: string }
        Returns: {
          draft_id: string
          draft_values: Json
          organizing_group_id: string
          private_address_text: string
          private_directions_text: string
          private_latitude: number
          private_longitude: number
          step: number
          updated_at: string
        }[]
      }
      get_event_summary: {
        Args: { input_event_id: string }
        Returns: {
          approved_attendee_count: number
          audience: string
          audience_group_name: string
          audience_team_name: string
          away_team_name: string
          can_manage: boolean
          capacity: number
          commercial_affiliation: string
          competition_name: string
          cost_description: string
          description: string
          ends_at: string
          event_id: string
          event_rules: string
          expected_activity: string
          home_team_name: string
          host_display_name: string
          host_handle: string
          host_kind: string
          host_venue_slug: string
          location_summary: string
          match_id: string
          organizing_group_name: string
          organizing_group_slug: string
          place_kind: string
          public_address_text: string
          public_place_name: string
          remaining_capacity: number
          requires_approval: boolean
          starts_at: string
          status: string
          title: string
          venue_verification_status: string
          viewer_attendance_id: string
          viewer_attendance_status: string
          viewer_can_read_private_location: boolean
          viewer_invitation_id: string
          viewer_invitation_status: string
          viewer_is_authenticated: boolean
        }[]
      }
      get_group_by_slug: {
        Args: { lookup_slug: string }
        Returns: {
          active_member_count: number
          can_apply: boolean
          can_view_member_content: boolean
          description: string
          group_id: string
          lifecycle: string
          name: string
          owner_handle: string
          slug: string
          team_name: string
          viewer_membership_status: string
          viewer_role: string
          visibility: string
        }[]
      }
      get_group_invite_preview: {
        Args: { input_token: string }
        Returns: {
          group_id: string
          name: string
          slug: string
          viewer_membership_status: string
        }[]
      }
      get_private_event_location: {
        Args: { audit_request_id?: string; input_event_id: string }
        Returns: {
          address_text: string
          directions: string
        }[]
      }
      get_public_event_map_points: {
        Args: { input_event_ids: string[] }
        Returns: {
          event_id: string
          latitude: number
          longitude: number
          place_name: string
        }[]
      }
      get_public_profile_by_handle: {
        Args: { lookup_handle: string }
        Returns: {
          bio: string
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
          coverage_through: string
          provider: string
          updated_at: string
        }[]
      }
      get_venue_by_slug: {
        Args: { lookup_slug: string }
        Returns: {
          address_text: string
          description: string
          facilities: string[]
          follower_count: number
          name: string
          owner_handle: string
          screen_count: number
          slug: string
          stated_capacity: number
          venue_id: string
          verification_status: string
          viewer_follows: boolean
          viewer_is_owner: boolean
        }[]
      }
      get_venue_for_management: {
        Args: { lookup_slug: string }
        Returns: {
          address_text: string
          description: string
          latitude: number
          longitude: number
          name: string
          screen_count: number
          slug: string
          stated_capacity: number
          suspended_at: string
          venue_id: string
          verification_status: string
        }[]
      }
      get_venue_settings: {
        Args: { input_venue_id: string }
        Returns: {
          address_text: string
          default_attendance_mode: string
          default_requires_approval: boolean
          description: string
          facilities: string[]
          house_information: string
          latitude: number
          longitude: number
          name: string
          role: string
          slug: string
          spaces: Json
          venue_id: string
          verification_status: string
        }[]
      }
      get_venue_today: {
        Args: { input_limit?: number; input_venue_id: string }
        Returns: {
          attention: Json
          next_event: Json
          setup_tasks: Json
          today_events: Json
        }[]
      }
      get_venue_workspace: {
        Args: { input_venue_id: string }
        Returns: {
          name: string
          needs_area_setup: boolean
          needs_capacity: boolean
          role: string
          slug: string
          spaces: Json
          venue_id: string
          verification_status: string
        }[]
      }
      leave_event: {
        Args: { audit_request_id?: string; input_attendance_id: string }
        Returns: boolean
      }
      leave_group: {
        Args: { audit_request_id?: string; input_group_id: string }
        Returns: {
          group_id: string
          status: string
        }[]
      }
      list_approved_event_attendees: {
        Args: {
          input_event_id: string
          input_limit?: number
          input_offset?: number
        }
        Returns: {
          display_name: string
          profile_handle: string
          total_count: number
        }[]
      }
      list_attention_items: {
        Args: { input_limit?: number }
        Returns: {
          created_at: string
          description: string
          href: string
          key: string
          kind: string
          resource_id: string
          title: string
        }[]
      }
      list_event_attendance: {
        Args: {
          input_event_id: string
          input_limit?: number
          input_offset?: number
        }
        Returns: {
          account_age_days: number
          attendance_id: string
          can_approve: boolean
          follows_audience_team: boolean
          follows_away_team: boolean
          follows_competition: boolean
          follows_home_team: boolean
          follows_sport: boolean
          mutual_friend_count: number
          removal_reason: string
          requested_at: string
          requester_display_name: string
          requester_handle: string
          review_mode: string
          review_reason: string
          shared_active_group_count: number
          source: string
          status: string
          total_count: number
          user_id: string
          verified_account: boolean
        }[]
      }
      list_event_invitations: {
        Args: {
          input_event_id: string
          input_limit?: number
          input_offset?: number
        }
        Returns: {
          created_at: string
          invitation_id: string
          invitee_display_name: string
          invitee_handle: string
          invitee_id: string
          responded_at: string
          status: string
          total_count: number
        }[]
      }
      list_event_invite_tokens: {
        Args: { input_event_id: string }
        Returns: {
          created_at: string
          creator_handle: string
          expires_at: string
          invite_status: string
          invite_token_id: string
          max_uses: number
          revoked_at: string
          use_count: number
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
          other_display_name: string
          other_handle: string
          requested_at: string
          responded_at: string
          status: string
          total_count: number
        }[]
      }
      list_group_admin_members: {
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
          user_id: string
        }[]
      }
      list_group_applications: {
        Args: {
          input_group_id: string
          input_limit?: number
          input_offset?: number
        }
        Returns: {
          application_message: string
          application_source: string
          applied_at: string
          display_name: string
          handle: string
          total_count: number
          user_id: string
        }[]
      }
      list_group_bans: {
        Args: {
          input_group_id: string
          input_limit?: number
          input_offset?: number
        }
        Returns: {
          banned_at: string
          banned_by_handle: string
          display_name: string
          handle: string
          reason: string
          total_count: number
          user_id: string
        }[]
      }
      list_group_direct_invitations: {
        Args: {
          input_group_id: string
          input_limit?: number
          input_offset?: number
        }
        Returns: {
          created_at: string
          invitation_id: string
          invitation_status: string
          invitee_display_name: string
          invitee_handle: string
          invitee_id: string
          inviter_handle: string
          responded_at: string
          revoked_at: string
          total_count: number
        }[]
      }
      list_group_event_submissions: {
        Args: {
          input_group_id: string
          input_limit?: number
          input_offset?: number
        }
        Returns: {
          audience: string
          audience_group_name: string
          away_team_name: string
          can_review: boolean
          can_withdraw: boolean
          competition_name: string
          event_id: string
          home_team_name: string
          place_kind: string
          starts_at: string
          status: string
          submitted_at: string
          submitter_display_name: string
          submitter_handle: string
          title: string
          total_count: number
        }[]
      }
      list_group_events: {
        Args: { input_group_id: string; input_limit?: number }
        Returns: {
          approved_attendee_count: number
          audience: string
          away_team_name: string
          capacity: number
          competition_name: string
          event_id: string
          home_team_name: string
          requires_approval: boolean
          starts_at: string
          title: string
        }[]
      }
      list_group_invites: {
        Args: {
          input_group_id: string
          input_limit?: number
          input_offset?: number
        }
        Returns: {
          created_at: string
          creator_handle: string
          expires_at: string
          invite_id: string
          invite_status: string
          max_uses: number
          revoked_at: string
          total_count: number
          use_count: number
        }[]
      }
      list_group_rules: {
        Args: {
          input_group_id: string
          input_limit?: number
          input_offset?: number
        }
        Returns: {
          published_at: string
          rule_id: string
          rule_position: number
          rule_text: string
          total_count: number
        }[]
      }
      list_managed_venue_events: {
        Args: { input_limit?: number; input_venue_id: string }
        Returns: {
          approved_attendee_count: number
          audience: string
          audience_team_name: string
          away_team_name: string
          capacity: number
          competition_name: string
          event_id: string
          home_team_name: string
          requires_approval: boolean
          starts_at: string
          status: string
          title: string
        }[]
      }
      list_match_events: {
        Args: { input_limit?: number; input_match_id: string }
        Returns: {
          approved_attendee_count: number
          audience: string
          audience_team_name: string
          away_team_name: string
          capacity: number
          competition_name: string
          event_id: string
          home_team_name: string
          requires_approval: boolean
          starts_at: string
          title: string
        }[]
      }
      list_moderation_actions: {
        Args: {
          input_active_only?: boolean
          input_limit?: number
          input_offset?: number
        }
        Returns: {
          action: string
          created_at: string
          expires_at: string
          has_active_appeal: boolean
          moderation_action_id: string
          reason: string
          reversal_reason: string
          reversed_at: string
          target_label: string
          target_type: string
        }[]
      }
      list_moderation_appeals: {
        Args: {
          input_limit?: number
          input_offset?: number
          input_status?: string
        }
        Returns: {
          action: string
          appeal_id: string
          appeal_reason: string
          appellant_handle: string
          can_current_moderator_review: boolean
          created_at: string
          moderation_action_id: string
          original_moderator_id: string
          status: string
        }[]
      }
      list_moderation_reports: {
        Args: {
          input_limit?: number
          input_offset?: number
          input_status?: string
        }
        Returns: {
          assigned_to_me: boolean
          category: string
          created_at: string
          details: string
          report_id: string
          reporter_handle: string
          status: string
          target_id: string
          target_label: string
          target_type: string
        }[]
      }
      list_my_event_participation: {
        Args: { input_limit?: number; input_offset?: number }
        Returns: {
          attendance_id: string
          attendance_status: string
          away_team_name: string
          competition_name: string
          event_id: string
          home_team_name: string
          host_kind: string
          invitation_id: string
          invitation_status: string
          place_kind: string
          remaining_capacity: number
          requires_approval: boolean
          starts_at: string
          title: string
          total_count: number
        }[]
      }
      list_my_events: {
        Args: {
          input_bucket: string
          input_limit?: number
          input_offset?: number
        }
        Returns: {
          audience: string
          away_team_name: string
          bucket: string
          can_manage: boolean
          competition_name: string
          event_id: string
          home_team_name: string
          place_kind: string
          relationship_label: string
          starts_at: string
          status: string
          title: string
          total_count: number
        }[]
      }
      list_my_group_invitations: {
        Args: never
        Returns: {
          group_id: string
          group_name: string
          group_slug: string
          invitation_id: string
          invited_at: string
          inviter_handle: string
        }[]
      }
      list_my_group_relationships: {
        Args: {
          input_bucket: string
          input_limit?: number
          input_offset?: number
        }
        Returns: {
          active_member_count: number
          can_manage: boolean
          description: string
          group_id: string
          lifecycle: string
          member_role: string
          membership_status: string
          name: string
          slug: string
          team_name: string
          total_count: number
          visibility: string
        }[]
      }
      list_my_groups: {
        Args: { input_limit?: number; input_offset?: number }
        Returns: {
          active_member_count: number
          can_manage: boolean
          description: string
          group_id: string
          lifecycle: string
          member_role: string
          membership_status: string
          name: string
          slug: string
          team_name: string
          total_count: number
          visibility: string
        }[]
      }
      list_my_moderation_actions: {
        Args: { input_limit?: number; input_offset?: number }
        Returns: {
          action: string
          created_at: string
          expires_at: string
          has_active_appeal: boolean
          moderation_action_id: string
          reason: string
          reversal_reason: string
          reversed_at: string
          target_label: string
          target_type: string
        }[]
      }
      list_my_moderation_appeals: {
        Args: { input_limit?: number; input_offset?: number }
        Returns: {
          action: string
          appeal_id: string
          created_at: string
          moderation_action_id: string
          outcome_reason: string
          reason: string
          reviewed_at: string
          status: string
        }[]
      }
      list_my_reports: {
        Args: { input_limit?: number; input_offset?: number }
        Returns: {
          category: string
          created_at: string
          report_id: string
          safe_status: string
          target_label: string
          target_type: string
        }[]
      }
      list_my_saved_items: {
        Args: {
          input_bucket: string
          input_limit?: number
          input_offset?: number
        }
        Returns: {
          created_at: string
          detail: string
          href: string
          item_id: string
          kind: string
          label: string
          total_count: number
        }[]
      }
      list_my_workspace_recovery: {
        Args: never
        Returns: {
          name: string
          role: string
          slug: string
          workspace_id: string
          workspace_kind: string
        }[]
      }
      list_my_workspaces: {
        Args: never
        Returns: {
          name: string
          role: string
          slug: string
          workspace_id: string
          workspace_kind: string
        }[]
      }
      list_people_hub: {
        Args: {
          input_bucket: string
          input_limit?: number
          input_offset?: number
          input_query: string
        }
        Returns: {
          display_name: string
          friendship_direction: string
          friendship_id: string
          friendship_status: string
          handle: string
          profile_id: string
          reason: string
          relationship_created_at: string
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
      list_venue_calendar: {
        Args: { input_limit?: number; input_venue_id: string }
        Returns: {
          approved_attendee_count: number
          attendance_mode: string
          capacity: number
          ends_at: string
          event_id: string
          requires_approval: boolean
          starts_at: string
          status: string
          title: string
          venue_space_id: string
          venue_space_name: string
        }[]
      }
      list_venue_events: {
        Args: { input_limit?: number; lookup_slug: string }
        Returns: {
          approved_attendee_count: number
          audience: string
          audience_team_name: string
          away_team_name: string
          capacity: number
          competition_name: string
          event_id: string
          home_team_name: string
          requires_approval: boolean
          starts_at: string
          title: string
        }[]
      }
      plan_venue_events: {
        Args: {
          audit_request_id?: string
          input_intent: string
          input_items: Json
        }
        Returns: {
          event_id: string
          status: string
        }[]
      }
      prepare_account_erasure: {
        Args: { audit_request_id?: string; input_confirmation: string }
        Returns: boolean
      }
      publish_group_event: {
        Args: {
          audit_request_id?: string
          input_decision: string
          input_event_id: string
        }
        Returns: {
          decision: string
          event_id: string
          status: string
        }[]
      }
      record_sports_sync_denial: {
        Args: { audit_request_id: string }
        Returns: undefined
      }
      redeem_event_invite_token: {
        Args: { audit_request_id?: string; input_invite_token: string }
        Returns: {
          event_id: string
          invitation_id: string
          invitation_status: string
        }[]
      }
      remove_attendee: {
        Args: {
          audit_request_id?: string
          input_attendance_id: string
          input_reason: string
        }
        Returns: boolean
      }
      remove_friendship: {
        Args: { audit_request_id?: string; input_friendship_id: string }
        Returns: boolean
      }
      remove_group_member: {
        Args: {
          audit_request_id?: string
          input_group_id: string
          input_user_id: string
        }
        Returns: {
          group_id: string
          status: string
          user_id: string
        }[]
      }
      reorder_group_rules: {
        Args: {
          audit_request_id?: string
          input_group_id: string
          input_rule_ids: string[]
        }
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
      request_or_join_event: {
        Args: { audit_request_id?: string; input_event_id: string }
        Returns: {
          attendance_id: string
          status: string
        }[]
      }
      resolve_event_invitation_candidate_handles: {
        Args: { input_event_id: string; input_profile_ids: string[] }
        Returns: {
          handle: string
          profile_id: string
        }[]
      }
      respond_group_invitation: {
        Args: {
          audit_request_id?: string
          input_decision: string
          input_invitation_id: string
        }
        Returns: {
          group_id: string
          group_slug: string
          invitation_id: string
          status: string
        }[]
      }
      respond_to_event_invitation: {
        Args: {
          audit_request_id?: string
          input_decision: string
          input_invitation_id: string
        }
        Returns: {
          attendance_id: string
          attendance_status: string
          event_id: string
          invitation_status: string
        }[]
      }
      respond_to_friendship: {
        Args: {
          audit_request_id?: string
          input_decision: string
          input_friendship_id: string
        }
        Returns: string
      }
      reverse_moderation_action: {
        Args: {
          audit_request_id?: string
          input_action_id: string
          input_reason: string
        }
        Returns: boolean
      }
      review_attendance: {
        Args: {
          audit_request_id?: string
          input_attendance_id: string
          input_decision: string
        }
        Returns: {
          attendance_id: string
          status: string
        }[]
      }
      review_group_membership: {
        Args: {
          audit_request_id?: string
          input_decision: string
          input_group_id: string
          input_user_id: string
        }
        Returns: {
          group_id: string
          status: string
          user_id: string
        }[]
      }
      review_moderation_appeal: {
        Args: {
          audit_request_id?: string
          input_appeal_id: string
          input_decision: string
          input_outcome_reason: string
        }
        Returns: boolean
      }
      revoke_event_invitation: {
        Args: { audit_request_id?: string; input_invitation_id: string }
        Returns: boolean
      }
      revoke_event_invite_token: {
        Args: { audit_request_id?: string; input_invite_token_id: string }
        Returns: boolean
      }
      revoke_group_invitation: {
        Args: { audit_request_id?: string; input_invitation_id: string }
        Returns: {
          group_id: string
          invitation_id: string
          status: string
        }[]
      }
      revoke_group_invite: {
        Args: { audit_request_id?: string; input_invite_id: string }
        Returns: boolean
      }
      save_event_draft: {
        Args: {
          input_draft_id: string
          input_organizing_group_id: string
          input_private_address_text: string
          input_private_directions_text: string
          input_private_latitude: number
          input_private_longitude: number
          input_private_mode: string
          input_step: number
          input_values: Json
        }
        Returns: {
          draft_id: string
          draft_values: Json
          organizing_group_id: string
          private_address_text: string
          private_directions_text: string
          private_latitude: number
          private_longitude: number
          step: number
          updated_at: string
        }[]
      }
      save_venue_space: {
        Args: {
          audit_request_id?: string
          input_active: boolean
          input_capacity: number
          input_name: string
          input_sort_order: number
          input_space_id: string
          input_venue_id: string
        }
        Returns: {
          active: boolean
          capacity: number
          name: string
          space_id: string
        }[]
      }
      search_assisted_events: {
        Args: {
          input_competition_id: string
          input_facilities: string[]
          input_from_date: string
          input_host_kind: string
          input_lat: number
          input_lng: number
          input_relationship: string
          input_team_ids: string[]
          input_to_date: string
        }
        Returns: {
          approved_attendee_count: number
          attendance_mode: string
          audience: string
          away_team_crest_url: string
          away_team_name: string
          away_team_tla: string
          capacity: number
          competition_name: string
          distance_band: number
          ends_at: string
          event_id: string
          group_name: string
          group_relationship: string
          group_slug: string
          home_team_crest_url: string
          home_team_name: string
          home_team_tla: string
          host_display_name: string
          host_kind: string
          host_venue_slug: string
          interest_score: number
          location_summary: string
          match_id: string
          matched_friend_host: boolean
          matched_my_group: boolean
          place_kind: string
          remaining_capacity: number
          requires_approval: boolean
          starts_at: string
          title: string
          venue_facilities: string[]
          venue_verification_status: string
          viewer_participation_state: string
        }[]
      }
      search_groups: {
        Args: {
          input_after_id?: string
          input_after_member_count?: number
          input_after_name?: string
          input_limit?: number
          input_query?: string
          input_team_id?: string
        }
        Returns: {
          active_member_count: number
          cursor_member_count: number
          cursor_name: string
          description: string
          group_id: string
          has_more: boolean
          name: string
          slug: string
          team_name: string
        }[]
      }
      set_venue_verification_status: {
        Args: {
          audit_request_id?: string
          input_status: string
          input_venue_id: string
        }
        Returns: boolean
      }
      store_public_address_search: {
        Args: {
          input_query_digest: string
          input_results: Json
          input_ttl_seconds: number
        }
        Returns: undefined
      }
      submit_moderation_appeal: {
        Args: {
          audit_request_id?: string
          input_action_id: string
          input_reason: string
        }
        Returns: {
          appeal_id: string
          status: string
        }[]
      }
      submit_profile_report: {
        Args: {
          audit_request_id?: string
          input_category: string
          input_details: string
          input_handle: string
        }
        Returns: {
          report_id: string
          status: string
        }[]
      }
      submit_report: {
        Args: {
          audit_request_id?: string
          input_category: string
          input_details: string
          input_target_id: string
          input_target_type: string
        }
        Returns: {
          report_id: string
          status: string
        }[]
      }
      suggest_similar_groups: {
        Args: {
          input_limit?: number
          input_name: string
          input_team_id: string
        }
        Returns: {
          group_id: string
          lifecycle: string
          name: string
          similarity_score: number
          slug: string
          team_name: string
        }[]
      }
      unban_group_member: {
        Args: {
          audit_request_id?: string
          input_group_id: string
          input_user_id: string
        }
        Returns: boolean
      }
      unblock_user: {
        Args: { audit_request_id?: string; target_handle: string }
        Returns: boolean
      }
      update_group_description: {
        Args: {
          audit_request_id?: string
          input_description: string
          input_group_id: string
        }
        Returns: {
          description: string
          lifecycle: string
        }[]
      }
      update_group_rule: {
        Args: {
          audit_request_id?: string
          input_published: boolean
          input_rule_id: string
          input_text: string
        }
        Returns: {
          published_at: string
          rule_id: string
          rule_position: number
          rule_text: string
        }[]
      }
      update_venue: {
        Args: {
          audit_request_id?: string
          input_address_text: string
          input_description: string
          input_latitude: number
          input_longitude: number
          input_name: string
          input_screen_count: number
          input_slug: string
          input_stated_capacity: number
          input_venue_id: string
        }
        Returns: {
          slug: string
          venue_id: string
          verification_status: string
        }[]
      }
      update_venue_workspace: {
        Args: {
          audit_request_id?: string
          input_address_text: string
          input_default_requires_approval: boolean
          input_description: string
          input_facilities: string[]
          input_house_information: string
          input_latitude: number
          input_longitude: number
          input_name: string
          input_slug: string
          input_venue_id: string
        }
        Returns: {
          slug: string
          venue_id: string
          verification_status: string
        }[]
      }
      update_venue_workspace_v2: {
        Args: {
          audit_request_id?: string
          input_address_text: string
          input_default_attendance_mode: string
          input_default_requires_approval: boolean
          input_description: string
          input_facilities: string[]
          input_house_information: string
          input_latitude: number
          input_longitude: number
          input_name: string
          input_slug: string
          input_venue_id: string
        }
        Returns: {
          slug: string
          venue_id: string
          verification_status: string
        }[]
      }
      viewer_is_platform_moderator: { Args: never; Returns: boolean }
      withdraw_group_event_submission: {
        Args: { audit_request_id?: string; input_event_id: string }
        Returns: boolean
      }
    }
    Enums: {
      appeal_status: "open" | "reviewing" | "upheld" | "modified" | "reversed"
      attendance_source: "self_request" | "direct_invite"
      attendance_status:
        | "requested"
        | "approved"
        | "declined"
        | "left"
        | "removed"
      event_attendance_mode: "reservations" | "open_door"
      event_audience:
        | "public"
        | "team_followers"
        | "group"
        | "friends"
        | "invite_only"
      event_place_kind: "home" | "venue" | "public_place"
      event_status:
        | "draft"
        | "pending_group_review"
        | "published"
        | "cancelled"
        | "completed"
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
      invitation_status: "pending" | "accepted" | "declined" | "revoked"
      moderation_action_kind:
        | "content_correction"
        | "warning"
        | "feature_restriction"
        | "temporary_suspension"
        | "event_cancellation"
        | "group_suspension"
        | "venue_suspension"
        | "permanent_account_ban"
      moderation_target_type: "profile" | "group" | "venue" | "event"
      platform_role: "moderator" | "admin"
      provider_sync_status: "running" | "succeeded" | "failed"
      report_category:
        | "immediate_danger"
        | "harassment_stalking_sexual_misconduct"
        | "hate_discrimination"
        | "privacy_exposure"
        | "impersonation_fraud"
        | "dangerous_illegal_activity"
        | "spam_scam"
        | "other"
      report_status: "open" | "reviewing" | "resolved" | "dismissed"
      sports_match_status:
        | "scheduled"
        | "timed"
        | "postponed"
        | "cancelled"
        | "finished"
      subscription_kind: "sport" | "competition" | "team"
      venue_facility:
        | "wheelchair_accessible"
        | "step_free_access"
        | "accessible_toilet"
        | "hearing_loop"
        | "parking"
        | "food"
        | "drinks"
      venue_member_role: "owner" | "admin"
      venue_membership_status: "active" | "revoked"
      venue_verification_status: "unverified" | "verified" | "suspended"
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
      appeal_status: ["open", "reviewing", "upheld", "modified", "reversed"],
      attendance_source: ["self_request", "direct_invite"],
      attendance_status: [
        "requested",
        "approved",
        "declined",
        "left",
        "removed",
      ],
      event_attendance_mode: ["reservations", "open_door"],
      event_audience: [
        "public",
        "team_followers",
        "group",
        "friends",
        "invite_only",
      ],
      event_place_kind: ["home", "venue", "public_place"],
      event_status: [
        "draft",
        "pending_group_review",
        "published",
        "cancelled",
        "completed",
      ],
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
      invitation_status: ["pending", "accepted", "declined", "revoked"],
      moderation_action_kind: [
        "content_correction",
        "warning",
        "feature_restriction",
        "temporary_suspension",
        "event_cancellation",
        "group_suspension",
        "venue_suspension",
        "permanent_account_ban",
      ],
      moderation_target_type: ["profile", "group", "venue", "event"],
      platform_role: ["moderator", "admin"],
      provider_sync_status: ["running", "succeeded", "failed"],
      report_category: [
        "immediate_danger",
        "harassment_stalking_sexual_misconduct",
        "hate_discrimination",
        "privacy_exposure",
        "impersonation_fraud",
        "dangerous_illegal_activity",
        "spam_scam",
        "other",
      ],
      report_status: ["open", "reviewing", "resolved", "dismissed"],
      sports_match_status: [
        "scheduled",
        "timed",
        "postponed",
        "cancelled",
        "finished",
      ],
      subscription_kind: ["sport", "competition", "team"],
      venue_facility: [
        "wheelchair_accessible",
        "step_free_access",
        "accessible_toilet",
        "hearing_loop",
        "parking",
        "food",
        "drinks",
      ],
      venue_member_role: ["owner", "admin"],
      venue_membership_status: ["active", "revoked"],
      venue_verification_status: ["unverified", "verified", "suspended"],
    },
  },
} as const
