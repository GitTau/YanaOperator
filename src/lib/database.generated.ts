// Generated from the live Supabase project (kaoelfcaiegjjhyrrlak), schema public, on 2026-10-14.
// Command: supabase gen types typescript --linked --schema public
// Do NOT edit by hand. Regenerate after any schema change (next due: after the lockdown
// migrations A-C go live, which add collections, ecord_razorpay_payment, ooking_amount_due).
// App-level domain types (Store, Vehicle, BookingWithDetails, ...) stay in ./database.types.ts.
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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      appraisal_cycles: {
        Row: {
          created_at: string | null
          end_date: string
          id: string
          label: string
          start_date: string
          status: string
        }
        Insert: {
          created_at?: string | null
          end_date: string
          id?: string
          label: string
          start_date: string
          status: string
        }
        Update: {
          created_at?: string | null
          end_date?: string
          id?: string
          label?: string
          start_date?: string
          status?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          id: string
          message: string
          operator_id: string
          reason: string
          store_id: string | null
          timestamp: string | null
          type: Database["public"]["Enums"]["log_type"]
        }
        Insert: {
          id?: string
          message: string
          operator_id: string
          reason: string
          store_id?: string | null
          timestamp?: string | null
          type: Database["public"]["Enums"]["log_type"]
        }
        Update: {
          id?: string
          message?: string
          operator_id?: string
          reason?: string
          store_id?: string | null
          timestamp?: string | null
          type?: Database["public"]["Enums"]["log_type"]
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["store_id"]
          },
        ]
      }
      batteries: {
        Row: {
          assigned_vehicle_id: string | null
          created_at: string | null
          id: string
          serial_number: string
          status: Database["public"]["Enums"]["battery_status"] | null
          store_id: string | null
        }
        Insert: {
          assigned_vehicle_id?: string | null
          created_at?: string | null
          id?: string
          serial_number: string
          status?: Database["public"]["Enums"]["battery_status"] | null
          store_id?: string | null
        }
        Update: {
          assigned_vehicle_id?: string | null
          created_at?: string | null
          id?: string
          serial_number?: string
          status?: Database["public"]["Enums"]["battery_status"] | null
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batteries_assigned_vehicle_fk"
            columns: ["assigned_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batteries_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["store_id"]
          },
        ]
      }
      bookings: {
        Row: {
          amount_paid: number | null
          amount_paid_cash: number | null
          amount_paid_online: number | null
          battery_id: string | null
          charger_id: string | null
          checklist: string[] | null
          completed_at: string | null
          created_at: string | null
          customer_id: string | null
          deposit_amount: number | null
          end_date: string | null
          fines_amount: number | null
          id: string
          is_settled: boolean | null
          notes: string | null
          pause_end_at: string | null
          pause_reason: string | null
          paused_at: string | null
          rental_plan: Database["public"]["Enums"]["rental_plan"]
          start_date: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["booking_status"] | null
          store_id: string | null
          total_amount: number | null
          vehicle_id: string | null
        }
        Insert: {
          amount_paid?: number | null
          amount_paid_cash?: number | null
          amount_paid_online?: number | null
          battery_id?: string | null
          charger_id?: string | null
          checklist?: string[] | null
          completed_at?: string | null
          created_at?: string | null
          customer_id?: string | null
          deposit_amount?: number | null
          end_date?: string | null
          fines_amount?: number | null
          id?: string
          is_settled?: boolean | null
          notes?: string | null
          pause_end_at?: string | null
          pause_reason?: string | null
          paused_at?: string | null
          rental_plan: Database["public"]["Enums"]["rental_plan"]
          start_date?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["booking_status"] | null
          store_id?: string | null
          total_amount?: number | null
          vehicle_id?: string | null
        }
        Update: {
          amount_paid?: number | null
          amount_paid_cash?: number | null
          amount_paid_online?: number | null
          battery_id?: string | null
          charger_id?: string | null
          checklist?: string[] | null
          completed_at?: string | null
          created_at?: string | null
          customer_id?: string | null
          deposit_amount?: number | null
          end_date?: string | null
          fines_amount?: number | null
          id?: string
          is_settled?: boolean | null
          notes?: string | null
          pause_end_at?: string | null
          pause_reason?: string | null
          paused_at?: string | null
          rental_plan?: Database["public"]["Enums"]["rental_plan"]
          start_date?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["booking_status"] | null
          store_id?: string | null
          total_amount?: number | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_battery_id_fkey"
            columns: ["battery_id"]
            isOneToOne: false
            referencedRelation: "batteries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_charger_id_fkey"
            columns: ["charger_id"]
            isOneToOne: false
            referencedRelation: "chargers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["store_id"]
          },
          {
            foreignKeyName: "bookings_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      captains: {
        Row: {
          auth_user_id: string | null
          created_at: string | null
          id: string
          joined_date: string
          login_id: string | null
          name: string
          phone: string | null
          push_token: string | null
          status: string
          store_id: string | null
          zap_point: string | null
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string | null
          id?: string
          joined_date?: string
          login_id?: string | null
          name: string
          phone?: string | null
          push_token?: string | null
          status?: string
          store_id?: string | null
          zap_point?: string | null
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string | null
          id?: string
          joined_date?: string
          login_id?: string | null
          name?: string
          phone?: string | null
          push_token?: string | null
          status?: string
          store_id?: string | null
          zap_point?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "captains_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["store_id"]
          },
        ]
      }
      chargers: {
        Row: {
          ah_rating: string | null
          assigned_vehicle_id: string | null
          created_at: string | null
          id: string
          serial_number: string
          status: string
          store_id: string
        }
        Insert: {
          ah_rating?: string | null
          assigned_vehicle_id?: string | null
          created_at?: string | null
          id?: string
          serial_number: string
          status?: string
          store_id: string
        }
        Update: {
          ah_rating?: string | null
          assigned_vehicle_id?: string | null
          created_at?: string | null
          id?: string
          serial_number?: string
          status?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chargers_assigned_vehicle_id_fkey"
            columns: ["assigned_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chargers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["store_id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          applies_to: string[]
          description: string
          fine_amount: number
          icon_name: string
          id: number
          is_active: boolean
          item_key: string
          label: string
          sort_order: number
        }
        Insert: {
          applies_to?: string[]
          description?: string
          fine_amount?: number
          icon_name?: string
          id?: number
          is_active?: boolean
          item_key: string
          label: string
          sort_order?: number
        }
        Update: {
          applies_to?: string[]
          description?: string
          fine_amount?: number
          icon_name?: string
          id?: number
          is_active?: boolean
          item_key?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      customer_auth_links: {
        Row: {
          auth_user_id: string
          customer_id: string
          id: string
          linked_at: string
          linked_by: string
          method: string
        }
        Insert: {
          auth_user_id: string
          customer_id: string
          id?: string
          linked_at?: string
          linked_by?: string
          method: string
        }
        Update: {
          auth_user_id?: string
          customer_id?: string
          id?: string
          linked_at?: string
          linked_by?: string
          method?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_auth_links_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_link_reviews: {
        Row: {
          auth_user_id: string
          candidate_customer_ids: string[]
          created_at: string
          id: string
          phone_e164: string
          reason: string
          resolved_at: string | null
          resolved_by: string | null
          resolved_customer_id: string | null
          status: string
        }
        Insert: {
          auth_user_id: string
          candidate_customer_ids?: string[]
          created_at?: string
          id?: string
          phone_e164: string
          reason: string
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_customer_id?: string | null
          status?: string
        }
        Update: {
          auth_user_id?: string
          candidate_customer_ids?: string[]
          created_at?: string
          id?: string
          phone_e164?: string
          reason?: string
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_customer_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_link_reviews_resolved_customer_id_fkey"
            columns: ["resolved_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          aadhar_no: string | null
          account_holder_name: string | null
          account_number: string | null
          address: string | null
          agreement_accepted: boolean | null
          bank_name: string | null
          created_at: string | null
          dob: string | null
          email: string | null
          emergency_contact_1: string | null
          emergency_contact_2: string | null
          end_date: string | null
          id: string
          ifsc_code: string | null
          kyc_status: boolean | null
          name: string
          pan_no: string | null
          phone: string
          start_date: string | null
          store_id: string | null
          upi_id: string | null
        }
        Insert: {
          aadhar_no?: string | null
          account_holder_name?: string | null
          account_number?: string | null
          address?: string | null
          agreement_accepted?: boolean | null
          bank_name?: string | null
          created_at?: string | null
          dob?: string | null
          email?: string | null
          emergency_contact_1?: string | null
          emergency_contact_2?: string | null
          end_date?: string | null
          id?: string
          ifsc_code?: string | null
          kyc_status?: boolean | null
          name: string
          pan_no?: string | null
          phone: string
          start_date?: string | null
          store_id?: string | null
          upi_id?: string | null
        }
        Update: {
          aadhar_no?: string | null
          account_holder_name?: string | null
          account_number?: string | null
          address?: string | null
          agreement_accepted?: boolean | null
          bank_name?: string | null
          created_at?: string | null
          dob?: string | null
          email?: string | null
          emergency_contact_1?: string | null
          emergency_contact_2?: string | null
          end_date?: string | null
          id?: string
          ifsc_code?: string | null
          kyc_status?: boolean | null
          name?: string
          pan_no?: string | null
          phone?: string
          start_date?: string | null
          store_id?: string | null
          upi_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["store_id"]
          },
        ]
      }
      cycle_results: {
        Row: {
          captain_id: string
          computed_at: string | null
          count_a: number | null
          count_e: number | null
          count_m: number | null
          cycle_id: string
          final_grade: Database["public"]["Enums"]["performance_group"]
          id: string
          next_cycle_bonus: number | null
          total_weeks: number | null
        }
        Insert: {
          captain_id: string
          computed_at?: string | null
          count_a?: number | null
          count_e?: number | null
          count_m?: number | null
          cycle_id: string
          final_grade: Database["public"]["Enums"]["performance_group"]
          id?: string
          next_cycle_bonus?: number | null
          total_weeks?: number | null
        }
        Update: {
          captain_id?: string
          computed_at?: string | null
          count_a?: number | null
          count_e?: number | null
          count_m?: number | null
          cycle_id?: string
          final_grade?: Database["public"]["Enums"]["performance_group"]
          id?: string
          next_cycle_bonus?: number | null
          total_weeks?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cycle_results_captain_id_fkey"
            columns: ["captain_id"]
            isOneToOne: false
            referencedRelation: "captains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cycle_results_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "appraisal_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          bill_url: string | null
          category: string
          created_at: string | null
          date: string
          expense_type: string
          id: string
          notes: string | null
          store_id: string | null
        }
        Insert: {
          amount: number
          bill_url?: string | null
          category: string
          created_at?: string | null
          date: string
          expense_type: string
          id?: string
          notes?: string | null
          store_id?: string | null
        }
        Update: {
          amount?: number
          bill_url?: string | null
          category?: string
          created_at?: string | null
          date?: string
          expense_type?: string
          id?: string
          notes?: string | null
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["store_id"]
          },
        ]
      }
      global_config: {
        Row: {
          gst_percentage: number
          id: number
          monthly_rate: number
          security_deposit: number
          updated_at: string | null
          weekly_rate: number
        }
        Insert: {
          gst_percentage: number
          id?: number
          monthly_rate: number
          security_deposit: number
          updated_at?: string | null
          weekly_rate: number
        }
        Update: {
          gst_percentage?: number
          id?: number
          monthly_rate?: number
          security_deposit?: number
          updated_at?: string | null
          weekly_rate?: number
        }
        Relationships: []
      }
      inventory_transactions: {
        Row: {
          balance_after: number
          condition: string
          created_at: string
          donor_vehicle_id: string | null
          id: string
          job_card_id: string | null
          notes: string | null
          part_id: string
          performed_by: string | null
          purchase_request_id: string | null
          quantity: number
          store_id: string
          target_store_id: string | null
          transaction_type: string
          unit_cost: number
        }
        Insert: {
          balance_after: number
          condition?: string
          created_at?: string
          donor_vehicle_id?: string | null
          id?: string
          job_card_id?: string | null
          notes?: string | null
          part_id: string
          performed_by?: string | null
          purchase_request_id?: string | null
          quantity: number
          store_id: string
          target_store_id?: string | null
          transaction_type: string
          unit_cost?: number
        }
        Update: {
          balance_after?: number
          condition?: string
          created_at?: string
          donor_vehicle_id?: string | null
          id?: string
          job_card_id?: string | null
          notes?: string | null
          part_id?: string
          performed_by?: string | null
          purchase_request_id?: string | null
          quantity?: number
          store_id?: string
          target_store_id?: string | null
          transaction_type?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_donor_vehicle_id_fkey"
            columns: ["donor_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["store_id"]
          },
          {
            foreignKeyName: "inventory_transactions_target_store_id_fkey"
            columns: ["target_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["store_id"]
          },
        ]
      }
      job_card_parts: {
        Row: {
          condition: string
          donor_vehicle_id: string | null
          id: string
          installed_at: string
          installed_by: string | null
          inventory_transaction_id: string | null
          job_card_id: string
          part_id: string
          quantity: number
          source_type: string
          unit_cost: number
        }
        Insert: {
          condition?: string
          donor_vehicle_id?: string | null
          id?: string
          installed_at?: string
          installed_by?: string | null
          inventory_transaction_id?: string | null
          job_card_id: string
          part_id: string
          quantity?: number
          source_type: string
          unit_cost?: number
        }
        Update: {
          condition?: string
          donor_vehicle_id?: string | null
          id?: string
          installed_at?: string
          installed_by?: string | null
          inventory_transaction_id?: string | null
          job_card_id?: string
          part_id?: string
          quantity?: number
          source_type?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_card_parts_donor_vehicle_id_fkey"
            columns: ["donor_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_card_parts_inventory_transaction_id_fkey"
            columns: ["inventory_transaction_id"]
            isOneToOne: false
            referencedRelation: "inventory_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_card_parts_job_card_id_fkey"
            columns: ["job_card_id"]
            isOneToOne: false
            referencedRelation: "job_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_card_parts_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      job_cards: {
        Row: {
          assigned_mechanic_id: string | null
          closed_at: string | null
          created_at: string
          diagnosis: string | null
          final_test_notes: string | null
          id: string
          job_card_number: string
          labour_cost: number
          odometer_km: number
          parts_cost: number
          priority: string
          qc_inspector_id: string | null
          repair_notes: string | null
          reported_by: string | null
          reported_issue: string
          roadworthiness_confirmed: boolean
          severity: string
          status: string
          store_id: string
          total_cost: number | null
          trigger_type: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          assigned_mechanic_id?: string | null
          closed_at?: string | null
          created_at?: string
          diagnosis?: string | null
          final_test_notes?: string | null
          id?: string
          job_card_number?: string
          labour_cost?: number
          odometer_km?: number
          parts_cost?: number
          priority?: string
          qc_inspector_id?: string | null
          repair_notes?: string | null
          reported_by?: string | null
          reported_issue: string
          roadworthiness_confirmed?: boolean
          severity?: string
          status?: string
          store_id: string
          total_cost?: number | null
          trigger_type?: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          assigned_mechanic_id?: string | null
          closed_at?: string | null
          created_at?: string
          diagnosis?: string | null
          final_test_notes?: string | null
          id?: string
          job_card_number?: string
          labour_cost?: number
          odometer_km?: number
          parts_cost?: number
          priority?: string
          qc_inspector_id?: string | null
          repair_notes?: string | null
          reported_by?: string | null
          reported_issue?: string
          roadworthiness_confirmed?: boolean
          severity?: string
          status?: string
          store_id?: string
          total_cost?: number | null
          trigger_type?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_cards_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["store_id"]
          },
          {
            foreignKeyName: "job_cards_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_jobs: {
        Row: {
          closed_at: string | null
          created_at: string | null
          description: string
          id: string
          labour_cost: number | null
          parts_cost: number | null
          parts_used: Json | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string | null
          store_id: string | null
          vehicle_id: string | null
        }
        Insert: {
          closed_at?: string | null
          created_at?: string | null
          description: string
          id?: string
          labour_cost?: number | null
          parts_cost?: number | null
          parts_used?: Json | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          store_id?: string | null
          vehicle_id?: string | null
        }
        Update: {
          closed_at?: string | null
          created_at?: string | null
          description?: string
          id?: string
          labour_cost?: number | null
          parts_cost?: number | null
          parts_used?: Json | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          store_id?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_jobs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["store_id"]
          },
          {
            foreignKeyName: "maintenance_jobs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      n8n_chat_histories: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          captain_id: string | null
          created_at: string | null
          data: Json | null
          id: string
          is_read: boolean
          store_id: string | null
          title: string
          type: string
        }
        Insert: {
          body: string
          captain_id?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          is_read?: boolean
          store_id?: string | null
          title: string
          type?: string
        }
        Update: {
          body?: string
          captain_id?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          is_read?: boolean
          store_id?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_captain_id_fkey"
            columns: ["captain_id"]
            isOneToOne: false
            referencedRelation: "captains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["store_id"]
          },
        ]
      }
      part_model_compatibility: {
        Row: {
          id: string
          model_id: string
          notes: string | null
          part_id: string
        }
        Insert: {
          id?: string
          model_id: string
          notes?: string | null
          part_id: string
        }
        Update: {
          id?: string
          model_id?: string
          notes?: string | null
          part_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "part_model_compatibility_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "vehicle_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_model_compatibility_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      parts_catalog: {
        Row: {
          base_price: number
          category: string
          created_at: string
          gst_rate: number
          id: string
          is_active: boolean
          mrp: number
          name: string
          part_code: string
          subpart: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          base_price?: number
          category: string
          created_at?: string
          gst_rate?: number
          id?: string
          is_active?: boolean
          mrp?: number
          name: string
          part_code: string
          subpart?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          base_price?: number
          category?: string
          created_at?: string
          gst_rate?: number
          id?: string
          is_active?: boolean
          mrp?: number
          name?: string
          part_code?: string
          subpart?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      parts_inventory: {
        Row: {
          assumed_cost: number
          base_price: number
          created_at: string
          gst_amount: number
          id: string
          part_name: string
          problem_description: string
          stock_qty: number
          subpart: string
          total_price: number
        }
        Insert: {
          assumed_cost?: number
          base_price?: number
          created_at?: string
          gst_amount?: number
          id?: string
          part_name: string
          problem_description?: string
          stock_qty?: number
          subpart?: string
          total_price?: number
        }
        Update: {
          assumed_cost?: number
          base_price?: number
          created_at?: string
          gst_amount?: number
          id?: string
          part_name?: string
          problem_description?: string
          stock_qty?: number
          subpart?: string
          total_price?: number
        }
        Relationships: []
      }
      Playground: {
        Row: {
          "Battery Type": string | null
          "Chasis No": string | null
          City: string | null
          Location: string | null
          Make: string | null
          Model: string | null
          "S No": number
          State: string | null
          Supervisor: string | null
          Type: string | null
          "Type of Connector": string | null
          "Zap Point": string | null
        }
        Insert: {
          "Battery Type"?: string | null
          "Chasis No"?: string | null
          City?: string | null
          Location?: string | null
          Make?: string | null
          Model?: string | null
          "S No": number
          State?: string | null
          Supervisor?: string | null
          Type?: string | null
          "Type of Connector"?: string | null
          "Zap Point"?: string | null
        }
        Update: {
          "Battery Type"?: string | null
          "Chasis No"?: string | null
          City?: string | null
          Location?: string | null
          Make?: string | null
          Model?: string | null
          "S No"?: number
          State?: string | null
          Supervisor?: string | null
          Type?: string | null
          "Type of Connector"?: string | null
          "Zap Point"?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          captain_id: string | null
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          store_id: string | null
        }
        Insert: {
          captain_id?: string | null
          created_at?: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          store_id?: string | null
        }
        Update: {
          captain_id?: string | null
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_captain_id_fkey"
            columns: ["captain_id"]
            isOneToOne: false
            referencedRelation: "captains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["store_id"]
          },
        ]
      }
      purchase_requests: {
        Row: {
          approved_by: string | null
          created_at: string
          fulfilled_at: string | null
          id: string
          part_id: string
          quantity_requested: number
          reason: string | null
          request_number: string
          requested_by: string | null
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          fulfilled_at?: string | null
          id?: string
          part_id: string
          quantity_requested: number
          reason?: string | null
          request_number?: string
          requested_by?: string | null
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          fulfilled_at?: string | null
          id?: string
          part_id?: string
          quantity_requested?: number
          reason?: string | null
          request_number?: string
          requested_by?: string | null
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_requests_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["store_id"]
          },
        ]
      }
      rider_heartbeats: {
        Row: {
          app_version: string | null
          battery_percentage: number | null
          booking_id: string | null
          created_at: string | null
          customer_id: string | null
          device_online: boolean
          gps_enabled: boolean
          id: string
          network_available: boolean
        }
        Insert: {
          app_version?: string | null
          battery_percentage?: number | null
          booking_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          device_online?: boolean
          gps_enabled?: boolean
          id?: string
          network_available?: boolean
        }
        Update: {
          app_version?: string | null
          battery_percentage?: number | null
          booking_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          device_online?: boolean
          gps_enabled?: boolean
          id?: string
          network_available?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "rider_heartbeats_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_heartbeats_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      rider_leads: {
        Row: {
          aadhar_last_4: string
          age: number
          city: string
          created_at: string
          current_platform: string
          delivery_experience: string
          full_name: string
          id: string
          mobile_number: string
        }
        Insert: {
          aadhar_last_4: string
          age: number
          city: string
          created_at?: string
          current_platform: string
          delivery_experience: string
          full_name: string
          id?: string
          mobile_number: string
        }
        Update: {
          aadhar_last_4?: string
          age?: number
          city?: string
          created_at?: string
          current_platform?: string
          delivery_experience?: string
          full_name?: string
          id?: string
          mobile_number?: string
        }
        Relationships: []
      }
      rider_telemetry: {
        Row: {
          accuracy: number | null
          app_version: string | null
          battery_percentage: number | null
          booking_id: string | null
          created_at: string | null
          customer_id: string | null
          device_id: string | null
          heading: number | null
          id: string
          latitude: number
          longitude: number
          network_type: string | null
          speed: number | null
        }
        Insert: {
          accuracy?: number | null
          app_version?: string | null
          battery_percentage?: number | null
          booking_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          device_id?: string | null
          heading?: number | null
          id?: string
          latitude: number
          longitude: number
          network_type?: string | null
          speed?: number | null
        }
        Update: {
          accuracy?: number | null
          app_version?: string | null
          battery_percentage?: number | null
          booking_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          device_id?: string | null
          heading?: number | null
          id?: string
          latitude?: number
          longitude?: number
          network_type?: string | null
          speed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rider_telemetry_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_telemetry_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      store_inventory: {
        Row: {
          condition: string
          id: string
          part_id: string
          quantity_on_hand: number
          reorder_level: number
          reorder_quantity: number
          store_id: string
          updated_at: string
        }
        Insert: {
          condition?: string
          id?: string
          part_id: string
          quantity_on_hand?: number
          reorder_level?: number
          reorder_quantity?: number
          store_id: string
          updated_at?: string
        }
        Update: {
          condition?: string
          id?: string
          part_id?: string
          quantity_on_hand?: number
          reorder_level?: number
          reorder_quantity?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_inventory_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_inventory_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["store_id"]
          },
        ]
      }
      stores: {
        Row: {
          created_at: string | null
          location: string
          name: string
          state_name: string
          store_id: string
          target_rentals: number | null
        }
        Insert: {
          created_at?: string | null
          location: string
          name: string
          state_name: string
          store_id?: string
          target_rentals?: number | null
        }
        Update: {
          created_at?: string | null
          location?: string
          name?: string
          state_name?: string
          store_id?: string
          target_rentals?: number | null
        }
        Relationships: []
      }
      task_entries: {
        Row: {
          captain_id: string
          created_at: string | null
          cycle_id: string | null
          date: string
          id: string
          is_override_zero: boolean | null
          is_recurring: boolean | null
          operator_remarks: string | null
          override_reason: string | null
          rated_by: string | null
          remarks: string | null
          stars: number | null
          status: Database["public"]["Enums"]["task_status"] | null
          task_name: string
          task_type: Database["public"]["Enums"]["task_type"]
          week_number: number
        }
        Insert: {
          captain_id: string
          created_at?: string | null
          cycle_id?: string | null
          date: string
          id?: string
          is_override_zero?: boolean | null
          is_recurring?: boolean | null
          operator_remarks?: string | null
          override_reason?: string | null
          rated_by?: string | null
          remarks?: string | null
          stars?: number | null
          status?: Database["public"]["Enums"]["task_status"] | null
          task_name: string
          task_type: Database["public"]["Enums"]["task_type"]
          week_number: number
        }
        Update: {
          captain_id?: string
          created_at?: string | null
          cycle_id?: string | null
          date?: string
          id?: string
          is_override_zero?: boolean | null
          is_recurring?: boolean | null
          operator_remarks?: string | null
          override_reason?: string | null
          rated_by?: string | null
          remarks?: string | null
          stars?: number | null
          status?: Database["public"]["Enums"]["task_status"] | null
          task_name?: string
          task_type?: Database["public"]["Enums"]["task_type"]
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "task_entries_captain_id_fkey"
            columns: ["captain_id"]
            isOneToOne: false
            referencedRelation: "captains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_entries_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "appraisal_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_checklists: {
        Row: {
          booking_id: string | null
          flow: string
          id: string
          item_notes: Json
          item_states: Json
          store_id: string
          submitted_at: string
          submitted_by: string | null
          vehicle_id: string
        }
        Insert: {
          booking_id?: string | null
          flow: string
          id?: string
          item_notes?: Json
          item_states?: Json
          store_id: string
          submitted_at?: string
          submitted_by?: string | null
          vehicle_id: string
        }
        Update: {
          booking_id?: string | null
          flow?: string
          id?: string
          item_notes?: Json
          item_states?: Json
          store_id?: string
          submitted_at?: string
          submitted_by?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_checklists_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_checklists_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["store_id"]
          },
          {
            foreignKeyName: "vehicle_checklists_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_checklists_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_donor_history: {
        Row: {
          condition: string
          donor_vehicle_id: string
          harvested_at: string
          id: string
          job_card_id: string | null
          notes: string | null
          part_id: string
          recipient_vehicle_id: string | null
          removed_by: string | null
        }
        Insert: {
          condition?: string
          donor_vehicle_id: string
          harvested_at?: string
          id?: string
          job_card_id?: string | null
          notes?: string | null
          part_id: string
          recipient_vehicle_id?: string | null
          removed_by?: string | null
        }
        Update: {
          condition?: string
          donor_vehicle_id?: string
          harvested_at?: string
          id?: string
          job_card_id?: string | null
          notes?: string | null
          part_id?: string
          recipient_vehicle_id?: string | null
          removed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_donor_history_donor_vehicle_id_fkey"
            columns: ["donor_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_donor_history_job_card_id_fkey"
            columns: ["job_card_id"]
            isOneToOne: false
            referencedRelation: "job_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_donor_history_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_donor_history_recipient_vehicle_id_fkey"
            columns: ["recipient_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_makes: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      vehicle_models: {
        Row: {
          created_at: string
          id: string
          make_id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          make_id: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          make_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_models_make_id_fkey"
            columns: ["make_id"]
            isOneToOne: false
            referencedRelation: "vehicle_makes"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          assigned_battery_id: string | null
          battery_type: string | null
          created_at: string | null
          id: string
          make: string | null
          model: string | null
          odometer_km: number
          plate_number: string
          status: Database["public"]["Enums"]["vehicle_status"] | null
          store_id: string | null
        }
        Insert: {
          assigned_battery_id?: string | null
          battery_type?: string | null
          created_at?: string | null
          id?: string
          make?: string | null
          model?: string | null
          odometer_km?: number
          plate_number: string
          status?: Database["public"]["Enums"]["vehicle_status"] | null
          store_id?: string | null
        }
        Update: {
          assigned_battery_id?: string | null
          battery_type?: string | null
          created_at?: string | null
          id?: string
          make?: string | null
          model?: string | null
          odometer_km?: number
          plate_number?: string
          status?: Database["public"]["Enums"]["vehicle_status"] | null
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_assigned_battery_id_fkey"
            columns: ["assigned_battery_id"]
            isOneToOne: false
            referencedRelation: "batteries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["store_id"]
          },
        ]
      }
      weekly_scores: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          avg_stars_emergency: number | null
          avg_stars_non_regular: number | null
          avg_stars_regular: number | null
          bonus_eligibility: number | null
          captain_id: string
          created_at: string | null
          cycle_id: string
          id: string
          overall_avg: number | null
          performance_group: Database["public"]["Enums"]["performance_group"]
          week_number: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          avg_stars_emergency?: number | null
          avg_stars_non_regular?: number | null
          avg_stars_regular?: number | null
          bonus_eligibility?: number | null
          captain_id: string
          created_at?: string | null
          cycle_id: string
          id?: string
          overall_avg?: number | null
          performance_group: Database["public"]["Enums"]["performance_group"]
          week_number: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          avg_stars_emergency?: number | null
          avg_stars_non_regular?: number | null
          avg_stars_regular?: number | null
          bonus_eligibility?: number | null
          captain_id?: string
          created_at?: string | null
          cycle_id?: string
          id?: string
          overall_avg?: number | null
          performance_group?: Database["public"]["Enums"]["performance_group"]
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "weekly_scores_captain_id_fkey"
            columns: ["captain_id"]
            isOneToOne: false
            referencedRelation: "captains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_scores_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "appraisal_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_store_inventory: {
        Args: {
          p_condition: string
          p_notes?: string
          p_part_id: string
          p_quantity_change: number
          p_store_id: string
          p_transaction_type: string
          p_unit_cost?: number
        }
        Returns: Json
      }
      admin_set_captain_credentials: {
        Args: { p_captain_id: string; p_login_id: string; p_password: string }
        Returns: Json
      }
      complete_job_card: {
        Args: {
          p_final_test_notes?: string
          p_job_card_id: string
          p_labour_cost?: number
          p_roadworthiness_confirmed: boolean
        }
        Returns: Json
      }
      consume_job_card_part: {
        Args: {
          p_condition?: string
          p_job_card_id: string
          p_part_id: string
          p_quantity?: number
        }
        Returns: Json
      }
      create_booking: {
        Args: {
          p_amount_paid: number
          p_battery_id: string
          p_charger_id?: string
          p_customer_id: string
          p_deposit_amount: number
          p_end_date?: string
          p_operator_id: string
          p_rental_plan: string
          p_start_date?: string
          p_status?: string
          p_store_id: string
          p_total_amount: number
          p_vehicle_id: string
        }
        Returns: string
      }
      create_job_card: {
        Args: {
          p_notes?: string
          p_odometer_km?: number
          p_priority?: string
          p_reported_issue: string
          p_severity: string
          p_store_id: string
          p_trigger_type: string
          p_vehicle_id: string
        }
        Returns: Json
      }
      current_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      current_store_id: { Args: never; Returns: string }
      decrement_part_stock: {
        Args: { p_cost: number; p_part_id: string; p_qty: number }
        Returns: undefined
      }
      dispatch_booking: {
        Args: {
          p_battery_id: string
          p_booking_id: string
          p_charger_id?: string
          p_operator_id?: string
          p_vehicle_id: string
        }
        Returns: undefined
      }
      link_rider_after_login: { Args: never; Returns: Json }
      normalize_phone_e164: { Args: { raw: string }; Returns: string }
      process_eod_task_rollover: {
        Args: { p_target_date?: string }
        Returns: Json
      }
      record_payment: {
        Args: {
          p_booking_id: string
          p_cash_amount: number
          p_online_amount: number
          p_operator_id: string
          p_store_id: string
        }
        Returns: undefined
      }
      record_salvaged_part: {
        Args: {
          p_condition?: string
          p_donor_vehicle_id: string
          p_job_card_id: string
          p_notes?: string
          p_part_id: string
        }
        Returns: Json
      }
      resolve_customer_link_review: {
        Args: { p_customer_id: string; p_review_id: string }
        Returns: Json
      }
      swap_assets: {
        Args: {
          p_additional_fines: number
          p_booking_id: string
          p_new_battery_id: string
          p_new_vehicle_id: string
          p_operator_id: string
          p_store_id: string
        }
        Returns: undefined
      }
      transfer_store_inventory: {
        Args: {
          p_condition: string
          p_notes?: string
          p_part_id: string
          p_quantity: number
          p_source_store_id: string
          p_target_store_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      battery_status: "Available" | "In Use" | "Maintenance"
      booking_status: "Draft" | "Active" | "Paused" | "Completed" | "Cancelled"
      log_type: "VEHICLE" | "BATTERY" | "BOOKING" | "MAINTENANCE" | "SYSTEM"
      performance_group: "E" | "M" | "A"
      rental_plan: "Weekly" | "Monthly"
      task_status: "done" | "not_done" | "pending"
      task_type: "regular" | "non_regular" | "emergency"
      user_role: "ADMIN" | "OPERATOR" | "RIDER" | "MECHANIC"
      vehicle_status: "Available" | "In Use" | "Maintenance" | "Inactive"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      battery_status: ["Available", "In Use", "Maintenance"],
      booking_status: ["Draft", "Active", "Paused", "Completed", "Cancelled"],
      log_type: ["VEHICLE", "BATTERY", "BOOKING", "MAINTENANCE", "SYSTEM"],
      performance_group: ["E", "M", "A"],
      rental_plan: ["Weekly", "Monthly"],
      task_status: ["done", "not_done", "pending"],
      task_type: ["regular", "non_regular", "emergency"],
      user_role: ["ADMIN", "OPERATOR", "RIDER", "MECHANIC"],
      vehicle_status: ["Available", "In Use", "Maintenance", "Inactive"],
    },
  },
} as const
