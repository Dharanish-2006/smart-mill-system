// Static registry of the 15 motors and the 11 process sections.

export const SECTIONS = [
  { id: 'S1', order: 1, name: 'Paddy Receiving & Cleaning' },
  { id: 'S2', order: 2, name: 'Paddy Separation' },
  { id: 'S3', order: 3, name: 'De-Stoner' },
  { id: 'S4', order: 4, name: 'Husking' },
  { id: 'S5', order: 5, name: 'Paddy Separation & Polishing' },
  { id: 'S6', order: 6, name: 'Grading & Separation' },
  { id: 'S7', order: 7, name: 'Broken Separator' },
  { id: 'S8', order: 8, name: 'Rice Whitener' },
  { id: 'S9', order: 9, name: 'Final Separation' },
  { id: 'S10', order: 10, name: 'Rice Silos' },
  { id: 'S11', order: 11, name: 'Packing Section' },
];

export const MOTORS = [
  { id: 'M1', name: 'Receiving Hopper', sectionId: 'S1' },
  { id: 'M2', name: 'Pre-Cleaner', sectionId: 'S1' },
  { id: 'M3', name: 'Paddy Separator', sectionId: 'S2' },
  { id: 'M4', name: 'De-Stoner', sectionId: 'S3' },
  { id: 'M5', name: 'Rubber Roll Husker', sectionId: 'S4' },
  { id: 'M6', name: 'Paddy Separator / Polisher', sectionId: 'S5' },
  { id: 'M7', name: 'Rice Polisher', sectionId: 'S6' },
  { id: 'M8', name: 'Vibro Separator', sectionId: 'S6' },
  { id: 'M9', name: 'Rice Grader', sectionId: 'S6' },
  { id: 'M10', name: 'Broken Rice Separator', sectionId: 'S7' },
  { id: 'M11', name: 'Rice Whitener', sectionId: 'S8' },
  { id: 'M12', name: 'Color Sorter', sectionId: 'S9' },
  { id: 'M13', name: 'Rice Silo 1 (Head Rice)', sectionId: 'S10' },
  { id: 'M14', name: 'Rice Silo 2 (Broken Rice)', sectionId: 'S10' },
  { id: 'M15', name: 'Rice Packing', sectionId: 'S11' },
];

export const MOTOR_BY_ID = Object.fromEntries(MOTORS.map((m) => [m.id, m]));
export const SECTION_BY_ID = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));
export const motorsInSection = (sectionId) => MOTORS.filter((m) => m.sectionId === sectionId);

// Time-range filters for motor detail pages.
export const RANGES = [
  { id: '1h', label: 'Last hour', ms: 3_600_000 },
  { id: '24h', label: '24 hours', ms: 86_400_000 },
  { id: '7d', label: '7 days', ms: 7 * 86_400_000 },
  { id: '30d', label: '30 days', ms: 30 * 86_400_000 },
];
