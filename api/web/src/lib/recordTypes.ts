// Single source of truth for the 41 Health Connect record types the app syncs,
// mirroring the canonical display names in the Android domain model
// (`app/.../domain/model/RecordTypes.kt`). Every `/counts` key and every
// `/fetch/<method>` call routes through this registry, so the `name` values
// MUST match the canonical names exactly.

/** The six fixed categories the dashboard groups cards by. */
export type RecordCategory =
  | 'Activity'
  | 'Vitals'
  | 'Body'
  | 'Sleep'
  | 'Cycle'
  | 'Nutrition';

export const RECORD_CATEGORIES: readonly RecordCategory[] = [
  'Activity',
  'Vitals',
  'Body',
  'Sleep',
  'Cycle',
  'Nutrition',
] as const;

export interface RecordTypeMeta {
  /** Canonical display name, as returned by `/counts` ("HeartRate"). */
  name: string;
  /** Friendly, layperson-readable label ("Heart rate"). */
  label: string;
  category: RecordCategory;
  /** True for the 8 high-value types that get trend charts. */
  charted: boolean;
  /** Friendly display unit, when one applies. */
  unit?: string;
}

/**
 * The API's `/counts` returns display-name-ish keys ("Steps", "HeartRate") but
 * `POST /fetch/<method>` expects the lower-first collection method
 * ("steps", "heartRate"). This is the ONE casing helper used by every fetch —
 * do not reimplement the conversion anywhere else.
 */
export const displayToCollection = (name: string): string =>
  name ? name[0].toLowerCase() + name.slice(1) : name;

/**
 * The 41 record types in the canonical order of `RecordTypes.kt`. Exactly the 8
 * high-value types are `charted`. Labels cover all types; units are set
 * where a single friendly unit applies.
 */
