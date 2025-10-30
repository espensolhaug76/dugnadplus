/**
 * Dugnad+ Supabase Database Types
 * Type definitions for coordinator functionality
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      // Teams/Clubs
      teams: {
        Row: {
          id: string
          name: string
          sport: string
          age_group: string
          season: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          sport: string
          age_group: string
          season: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          sport?: string
          age_group?: string
          season?: string
          updated_at?: string
        }
      }
      
      // Families
      families: {
        Row: {
          id: string
          team_id: string
          family_name: string
          primary_email: string
          primary_phone: string
          base_points: number
          family_points: number
          total_points: number
          level: number
          protected_group: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          team_id: string
          family_name: string
          primary_email: string
          primary_phone: string
          base_points?: number
          family_points?: number
          total_points?: number
          level?: number
          protected_group?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          team_id?: string
          family_name?: string
          primary_email?: string
          primary_phone?: string
          base_points?: number
          family_points?: number
          total_points?: number
          level?: number
          protected_group?: boolean
          updated_at?: string
        }
      }
      
      // Users
      users: {
        Row: {
          id: string
          family_id: string
          email: string
          full_name: string
          role: 'parent' | 'coordinator' | 'coach' | 'team_leader'
          phone: string | null
          fcm_token: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          family_id: string
          email: string
          full_name: string
          role: 'parent' | 'coordinator' | 'coach' | 'team_leader'
          phone?: string | null
          fcm_token?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          family_id?: string
          email?: string
          full_name?: string
          role?: 'parent' | 'coordinator' | 'coach' | 'team_leader'
          phone?: string | null
          fcm_token?: string | null
          updated_at?: string
        }
      }
      
      // Shifts
      shifts: {
        Row: {
          id: string
          team_id: string
          date: string
          start_time: string
          end_time: string
          role: 'kiosk' | 'ticket_sales' | 'setup' | 'cleanup' | 'baking' | 'transport' | 'other'
          required_people: number
          point_value: number
          status: 'pending' | 'assigned' | 'confirmed' | 'completed' | 'cancelled'
          buffer_date: string
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          team_id: string
          date: string
          start_time: string
          end_time: string
          role: 'kiosk' | 'ticket_sales' | 'setup' | 'cleanup' | 'baking' | 'transport' | 'other'
          required_people: number
          point_value: number
          status?: 'pending' | 'assigned' | 'confirmed' | 'completed' | 'cancelled'
          buffer_date: string
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          team_id?: string
          date?: string
          start_time?: string
          end_time?: string
          role?: 'kiosk' | 'ticket_sales' | 'setup' | 'cleanup' | 'baking' | 'transport' | 'other'
          required_people?: number
          point_value?: number
          status?: 'pending' | 'assigned' | 'confirmed' | 'completed' | 'cancelled'
          buffer_date?: string
          created_by?: string
          updated_at?: string
        }
      }
      
      // Shift Assignments
      shift_assignments: {
        Row: {
          id: string
          shift_id: string
          family_id: string
          assigned_by: 'automatic' | 'manual' | 'volunteer'
          status: 'assigned' | 'confirmed' | 'completed' | 'no_show' | 'swapped' | 'cancelled'
          assigned_date: string
          confirmed_date: string | null
          completed_date: string | null
          notification_sent: boolean
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          shift_id: string
          family_id: string
          assigned_by?: 'automatic' | 'manual' | 'volunteer'
          status?: 'assigned' | 'confirmed' | 'completed' | 'no_show' | 'swapped' | 'cancelled'
          assigned_date: string
          confirmed_date?: string | null
          completed_date?: string | null
          notification_sent?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          shift_id?: string
          family_id?: string
          assigned_by?: 'automatic' | 'manual' | 'volunteer'
          status?: 'assigned' | 'confirmed' | 'completed' | 'no_show' | 'swapped' | 'cancelled'
          assigned_date?: string
          confirmed_date?: string | null
          completed_date?: string | null
          notification_sent?: boolean
          notes?: string | null
          updated_at?: string
        }
      }
      
      // Point History
      point_history: {
        Row: {
          id: string
          family_id: string
          point_type: 'base' | 'family' | 'bonus'
          points_earned: number
          reason: string
          related_shift_id: string | null
          related_role: string | null
          created_at: string
        }
        Insert: {
          id?: string
          family_id: string
          point_type: 'base' | 'family' | 'bonus'
          points_earned: number
          reason: string
          related_shift_id?: string | null
          related_role?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          family_id?: string
          point_type?: 'base' | 'family' | 'bonus'
          points_earned?: number
          reason?: string
          related_shift_id?: string | null
          related_role?: string | null
        }
      }
      
      // Shift Swaps
      shift_swaps: {
        Row: {
          id: string
          original_assignment_id: string
          requesting_family_id: string
          target_family_id: string | null
          status: 'pending' | 'accepted' | 'declined' | 'completed' | 'cancelled'
          request_message: string | null
          response_message: string | null
          requested_at: string
          responded_at: string | null
          completed_at: string | null
        }
        Insert: {
          id?: string
          original_assignment_id: string
          requesting_family_id: string
          target_family_id?: string | null
          status?: 'pending' | 'accepted' | 'declined' | 'completed' | 'cancelled'
          request_message?: string | null
          response_message?: string | null
          requested_at?: string
          responded_at?: string | null
          completed_at?: string | null
        }
        Update: {
          id?: string
          original_assignment_id?: string
          requesting_family_id?: string
          target_family_id?: string | null
          status?: 'pending' | 'accepted' | 'declined' | 'completed' | 'cancelled'
          request_message?: string | null
          response_message?: string | null
          responded_at?: string | null
          completed_at?: string | null
        }
      }
      
      // Substitutes (teenagers/adults offering services)
      substitutes: {
        Row: {
          id: string
          user_id: string
          full_name: string
          age: number
          hourly_rate_min: number
          hourly_rate_max: number
          available_roles: string[]
          rating: number
          total_jobs: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          full_name: string
          age: number
          hourly_rate_min: number
          hourly_rate_max: number
          available_roles: string[]
          rating?: number
          total_jobs?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          full_name?: string
          age?: number
          hourly_rate_min?: number
          hourly_rate_max?: number
          available_roles?: string[]
          rating?: number
          total_jobs?: number
          is_active?: boolean
          updated_at?: string
        }
      }
      
      // Substitute Requests
      substitute_requests: {
        Row: {
          id: string
          shift_id: string
          requesting_family_id: string
          substitute_id: string | null
          status: 'open' | 'bidding' | 'accepted' | 'completed' | 'cancelled'
          offered_rate: number | null
          accepted_rate: number | null
          request_notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          shift_id: string
          requesting_family_id: string
          substitute_id?: string | null
          status?: 'open' | 'bidding' | 'accepted' | 'completed' | 'cancelled'
          offered_rate?: number | null
          accepted_rate?: number | null
          request_notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          shift_id?: string
          requesting_family_id?: string
          substitute_id?: string | null
          status?: 'open' | 'bidding' | 'accepted' | 'completed' | 'cancelled'
          offered_rate?: number | null
          accepted_rate?: number | null
          request_notes?: string | null
          updated_at?: string
        }
      }
      
      // Notifications
      notifications: {
        Row: {
          id: string
          user_id: string
          type: 'shift_assigned' | 'shift_reminder' | 'swap_request' | 'substitute_available' | 'points_earned'
          title: string
          body: string
          data: Json | null
          read: boolean
          sent_at: string
          read_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          type: 'shift_assigned' | 'shift_reminder' | 'swap_request' | 'substitute_available' | 'points_earned'
          title: string
          body: string
          data?: Json | null
          read?: boolean
          sent_at?: string
          read_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          type?: 'shift_assigned' | 'shift_reminder' | 'swap_request' | 'substitute_available' | 'points_earned'
          title?: string
          body?: string
          data?: Json | null
          read?: boolean
          read_at?: string | null
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
