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

export type UserRole = 'ADMIN' | 'OPERATOR' | 'RIDER' | 'MECHANIC';
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
  captain_id?: string | null;
  created_at: string;
}

// ── captains (ground operators) ──────────────────────────────────────────────
export interface Captain {
  id: string;
  name: string;
  store_id: string | null;
  zap_point: string | null;
  login_id: string | null;
  auth_user_id: string | null;
  phone: string | null;
  joined_date: string;
  status: string;
  push_token: string | null;
  created_at: string;
}

// ── vehicles ─────────────────────────────────────────────────────────────────
export interface Vehicle {
  id: string;
  store_id: string;
  plate_number: string; // e.g. XEM01
  status: VehicleStatus;
  assigned_battery_id: string | null;
  odometer_km?: number;
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
  ah_rating?: string | null;
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

// ── notifications ────────────────────────────────────────────────────────────
export interface AppNotification {
  id: string;
  store_id: string | null;
  captain_id: string | null;
  title: string;
  body: string;
  type: string;
  is_read: boolean;
  data: Record<string, any> | null;
  created_at: string | null;
}

// ── Maintenance & Inventory Master (v1) ──────────────────────────────────
export type PartCategory =
  | 'BRAKES'
  | 'ELECTRICAL'
  | 'DRIVE_MOTOR'
  | 'BODY_CHASSIS'
  | 'WHEELS_TIRES'
  | 'SUSPENSION'
  | 'LOCKS_KEYS'
  | 'CONSUMABLES'
  | 'ACCESSORIES';

export type PartCondition = 'NEW' | 'REFURBISHED' | 'SALVAGED';

export type InventoryTransactionType =
  | 'PURCHASE_INWARD'
  | 'JOB_CARD_CONSUMED'
  | 'SALVAGED_INWARD'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'AUDIT_ADJUSTMENT'
  | 'SCRAPPED';

export type JobCardStatus =
  | 'OPEN'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'WAITING_FOR_PARTS'
  | 'READY_FOR_TEST'
  | 'READY_FOR_DEPLOYMENT'
  | 'CLOSED'
  | 'CANCELLED';

export type JobCardSeverity = 'MINOR' | 'MAJOR' | 'CRITICAL';
export type JobCardPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type JobCardTrigger = 'CAPTAIN_REPORT' | 'PERIODIC_SOP' | 'RIDER_INCIDENT' | 'BREAKDOWN';
export type PartSourceType = 'INVENTORY' | 'SALVAGED_DIRECT' | 'SALVAGED_INVENTORY';
export type PurchaseRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'FULFILLED' | 'CANCELLED';

export interface VehicleMake {
  id: string;
  name: string;
  created_at: string;
}

export interface VehicleModel {
  id: string;
  make_id: string;
  name: string;
  created_at: string;
}

export interface PartCatalog {
  id: string;
  part_code: string;
  name: string;
  category: PartCategory;
  subpart: string | null;
  unit: string;
  base_price: number;
  gst_rate: number;
  mrp: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PartModelCompatibility {
  id: string;
  part_id: string;
  model_id: string;
  notes: string | null;
}

export interface StoreInventory {
  id: string;
  store_id: string;
  part_id: string;
  condition: PartCondition;
  quantity_on_hand: number;
  reorder_level: number;
  reorder_quantity: number;
  updated_at: string;
  part?: PartCatalog;
}

export interface InventoryTransaction {
  id: string;
  store_id: string;
  part_id: string;
  condition: PartCondition;
  transaction_type: InventoryTransactionType;
  quantity: number;
  balance_after: number;
  unit_cost: number;
  job_card_id: string | null;
  donor_vehicle_id: string | null;
  target_store_id: string | null;
  purchase_request_id: string | null;
  notes: string | null;
  performed_by: string | null;
  created_at: string;
  part?: PartCatalog;
  donor_vehicle?: Vehicle;
}

export interface JobCard {
  id: string;
  job_card_number: string;
  vehicle_id: string;
  store_id: string;
  trigger_type: JobCardTrigger;
  reported_issue: string;
  severity: JobCardSeverity;
  priority: JobCardPriority;
  status: JobCardStatus;
  odometer_km: number;
  diagnosis: string | null;
  repair_notes: string | null;
  roadworthiness_confirmed: boolean;
  final_test_notes: string | null;
  labour_cost: number;
  parts_cost: number;
  total_cost: number;
  reported_by: string | null;
  assigned_mechanic_id: string | null;
  qc_inspector_id: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  vehicle?: Vehicle;
  parts?: JobCardPart[];
}

export interface JobCardPart {
  id: string;
  job_card_id: string;
  part_id: string;
  quantity: number;
  source_type: PartSourceType;
  condition: PartCondition;
  donor_vehicle_id: string | null;
  inventory_transaction_id: string | null;
  unit_cost: number;
  installed_by: string | null;
  installed_at: string;
  part?: PartCatalog;
  donor_vehicle?: Vehicle;
}

export interface VehicleDonorHistory {
  id: string;
  donor_vehicle_id: string;
  part_id: string;
  recipient_vehicle_id: string | null;
  job_card_id: string | null;
  condition: PartCondition;
  notes: string | null;
  removed_by: string | null;
  harvested_at: string;
  part?: PartCatalog;
  donor_vehicle?: Vehicle;
  recipient_vehicle?: Vehicle;
}

export interface PurchaseRequest {
  id: string;
  request_number: string;
  store_id: string;
  part_id: string;
  quantity_requested: number;
  status: PurchaseRequestStatus;
  reason: string | null;
  requested_by: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
  fulfilled_at: string | null;
  part?: PartCatalog;
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
  p_status?: BookingStatus;
  p_start_date?: string | null;
  p_end_date?: string | null;
  p_charger_id?: string | null;
}

export interface DispatchBookingParams {
  p_booking_id: string;
  p_vehicle_id: string;
  p_battery_id: string;
  p_charger_id?: string | null;
  p_operator_id?: string | null;
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

export interface CreateJobCardParams {
  p_vehicle_id: string;
  p_store_id: string;
  p_trigger_type: string;
  p_reported_issue: string;
  p_severity: string;
  p_priority?: string;
  p_odometer_km?: number;
  p_notes?: string | null;
}

export interface ConsumeJobCardPartParams {
  p_job_card_id: string;
  p_part_id: string;
  p_quantity?: number;
  p_condition?: string;
}

export interface RecordSalvagedPartParams {
  p_job_card_id: string;
  p_part_id: string;
  p_donor_vehicle_id: string;
  p_condition?: string;
  p_notes?: string | null;
}

export interface CompleteJobCardParams {
  p_job_card_id: string;
  p_roadworthiness_confirmed: boolean;
  p_final_test_notes?: string | null;
  p_labour_cost?: number;
}

export interface AdjustStoreInventoryParams {
  p_store_id: string;
  p_part_id: string;
  p_condition: string;
  p_quantity_change: number;
  p_transaction_type: string;
  p_unit_cost?: number;
  p_notes?: string | null;
}

export interface TransferStoreInventoryParams {
  p_source_store_id: string;
  p_target_store_id: string;
  p_part_id: string;
  p_condition: string;
  p_quantity: number;
  p_notes?: string | null;
}

// ── Database shape for supabase-js generics ───────────────────────────────────
export interface Database {
  public: {
    Tables: {
      stores: { Row: Store; Insert: Omit<Store, 'store_id' | 'created_at'>; Update: Partial<Store>; Relationships: [] };
      profiles: { Row: Profile; Insert: Omit<Profile, 'created_at'>; Update: Partial<Profile>; Relationships: [] };
      captains: { Row: Captain; Insert: Partial<Captain>; Update: Partial<Captain>; Relationships: [] };
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
      notifications: { Row: AppNotification; Insert: Omit<AppNotification, 'id' | 'created_at'>; Update: Partial<AppNotification>; Relationships: [] };
      vehicle_makes: { Row: VehicleMake; Insert: Omit<VehicleMake, 'id' | 'created_at'>; Update: Partial<VehicleMake>; Relationships: [] };
      vehicle_models: { Row: VehicleModel; Insert: Omit<VehicleModel, 'id' | 'created_at'>; Update: Partial<VehicleModel>; Relationships: [] };
      parts_catalog: { Row: PartCatalog; Insert: Omit<PartCatalog, 'id' | 'created_at' | 'updated_at'>; Update: Partial<PartCatalog>; Relationships: [] };
      part_model_compatibility: { Row: PartModelCompatibility; Insert: Omit<PartModelCompatibility, 'id'>; Update: Partial<PartModelCompatibility>; Relationships: [] };
      store_inventory: { Row: StoreInventory; Insert: Omit<StoreInventory, 'id' | 'updated_at'>; Update: Partial<StoreInventory>; Relationships: [] };
      inventory_transactions: { Row: InventoryTransaction; Insert: Omit<InventoryTransaction, 'id' | 'created_at'>; Update: Partial<InventoryTransaction>; Relationships: [] };
      job_cards: { Row: JobCard; Insert: Omit<JobCard, 'id' | 'job_card_number' | 'created_at' | 'updated_at' | 'total_cost'>; Update: Partial<JobCard>; Relationships: [] };
      job_card_parts: { Row: JobCardPart; Insert: Omit<JobCardPart, 'id' | 'installed_at'>; Update: Partial<JobCardPart>; Relationships: [] };
      vehicle_donor_history: { Row: VehicleDonorHistory; Insert: Omit<VehicleDonorHistory, 'id' | 'harvested_at'>; Update: Partial<VehicleDonorHistory>; Relationships: [] };
      purchase_requests: { Row: PurchaseRequest; Insert: Omit<PurchaseRequest, 'id' | 'request_number' | 'created_at' | 'updated_at'>; Update: Partial<PurchaseRequest>; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: {
      create_booking: { Args: CreateBookingParams; Returns: string };
      dispatch_booking: { Args: DispatchBookingParams; Returns: void };
      record_payment: { Args: RecordPaymentParams; Returns: void };
      swap_assets: { Args: SwapAssetsParams; Returns: void };
      current_role: { Args: Record<string, never>; Returns: UserRole };
      current_store_id: { Args: Record<string, never>; Returns: string };
      create_job_card: { Args: CreateJobCardParams; Returns: Record<string, any> };
      consume_job_card_part: { Args: ConsumeJobCardPartParams; Returns: Record<string, any> };
      record_salvaged_part: { Args: RecordSalvagedPartParams; Returns: Record<string, any> };
      complete_job_card: { Args: CompleteJobCardParams; Returns: Record<string, any> };
      adjust_store_inventory: { Args: AdjustStoreInventoryParams; Returns: Record<string, any> };
      transfer_store_inventory: { Args: TransferStoreInventoryParams; Returns: Record<string, any> };
    };
    Enums: {
      vehicle_status: VehicleStatus;
      battery_status: BatteryStatus;
      booking_status: BookingStatus;
      rental_plan: RentalPlan;
      user_role: UserRole;
      log_type: LogType;
      job_card_status: JobCardStatus;
      job_card_severity: JobCardSeverity;
      job_card_priority: JobCardPriority;
      part_condition: PartCondition;
      inventory_transaction_type: InventoryTransactionType;
      purchase_request_status: PurchaseRequestStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