export const RECORD_TYPES: readonly RecordTypeMeta[] = [
  {
    name: 'ActiveCaloriesBurned',
    label: 'Active calories',
    category: 'Activity',
    charted: true,
    unit: 'kcal',
  },
  {
    name: 'BasalBodyTemperature',
    label: 'Basal body temperature',
    category: 'Vitals',
    charted: false,
    unit: '°C',
  },
  {
    name: 'BasalMetabolicRate',
    label: 'Basal metabolic rate',
    category: 'Body',
    charted: false,
    unit: 'kcal/day',
  },
  {
    name: 'BloodGlucose',
    label: 'Blood glucose',
    category: 'Vitals',
    charted: false,
    unit: 'mg/dL',
  },
  {
    name: 'BloodPressure',
    label: 'Blood pressure',
    category: 'Vitals',
    charted: false,
    unit: 'mmHg',
  },
  {
    name: 'BodyFat',
    label: 'Body fat',
    category: 'Body',
    charted: true,
    unit: '%',
  },
  {
    name: 'BodyTemperature',
    label: 'Body temperature',
    category: 'Vitals',
    charted: false,
    unit: '°C',
  },
  {
    name: 'BodyWaterMass',
    label: 'Body water mass',
    category: 'Body',
    charted: false,
    unit: 'kg',
  },
  {
    name: 'BoneMass',
    label: 'Bone mass',
    category: 'Body',
    charted: false,
    unit: 'kg',
  },
  {
    name: 'CervicalMucus',
    label: 'Cervical mucus',
    category: 'Cycle',
    charted: false,
  },
  {
    name: 'CyclingPedalingCadence',
    label: 'Cycling cadence',
    category: 'Activity',
    charted: false,
    unit: 'rpm',
  },
  {
    name: 'Distance',
    label: 'Distance',
    category: 'Activity',
    charted: false,
    unit: 'm',
  },
  {
    name: 'ElevationGained',
    label: 'Elevation gained',
    category: 'Activity',
    charted: false,
    unit: 'm',
  },
  {
    name: 'ExerciseSession',
    label: 'Workouts',
    category: 'Activity',
    charted: false,
  },
  {
    name: 'FloorsClimbed',
    label: 'Floors climbed',
    category: 'Activity',
    charted: false,
    unit: 'floors',
  },
  {
    name: 'HeartRate',
    label: 'Heart rate',
    category: 'Vitals',
    charted: true,
    unit: 'bpm',
  },
  {
    name: 'HeartRateVariabilityRmssd',
    label: 'Heart rate variability',
    category: 'Vitals',
    charted: false,
    unit: 'ms',
  },
  {
    name: 'Height',
    label: 'Height',
    category: 'Body',
    charted: false,
    unit: 'cm',
  },
  {
    name: 'Hydration',
    label: 'Hydration',
    category: 'Nutrition',
    charted: false,
    unit: 'mL',
  },
  {
    name: 'IntermenstrualBleeding',
    label: 'Intermenstrual bleeding',
    category: 'Cycle',
    charted: false,
  },
  {
    name: 'LeanBodyMass',
    label: 'Lean body mass',
    category: 'Body',
    charted: false,
    unit: 'kg',
  },
  {
    name: 'MenstruationFlow',
    label: 'Menstruation flow',
    category: 'Cycle',
    charted: false,
  },
  {
    name: 'MenstruationPeriod',
    label: 'Menstruation period',
    category: 'Cycle',
    charted: false,
  },
  {
    name: 'MindfulnessSession',
    label: 'Mindfulness',
    category: 'Activity',
    charted: false,
  },
  {
    name: 'Nutrition',
    label: 'Nutrition',
    category: 'Nutrition',
    charted: false,
  },
  {
    name: 'OvulationTest',
    label: 'Ovulation test',
    category: 'Cycle',
    charted: false,
  },
  {
    name: 'OxygenSaturation',
    label: 'Oxygen saturation',
    category: 'Vitals',
    charted: false,
    unit: '%',
  },
  {
    name: 'PlannedExerciseSession',
    label: 'Planned workouts',
    category: 'Activity',
    charted: false,
  },
  {
    name: 'Power',
    label: 'Power',
    category: 'Activity',
    charted: false,
    unit: 'W',
  },
  {
    name: 'RespiratoryRate',
    label: 'Respiratory rate',
    category: 'Vitals',
    charted: false,
    unit: 'br/min',
  },
  {
    name: 'RestingHeartRate',
    label: 'Resting heart rate',
    category: 'Vitals',
    charted: true,
    unit: 'bpm',
  },
  {
    name: 'SexualActivity',
    label: 'Sexual activity',
    category: 'Cycle',
    charted: false,
  },
  {
    name: 'SkinTemperature',
    label: 'Skin temperature',
    category: 'Vitals',
    charted: false,
    unit: '°C',
  },
  {
    name: 'SleepSession',
    label: 'Sleep',
    category: 'Sleep',
    charted: true,
    unit: 'h',
  },
  {
    name: 'Speed',
    label: 'Speed',
    category: 'Activity',
    charted: false,
    unit: 'm/s',
  },
  {
    name: 'Steps',
    label: 'Steps',
    category: 'Activity',
    charted: true,
    unit: 'steps',
  },
  {
    name: 'StepsCadence',
    label: 'Steps cadence',
    category: 'Activity',
    charted: false,
    unit: 'spm',
  },
  {
    name: 'TotalCaloriesBurned',
    label: 'Total calories',
    category: 'Activity',
    charted: true,
    unit: 'kcal',
  },
  {
    name: 'Vo2Max',
    label: 'VO₂ max',
    category: 'Activity',
    charted: false,
    unit: 'mL/kg/min',
  },
  {
    name: 'Weight',
    label: 'Weight',
    category: 'Body',
    charted: true,
    unit: 'kg',
  },
  {
    name: 'WheelchairPushes',
    label: 'Wheelchair pushes',
    category: 'Activity',
    charted: false,
    unit: 'pushes',
  },
] as const;

/** Lookup of metadata by canonical display name. */
export const RECORD_TYPE_BY_NAME: ReadonlyMap<string, RecordTypeMeta> = new Map(
  RECORD_TYPES.map((meta) => [meta.name, meta]),
);

/** Resolve metadata by canonical display name, or `undefined` if unknown. */
export const getRecordType = (name: string): RecordTypeMeta | undefined =>
  RECORD_TYPE_BY_NAME.get(name);

/** The charted high-value types, in registry order. */
export const CHARTED_TYPES: readonly RecordTypeMeta[] = RECORD_TYPES.filter(
  (meta) => meta.charted,
);

/** All record types in a given category, in registry order. */
export const recordTypesByCategory = (
  category: RecordCategory,
): readonly RecordTypeMeta[] =>
  RECORD_TYPES.filter((meta) => meta.category === category);
