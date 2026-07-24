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
export type ChargerStatus = 'Available' | 'In Use' | 'Maintenance';
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

// ── chargers ─────────────────────────────────────────────────────────────────
export interface Charger {
  id: string;
  store_id: string;
  serial_number: string;
  status: ChargerStatus;
  assigned_vehicle_id: string | null;
  created_at: string;
}

// ── bookings (Rental Plans in Yana language) ─────────────────────────────────
export interface Booking {
  id: string;
  customer_id: string;
  vehicle_id: string;
  battery_id: string;
  charger_id?: string | null;
  store_id: string;
  status: BookingStatus;
  rental_plan: RentalPlan;
  total_amount: number;
  deposit_amount: number;
  fines_amount: number;
  amount_paid: number;
  amount_paid_cash: number | null;
  amount_paid_online: number | null;
  is_settled: boolean;
  checklist: string[] | null;
  created_at: string;
  started_at: string | null;
  paused_at: string | null;
  pause_end_at: string | null;
  completed_at: string | null;
  pause_reason: string | null;
  notes: string | null;
  start_date: string | null;
  end_date: string | null;
}

// Booking with joined customer + vehicle + battery + charger data (for rental cards)
export interface BookingWithDetails extends Booking {
  customer: Customer;
  vehicle: Vehicle | null;
  battery: Battery | null;
  charger?: Charger | null;
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
  // Repair cost fields (added v1.9)
  labour_cost: number;
  parts_cost: number;
  parts_used: PartUsed[];
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface PartUsed {
  part_id: string;
  part_name: string;
  qty: number;
  unit_cost: number;
}

// ── parts_inventory ───────────────────────────────────────────────────────────
export interface PartsInventory {
  id: string;
  part_name: string;
  problem_description: string;
  subpart: string;
  base_price: number;
  gst_amount: number;
  total_price: number;
  /** Last-entered cost by operator. Updated each time a repair is logged. */
  assumed_cost: number;
  stock_qty: number;
  created_at: string;
}

// ── vehicle_checklists ────────────────────────────────────────────────────────
export interface VehicleChecklist {
  id: string;
  vehicle_id: string;
  store_id: string;
  booking_id: string | null;
  /** 'return' | 'pause' | 'maintenance' */
  flow: string;
  /** { [item_key]: 'ok' | 'issue' | 'damaged' } */
  item_states: Record<string, string>;
  /** { [item_key]: string } */
  item_notes: Record<string, string>;
  submitted_by: string | null;
  submitted_at: string;
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
  p_cash_amount: number;
  p_online_amount: number;
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
      stores: { Row: Store; Insert: Omit<Store, 'store_id' | 'created_at'>; Update: Partial<Store>; Relationships: [] };
      profiles: { Row: Profile; Insert: Omit<Profile, 'created_at'>; Update: Partial<Profile>; Relationships: [] };
      vehicles: { Row: Vehicle; Insert: Omit<Vehicle, 'id' | 'created_at'>; Update: Partial<Vehicle>; Relationships: [] };
      batteries: { Row: Battery; Insert: Omit<Battery, 'id' | 'created_at'>; Update: Partial<Battery>; Relationships: [] };
      chargers: { Row: Charger; Insert: Omit<Charger, 'id' | 'created_at'>; Update: Partial<Charger>; Relationships: [] };
      customers: { Row: Customer; Insert: Omit<Customer, 'id' | 'created_at'>; Update: Partial<Customer>; Relationships: [] };
      bookings: { Row: Booking; Insert: Omit<Booking, 'id' | 'created_at'>; Update: Partial<Booking>; Relationships: [] };
      maintenance_jobs: { Row: MaintenanceJob; Insert: Omit<MaintenanceJob, 'id' | 'created_at'>; Update: Partial<MaintenanceJob>; Relationships: [] };
      parts_inventory: { Row: PartsInventory; Insert: Omit<PartsInventory, 'id' | 'created_at'>; Update: Partial<PartsInventory>; Relationships: [] };
      vehicle_checklists: { Row: VehicleChecklist; Insert: Omit<VehicleChecklist, 'id' | 'submitted_at'>; Update: Partial<VehicleChecklist>; Relationships: [] };
      global_config: { Row: GlobalConfig; Insert: Omit<GlobalConfig, 'updated_at'>; Update: Partial<GlobalConfig>; Relationships: [] };
      audit_logs: { Row: AuditLog; Insert: Omit<AuditLog, 'id' | 'timestamp'>; Update: Partial<AuditLog>; Relationships: [] };
    };
    Views: Record<string, never>;
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
    CompositeTypes: Record<string, never>;
  };
}
