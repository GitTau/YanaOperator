// ─────────────────────────────────────────────────────────────────────────────
// TypeScript types for live Supabase schema (Yana Rentals DB)
// Source: SUPADATA.md — generated 2026-04-16
//
// UI terminology → DB terminology mapping:
//   ZAP Point     → stores
//   Rider         → customers
//   Captain/Op    → profiles (role: OPERATOR)
//   Rental Plan   → bookings
//   Fleet asset   → vehicles / batteries
// ─────────────────────────────────────────────────────────────────────────────

export type UserRole = 'ADMIN' | 'OPERATOR' | 'RIDER';
export type VehicleStatus = 'Available' | 'In Use' | 'Maintenance' | 'Inactive';
export type BatteryStatus = 'Available' | 'In Use' | 'Maintenance';
export type BookingStatus = 'Draft' | 'Active' | 'Paused' | 'Completed' | 'Cancelled';
export type RentalPlan = 'Weekly' | 'Monthly';
export type LogType = 'VEHICLE' | 'BATTERY' | 'BOOKING' | 'MAINTENANCE' | 'SYSTEM';

// ── stores (ZAP Points) ──────────────────────────────────────────────────────
export interface Store {
  store_id: string;
  name: string;
  location: string;
  state_name: string;
  target_rentals: number;
  created_at: string;
}

// ── profiles (operators / admins) ────────────────────────────────────────────
export interface Profile {
  id: string; // matches auth.users.id
  role: UserRole;
  store_id: string | null;
  created_at: string;
}

// ── vehicles ─────────────────────────────────────────────────────────────────
export interface Vehicle {
  id: string;
  store_id: string;
  plate_number: string; // e.g. XEM01
  status: VehicleStatus;
  assigned_battery_id: string | null;
  created_at: string;
}

// ── batteries ────────────────────────────────────────────────────────────────
export interface Battery {
  id: string;
  store_id: string;
  serial_number: string; // e.g. EMO-B01
  status: BatteryStatus;
  assigned_vehicle_id: string | null;
  created_at: string;
}

// ── customers (Riders in Yana language) ─────────────────────────────────────
export interface Customer {
  id: string;
  store_id: string;
  name: string;
  phone: string; // UNIQUE
  email: string | null;
  dob: string | null;
  address: string | null;
  aadhar_no: string | null; // Always mask in UI: XXXX-XXXX-1234
  pan_no: string | null;
  emergency_contact_1: string | null;
  emergency_contact_2: string | null;
  kyc_status: boolean;
  agreement_accepted: boolean;
  bank_name: string | null;
  account_holder_name: string | null;
  account_number: string | null;
  ifsc_code: string | null;
  upi_id: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

// ── bookings (Rental Plans in Yana language) ─────────────────────────────────
export interface Booking {
  id: string;
  customer_id: string;
  vehicle_id: string;
  battery_id: string;
  store_id: string;
  status: BookingStatus;
  rental_plan: RentalPlan;
  total_amount: number;
  deposit_amount: number;
  fines_amount: number;
  amount_paid: number;
  is_settled: boolean;
  checklist: string[] | null;
  created_at: string;
  started_at: string | null;
  paused_at: string | null;
  completed_at: string | null;
  pause_reason: string | null;
  notes: string | null;
}

// Booking with joined customer + vehicle + battery data (for rental cards)
export interface BookingWithDetails extends Booking {
  customer: Customer;
  vehicle: Vehicle;
  battery: Battery;
}

// ── maintenance_jobs ─────────────────────────────────────────────────────────
export interface MaintenanceJob {
  id: string;
  vehicle_id: string;
  store_id: string;
  status: string; // 'Open' | 'In Progress' | 'Closed'
  description: string;
  resolution_notes: string | null;
  created_at: string;
  closed_at: string | null;
}

// ── global_config (singleton, id=1) ─────────────────────────────────────────
export interface GlobalConfig {
  id: number;
  weekly_rate: number;
  monthly_rate: number;
  security_deposit: number;
  gst_percentage: number;
  // Configurable booking cutoff time (hour in IST, 0-23).
  // Default = 17 (5 PM IST) per business rules.
  // Stored as integer hour. If null, no cutoff enforced.
  booking_cutoff_hour?: number;
  updated_at: string;
}

// ── audit_logs ───────────────────────────────────────────────────────────────
export interface AuditLog {
  id: string;
  store_id: string;
  operator_id: string;
  type: LogType;
  message: string;
  reason: string;
  timestamp: string;
}

// ── RPC parameters ───────────────────────────────────────────────────────────
export interface CreateBookingParams {
  p_customer_id: string;
  p_vehicle_id: string;
  p_battery_id: string;
  p_store_id: string;
  p_rental_plan: RentalPlan;
  p_total_amount: number;
  p_deposit_amount: number;
  p_amount_paid: number;
  p_operator_id: string;
}

export interface RecordPaymentParams {
  p_booking_id: string;
  p_store_id: string;
  p_amount: number;
  p_operator_id: string;
}

export interface SwapAssetsParams {
  p_booking_id: string;
  p_store_id: string;
  p_new_vehicle_id: string;
  p_new_battery_id: string;
  p_additional_fines: number;
  p_operator_id: string;
}

// ── Database shape for supabase-js generics ───────────────────────────────────
export interface Database {
  public: {
    Tables: {
      stores: { Row: Store; Insert: Omit<Store, 'store_id' | 'created_at'>; Update: Partial<Store> };
      profiles: { Row: Profile; Insert: Omit<Profile, 'created_at'>; Update: Partial<Profile> };
      vehicles: { Row: Vehicle; Insert: Omit<Vehicle, 'id' | 'created_at'>; Update: Partial<Vehicle> };
      batteries: { Row: Battery; Insert: Omit<Battery, 'id' | 'created_at'>; Update: Partial<Battery> };
      customers: { Row: Customer; Insert: Omit<Customer, 'id' | 'created_at'>; Update: Partial<Customer> };
      bookings: { Row: Booking; Insert: Omit<Booking, 'id' | 'created_at'>; Update: Partial<Booking> };
      maintenance_jobs: { Row: MaintenanceJob; Insert: Omit<MaintenanceJob, 'id' | 'created_at'>; Update: Partial<MaintenanceJob> };
      global_config: { Row: GlobalConfig; Insert: Omit<GlobalConfig, 'updated_at'>; Update: Partial<GlobalConfig> };
      audit_logs: { Row: AuditLog; Insert: Omit<AuditLog, 'id' | 'timestamp'>; Update: Partial<AuditLog> };
    };
    Functions: {
      create_booking: { Args: CreateBookingParams; Returns: string };
      record_payment: { Args: RecordPaymentParams; Returns: void };
      swap_assets: { Args: SwapAssetsParams; Returns: void };
      current_role: { Args: Record<string, never>; Returns: UserRole };
      current_store_id: { Args: Record<string, never>; Returns: string };
    };
    Enums: {
      vehicle_status: VehicleStatus;
      battery_status: BatteryStatus;
      booking_status: BookingStatus;
      rental_plan: RentalPlan;
      user_role: UserRole;
      log_type: LogType;
    };
  };
}
