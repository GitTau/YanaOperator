// ─────────────────────────────────────────────────────────────────────────────
// Compiled Vehicle Checklist Data from `Vehicle checklist.csv` (UPDATED)
// Sourced live for offline capability, high performance, and strict typing.
// ─────────────────────────────────────────────────────────────────────────────

export interface ChecklistItem {
  sNo: number;
  problem: string;
  subpart: string;
  part: string;
  basePrice: number;
  gst: number;
  total: number;
  fineAmount: number;
  fineText: string;
}

export const CHECKLIST_ROWS: ChecklistItem[] = [
  { sNo: 44, problem: "Damaged/Missing", subpart: "Front", part: "Bearing", basePrice: 0, gst: 0, total: 0, fineAmount: 0, fineText: "0" },
  { sNo: 45, problem: "Handle Problem", subpart: "NA", part: "Bearing", basePrice: 0, gst: 0, total: 0, fineAmount: 0, fineText: "0" },
  { sNo: 451, problem: "Handle Problem", subpart: "NA", part: "Handle loose", basePrice: 0, gst: 0, total: 0, fineAmount: 0, fineText: "0" },
  { sNo: 46, problem: "Missing/Damaged", subpart: "NA", part: "Bolts", basePrice: 0, gst: 0, total: 0, fineAmount: 0, fineText: "0" },
  { sNo: 33, problem: "Breaks not working", subpart: "Rear", part: "Break Shoe", basePrice: 252, gst: 45.36, total: 298, fineAmount: 300, fineText: "300" },
  { sNo: 34, problem: "Breaks not working", subpart: "Front", part: "Break Shoe", basePrice: 0, gst: 0, total: 0, fineAmount: 0, fineText: "0" },
  { sNo: 19, problem: "Break Wire Problem", subpart: "Rear", part: "Break Wire", basePrice: 150, gst: 27, total: 177, fineAmount: 200, fineText: "200" },
  { sNo: 191, problem: "Break Wire Problem", subpart: "Front", part: "Break Wire", basePrice: 0, gst: 0, total: 0, fineAmount: 0, fineText: "0" },
  { sNo: 20, problem: "Break Wire Problem", subpart: "Rear", part: "NA", basePrice: 130, gst: 23.4, total: 154, fineAmount: 200, fineText: "200" },
  { sNo: 9, problem: "(Horn/Light) Not Working", subpart: "NA", part: "Combination", basePrice: 335, gst: 60.3, total: 396, fineAmount: 400, fineText: "400" },
  { sNo: 10, problem: "Switch Damaged", subpart: "NA", part: "Combination", basePrice: 335, gst: 60.3, total: 396, fineAmount: 400, fineText: "400" },
  { sNo: 22, problem: "Motor not working", subpart: "NA", part: "Controller", basePrice: 3250, gst: 585, total: 3835, fineAmount: 1000, fineText: "1000" },
  { sNo: 5, problem: "Horn/Light Not Working", subpart: "NA", part: "Converter", basePrice: 335, gst: 60.3, total: 396, fineAmount: 400, fineText: "400" },
  { sNo: 1, problem: "Drum Plate Cracked", subpart: "Rear", part: "Drum", basePrice: 530, gst: 95.4, total: 626, fineAmount: 650, fineText: "650" },
  { sNo: 43, problem: "Drum Plate Cracked", subpart: "Front", part: "Drum", basePrice: 0, gst: 0, total: 0, fineAmount: 0, fineText: "0" },
  { sNo: 35, problem: "Missing/Damaged", subpart: "IOT", part: "GPS", basePrice: 1550, gst: 279, total: 1829, fineAmount: 1000, fineText: "1000" },
  { sNo: 36, problem: "Missing/Damaged", subpart: "Sim", part: "GPS", basePrice: 550, gst: 99, total: 649, fineAmount: 650, fineText: "650" },
  { sNo: 42, problem: "Missing/Damaged", subpart: "NA", part: "Harness", basePrice: 0, gst: 0, total: 0, fineAmount: 0, fineText: "0" },
  { sNo: 421, problem: "Missing/Damaged", subpart: "NA", part: "Headlight", basePrice: 475, gst: 85.5, total: 561, fineAmount: 600, fineText: "600" },
  { sNo: 4, problem: "Headlight not working", subpart: "NA", part: "Headlight", basePrice: 475, gst: 85.5, total: 561, fineAmount: 600, fineText: "600" },
  { sNo: 29, problem: "Horn Not Working", subpart: "NA", part: "Horn", basePrice: 200, gst: 36, total: 236, fineAmount: 250, fineText: "250" },
  { sNo: 12, problem: "Lever is damaged/broken", subpart: "Left", part: "Lever Set", basePrice: 380, gst: 68.4, total: 449, fineAmount: 450, fineText: "450" },
  { sNo: 13, problem: "Clutch yolk is damaged", subpart: "Left", part: "Lever Set", basePrice: 380, gst: 68.4, total: 449, fineAmount: 450, fineText: "450" },
  { sNo: 14, problem: "Lever is damaged/broken", subpart: "Right", part: "Lever Set", basePrice: 380, gst: 68.4, total: 449, fineAmount: 450, fineText: "450" },
  { sNo: 15, problem: "Clutch yolk is damaged", subpart: "Right", part: "Lever Set", basePrice: 380, gst: 68.4, total: 449, fineAmount: 450, fineText: "450" },
  { sNo: 32, problem: "Seat Not Locking", subpart: "Cable", part: "Lock Seat", basePrice: 0, gst: 0, total: 0, fineAmount: 0, fineText: "0" },
  { sNo: 321, problem: "Seat Not Locking", subpart: "Hook+Catcher", part: "Lock Set", basePrice: 150, gst: 27, total: 177, fineAmount: 200, fineText: "200" },
  { sNo: 7, problem: "Ignition Not working", subpart: "NA", part: "Lock Set", basePrice: 380, gst: 68.4, total: 449, fineAmount: 450, fineText: "450" },
  { sNo: 8, problem: "Key Missing", subpart: "NA", part: "Lock Set", basePrice: 380, gst: 68.4, total: 449, fineAmount: 450, fineText: "450" },
  { sNo: 16, problem: "MCB Damaged/Missing", subpart: "NA", part: "MCB", basePrice: 150, gst: 27, total: 177, fineAmount: 200, fineText: "200" },
  { sNo: 17, problem: "MCB  Switch Broken/Stuck", subpart: "NA", part: "MCB", basePrice: 150, gst: 27, total: 177, fineAmount: 200, fineText: "200" },
  { sNo: 21, problem: "Motor Not Working/Stuck/Plate Cracked", subpart: "NA", part: "Motor", basePrice: 5000, gst: 900, total: 5900, fineAmount: 1000, fineText: "1000" },
  { sNo: 37, problem: "Missing/Damaged", subpart: "Front", part: "Mud Guard", basePrice: 400, gst: 72, total: 472, fineAmount: 500, fineText: "500" },
  { sNo: 38, problem: "Missing/Damaged", subpart: "Rear", part: "Mud Guard", basePrice: 400, gst: 72, total: 472, fineAmount: 500, fineText: "500" },
  { sNo: 39, problem: "Missing/Damaged", subpart: "Front", part: "Mud Guard Stay", basePrice: 90, gst: 16.2, total: 107, fineAmount: 150, fineText: "150" },
  { sNo: 40, problem: "Missing/Damaged", subpart: "Rear", part: "Mud Guard Stay", basePrice: 90, gst: 16.2, total: 107, fineAmount: 150, fineText: "150" },
  { sNo: 47, problem: "Cleanliness Fine", subpart: "NA", part: "NA", basePrice: 0, gst: 0, total: 0, fineAmount: 50, fineText: "50" },
  { sNo: 48, problem: "Asset Discarded without Supervision Fine", subpart: "NA", part: "NA", basePrice: 0, gst: 0, total: 0, fineAmount: 1000, fineText: "1000" },
  { sNo: 49, problem: "Swapping of Assets between Two Riders Fine", subpart: "NA", part: "NA", basePrice: 0, gst: 0, total: 0, fineAmount: 300, fineText: "300" },
  { sNo: 50, problem: "Complete Asset Missing/Stolen", subpart: "NA", part: "NA", basePrice: 0, gst: 0, total: 0, fineAmount: 1000, fineText: "1000" },
  { sNo: 11, problem: "Missing/Damaged", subpart: "NA", part: "Number Plate", basePrice: 70, gst: 12.6, total: 83, fineAmount: 100, fineText: "100" },
  { sNo: 41, problem: "Missing/Damaged", subpart: "NA", part: "Seat", basePrice: 0, gst: 0, total: 0, fineAmount: 0, fineText: "0" },
  { sNo: 30, problem: "Missing/Damaged", subpart: "NA", part: "Side Stand", basePrice: 0, gst: 0, total: 0, fineAmount: 0, fineText: "0" },
  { sNo: 31, problem: "Missing/Damaged", subpart: "NA", part: "Side Stand Spring", basePrice: 80, gst: 14.4, total: 95, fineAmount: 100, fineText: "100" },
  { sNo: 18, problem: "Missing/Damaged", subpart: "NA", part: "SOC", basePrice: 350, gst: 63, total: 413, fineAmount: 450, fineText: "450" },
  { sNo: 6, problem: "Tail Light Not Working", subpart: "NA", part: "Tail Light", basePrice: 300, gst: 54, total: 354, fineAmount: 400, fineText: "400" },
  { sNo: 3, problem: "Throttle Problem", subpart: "NA", part: "Throttle", basePrice: 335, gst: 60.3, total: 396, fineAmount: 400, fineText: "400" },
  { sNo: 23, problem: "Puncture", subpart: "NA", part: "Tire", basePrice: 100, gst: 18, total: 118, fineAmount: 150, fineText: "150" },
  { sNo: 24, problem: "Tyre Burnout/Damaged", subpart: "NA", part: "Tire", basePrice: 1350, gst: 243, total: 1593, fineAmount: 1000, fineText: "1000" },
  { sNo: 25, problem: "Missing/Damaged", subpart: "NA", part: "Tire", basePrice: 0, gst: 0, total: 0, fineAmount: 1000, fineText: "1000" },
  { sNo: 26, problem: "Front Valve Replacement", subpart: "Front", part: "Valve", basePrice: 250, gst: 45, total: 295, fineAmount: 300, fineText: "300" },
  { sNo: 27, problem: "Rear Valve Replacement", subpart: "Rear", part: "Valve", basePrice: 250, gst: 45, total: 295, fineAmount: 300, fineText: "300" }
];

