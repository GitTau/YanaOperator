-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add_checklist_templates
-- Created: 2026-05-21
-- Purpose: Vehicle inspection checklist items stored in Supabase so that
--          items can be added/removed/reordered from the admin console
--          without a mobile app code deploy.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Create table
CREATE TABLE IF NOT EXISTS public.checklist_templates (
  id          serial PRIMARY KEY,
  item_key    text    NOT NULL UNIQUE,
  label       text    NOT NULL,
  description text    NOT NULL DEFAULT '',
  icon_name   text    NOT NULL DEFAULT 'checkmark-circle-outline',
  sort_order  int     NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  -- Applies to which flows. Values: 'return', 'pause'.
  applies_to  text[]  NOT NULL DEFAULT ARRAY['return','pause'],
  -- Fine in ₹ deducted from security deposit when item is marked DAMAGED.
  -- 0 = no fine. Admin-configurable from dashboard — no code deploy needed.
  fine_amount int     NOT NULL DEFAULT 0
);

COMMENT ON TABLE  public.checklist_templates IS 'Vehicle inspection checklist items — managed from admin console, fetched at runtime by the Operator app.';
COMMENT ON COLUMN public.checklist_templates.item_key    IS 'Stable identifier used in vehicle_checklists.items JSONB. Never change once in production.';
COMMENT ON COLUMN public.checklist_templates.applies_to  IS 'Which flows show this item. Values: return, pause.';
COMMENT ON COLUMN public.checklist_templates.sort_order  IS 'Display order in the checklist modal.';

-- 2. Seed initial 14 items (fine_amount = placeholder ₹ values, editable in dashboard)
INSERT INTO public.checklist_templates (item_key, label, description, icon_name, sort_order, applies_to, fine_amount) VALUES
  ('tyres',         'Tyres & Wheels',                  'Check tyre pressure, tread wear, sidewall cracks',             'radio-button-off-outline',   1,  ARRAY['return','pause'], 500),
  ('brakes',        'Brakes (Front & Rear)',            'Brake lever free play, brake pads, disc/drum condition',       'hand-right-outline',         2,  ARRAY['return','pause'], 300),
  ('battery_mount', 'Battery Mount & Cables',          'Battery secured in slot, cable integrity, no exposed wires',   'battery-charging-outline',   3,  ARRAY['return','pause'], 400),
  ('lights',        'Lights (Head, Tail, Indicators)', 'All lights functional, no cracked lenses',                     'bulb-outline',               4,  ARRAY['return','pause'], 200),
  ('horn',          'Horn',                            'Horn audible and responsive',                                  'megaphone-outline',          5,  ARRAY['return','pause'], 100),
  ('mirrors',       'Mirrors (Both Sides)',             'Mirrors present, adjusted, and crack-free',                    'swap-horizontal-outline',    6,  ARRAY['return','pause'], 150),
  ('body_panels',   'Body Panels & Paint',             'Dents, scratches, cracked panels — document all',              'car-outline',                7,  ARRAY['return','pause'], 500),
  ('handlebars',    'Handlebars & Grips',              'No wobble, grips intact, throttle smooth',                     'build-outline',              8,  ARRAY['return','pause'], 200),
  ('seat',          'Seat & Lock',                     'Seat undamaged, seat lock functional',                         'person-outline',             9,  ARRAY['return','pause'], 250),
  ('footrest',      'Footrests & Stand',               'Footrests intact, side stand and main stand functional',       'footsteps-outline',          10, ARRAY['return','pause'], 150),
  ('chain_belt',    'Chain / Belt Drive',              'Chain/belt tension and lubrication',                           'link-outline',               11, ARRAY['return','pause'], 300),
  ('controller',    'Motor Controller',                'No heat damage, no loose connectors',                          'hardware-chip-outline',      12, ARRAY['return','pause'], 500),
  ('odometer',      'Odometer Reading',                'Record current odometer for PM schedule',                      'speedometer-outline',        13, ARRAY['return','pause'], 0),
  ('cleanliness',   'Overall Cleanliness',             'Vehicle returned in clean condition',                          'sparkles-outline',           14, ARRAY['return','pause'], 0)
ON CONFLICT (item_key) DO NOTHING;

-- 3. Enable RLS
ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;

-- 4. RLS policy — authenticated users can only SELECT
CREATE POLICY "authenticated_read_checklist_templates"
  ON public.checklist_templates
  FOR SELECT
  TO authenticated
  USING (true);

-- 5. Grants — app reads only; writes via admin console / service_role SQL
REVOKE ALL ON public.checklist_templates FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES
  ON public.checklist_templates FROM authenticated;
GRANT SELECT ON public.checklist_templates TO authenticated;