// Helper to get unique list of Problems (30 key problems)
export const KEY_PROBLEMS: { problem: string; icon: string }[] = [
  { problem: "Damaged/Missing", icon: "close-circle-outline" },
  { problem: "Handle Problem", icon: "construct-outline" },
  { problem: "Missing/Damaged", icon: "alert-circle-outline" },
  { problem: "Breaks not working", icon: "disc-outline" },
  { problem: "Break Wire Problem", icon: "trending-down-outline" },
  { problem: "(Horn/Light) Not Working", icon: "options-outline" },
  { problem: "Switch Damaged", icon: "toggle-outline" },
  { problem: "Motor not working", icon: "build-outline" },
  { problem: "Horn/Light Not Working", icon: "flash-outline" },
  { problem: "Drum Plate Cracked", icon: "disc-outline" },
  { problem: "Headlight not working", icon: "bulb-outline" },
  { problem: "Horn Not Working", icon: "volume-mute-outline" },
  { problem: "Lever is damaged/broken", icon: "construct-outline" },
  { problem: "Clutch yolk is damaged", icon: "construct-outline" },
  { problem: "Seat Not Locking", icon: "lock-closed-outline" },
  { problem: "Ignition Not working", icon: "key-outline" },
  { problem: "Key Missing", icon: "key-outline" },
  { problem: "MCB Damaged/Missing", icon: "shield-alert-outline" },
  { problem: "MCB  Switch Broken/Stuck", icon: "shield-outline" },
  { problem: "Motor Not Working/Stuck/Plate Cracked", icon: "settings-outline" },
  { problem: "Cleanliness Fine", icon: "sparkles-outline" },
  { problem: "Asset Discarded without Supervision Fine", icon: "trash-outline" },
  { problem: "Swapping of Assets between Two Riders Fine", icon: "people-outline" },
  { problem: "Complete Asset Missing/Stolen", icon: "warning-outline" },
  { problem: "Tail Light Not Working", icon: "flashlight-outline" },
  { problem: "Throttle Problem", icon: "speedometer-outline" },
  { problem: "Puncture", icon: "radio-button-off-outline" },
  { problem: "Tyre Burnout/Damaged", icon: "infinite-outline" },
  { problem: "Front Valve Replacement", icon: "ellipse-outline" },
  { problem: "Rear Valve Replacement", icon: "ellipse-outline" }
];

/**
 * Returns all checklist rows linked with a given problem.
 */
export function getLinkedRows(problemName: string): ChecklistItem[] {
  return CHECKLIST_ROWS.filter(row => row.problem === problemName);
}

/**
 * Checks if a given problem has subparts (meaning at least one linked row has subpart !== "NA").
 */
export function hasSubparts(problemName: string): boolean {
  const rows = getLinkedRows(problemName);
  return rows.some(row => row.subpart !== "NA");
}
