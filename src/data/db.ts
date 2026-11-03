import { DBSchema, IDBPDatabase, openDB } from 'idb';
import { addDaysIso, diffDaysIso, generateQrIdentifier, getTodayIso } from '../domain/calculations';
import { sha256Hex } from '../services/security';
import {
  Animal,
  AnimalStatus,
  AppPreferences,
  BreedingRecord,
  CalvingRecord,
  Customer,
  Employee,
  ExpenseRecord,
  FarmSettings,
  FarmTask,
  FeedRecord,
  FeedStockTransaction,
  FeedType,
  Gender,
  HealthRecord,
  IncomeRecord,
  LactationRecord,
  Medicine,
  MedicineUsage,
  MilkRecord,
  MilkSale,
  OperationalStoreName,
  PregnancyRecord,
  Reminder,
  SafetyBackupRecord,
  Species,
  SyncConflictItem,
  SyncMetadata,
  SyncStatus,
  UserRole,
  VaccinationRecord,
  VeterinaryVisit,
  WeightRecord,
} from '../types/models';

export const SHARED_FARM_ID = 'primary_farm';

export const OPERATIONAL_STORE_NAMES: readonly OperationalStoreName[] = [
  'animals',
  'milk_records',
  'customers',
  'milk_sales',
  'feed_types',
  'feed_stock_transactions',
  'feed_records',
  'health_records',
  'medicines',
  'medicine_usages',
  'veterinary_visits',
  'vaccination_records',
  'breeding_records',
  'pregnancy_records',
  'calving_records',
  'weight_records',
  'lactation_records',
  'income_records',
  'expense_records',
  'employees',
  'farm_tasks',
  'reminders',
] as const;

export const WORKER_ALLOWED_STORE_NAMES: readonly OperationalStoreName[] = [
  'animals',
  'milk_records',
  'breeding_records',
  'pregnancy_records',
  'calving_records',
  'lactation_records',
  'weight_records',
] as const;

export interface SyncActor {
  uid?: string;
  email?: string;
  role?: UserRole;
  displayName?: string;
}

let currentSyncActor: SyncActor | null = null;

export function setCurrentSyncActor(actor: SyncActor | null) {
  currentSyncActor = actor;
}

export function getCurrentSyncActor(): SyncActor | null {
  return currentSyncActor;
}

export interface DairyTrackDB extends DBSchema {
  farm_settings: { key: number; value: FarmSettings };
  app_preferences: { key: number; value: AppPreferences };
  animals: {
    key: string;
    value: Animal;
    indexes: {
      'by-tag': string;
      'by-qr': string;
      'by-status': string;
      'by-species': string;
    };
  };
  milk_records: {
    key: string;
    value: MilkRecord;
    indexes: { 'by-animal': string; 'by-date': string };
  };
  customers: { key: string; value: Customer };
  milk_sales: {
    key: string;
    value: MilkSale;
    indexes: { 'by-customer': string; 'by-date': string };
  };
  feed_types: { key: string; value: FeedType };
  feed_stock_transactions: {
    key: string;
    value: FeedStockTransaction;
    indexes: { 'by-feed': string; 'by-date': string };
  };
  feed_records: {
    key: string;
    value: FeedRecord;
    indexes: { 'by-feed': string; 'by-animal': string; 'by-date': string };
  };
  health_records: {
    key: string;
    value: HealthRecord;
    indexes: { 'by-animal': string; 'by-date': string };
  };
  medicines: { key: string; value: Medicine };
  medicine_usages: {
    key: string;
    value: MedicineUsage;
    indexes: { 'by-medicine': string; 'by-animal': string };
  };
  veterinary_visits: {
    key: string;
    value: VeterinaryVisit;
    indexes: { 'by-animal': string; 'by-date': string };
  };
  vaccination_records: {
    key: string;
    value: VaccinationRecord;
    indexes: { 'by-animal': string; 'by-due-date': string };
  };
  breeding_records: {
    key: string;
    value: BreedingRecord;
    indexes: { 'by-animal': string; 'by-date': string };
  };
  pregnancy_records: {
    key: string;
    value: PregnancyRecord;
    indexes: { 'by-animal': string; 'by-expected': string };
  };
  calving_records: {
    key: string;
    value: CalvingRecord;
    indexes: { 'by-mother': string; 'by-date': string };
  };
  weight_records: {
    key: string;
    value: WeightRecord;
    indexes: { 'by-animal': string; 'by-date': string };
  };
  lactation_records: {
    key: string;
    value: LactationRecord;
    indexes: { 'by-animal': string };
  };
  income_records: {
    key: string;
    value: IncomeRecord;
    indexes: { 'by-date': string; 'by-category': string };
  };
  expense_records: {
    key: string;
    value: ExpenseRecord;
    indexes: { 'by-date': string; 'by-category': string };
  };
  employees: { key: string; value: Employee };
  farm_tasks: {
    key: string;
    value: FarmTask;
    indexes: { 'by-due-date': string; 'by-status': string };
  };
  reminders: {
    key: string;
    value: Reminder;
    indexes: { 'by-dedupe': string; 'by-trigger': string };
  };
  sync_conflicts: {
    key: string;
    value: SyncConflictItem;
    indexes: { 'by-status': string };
  };
  safety_backups: {
    key: string;
    value: SafetyBackupRecord;
  };
}

const DB_NAME = 'dairytrack_db';
const DB_VERSION = 3;

export const DEFAULT_FARM_SETTINGS: FarmSettings = {
  id: 1,
  farmId: SHARED_FARM_ID,
  farmName: 'My Smart Dairy Farm',
  ownerName: '',
  phone: '',
  address: '',
  currencySymbol: '₹',
  volumeUnit: 'L',
  weightUnit: 'kg',
  enableAfternoonSession: false,
  defaultMilkRatePerLitre: 48,
  gestationDaysCow: 283,
  gestationDaysBuffalo: 310,
  notificationsEnabled: true,
  setupCompleted: false,
  version: 1,
  syncStatus: SyncStatus.LOCAL_ONLY,
  updatedAt: Date.now(),
};

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  id: 1,
  language: 'en',
  pinEnabled: false,
  pinHash: null,
  pinSalt: null,
  biometricEnabled: false,
  biometricCredentialId: null,
  cloudSyncEnabled: false,
  lastLocalBackupAt: null,
  updatedAt: Date.now(),
};

let dbPromise: Promise<IDBPDatabase<DairyTrackDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<DairyTrackDB>> {
  if (!dbPromise) {
    dbPromise = openDB<DairyTrackDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('farm_settings')) {
          db.createObjectStore('farm_settings', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('app_preferences')) {
          db.createObjectStore('app_preferences', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('animals')) {
          const s = db.createObjectStore('animals', { keyPath: 'id' });
          s.createIndex('by-tag', 'tagNumber');
          s.createIndex('by-qr', 'qrIdentifier');
          s.createIndex('by-status', 'status');
          s.createIndex('by-species', 'species');
        }
        if (!db.objectStoreNames.contains('milk_records')) {
          const s = db.createObjectStore('milk_records', { keyPath: 'id' });
          s.createIndex('by-animal', 'animalId');
          s.createIndex('by-date', 'date');
        }
        if (!db.objectStoreNames.contains('customers')) {
          db.createObjectStore('customers', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('milk_sales')) {
          const s = db.createObjectStore('milk_sales', { keyPath: 'id' });
          s.createIndex('by-customer', 'customerId');
          s.createIndex('by-date', 'date');
        }
        if (!db.objectStoreNames.contains('feed_types')) {
          db.createObjectStore('feed_types', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('feed_stock_transactions')) {
          const s = db.createObjectStore('feed_stock_transactions', { keyPath: 'id' });
          s.createIndex('by-feed', 'feedTypeId');
          s.createIndex('by-date', 'date');
        }
        if (!db.objectStoreNames.contains('feed_records')) {
          const s = db.createObjectStore('feed_records', { keyPath: 'id' });
          s.createIndex('by-feed', 'feedTypeId');
          s.createIndex('by-animal', 'animalId');
          s.createIndex('by-date', 'date');
        }
        if (!db.objectStoreNames.contains('health_records')) {
          const s = db.createObjectStore('health_records', { keyPath: 'id' });
          s.createIndex('by-animal', 'animalId');
          s.createIndex('by-date', 'date');
        }
        if (!db.objectStoreNames.contains('medicines')) {
          db.createObjectStore('medicines', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('medicine_usages')) {
          const s = db.createObjectStore('medicine_usages', { keyPath: 'id' });
          s.createIndex('by-medicine', 'medicineId');
          s.createIndex('by-animal', 'animalId');
        }
        if (!db.objectStoreNames.contains('veterinary_visits')) {
          const s = db.createObjectStore('veterinary_visits', { keyPath: 'id' });
          s.createIndex('by-animal', 'animalId');
          s.createIndex('by-date', 'visitDate');
        }
        if (!db.objectStoreNames.contains('vaccination_records')) {
          const s = db.createObjectStore('vaccination_records', { keyPath: 'id' });
          s.createIndex('by-animal', 'animalId');
          s.createIndex('by-due-date', 'dueDate');
        }
        if (!db.objectStoreNames.contains('breeding_records')) {
          const s = db.createObjectStore('breeding_records', { keyPath: 'id' });
          s.createIndex('by-animal', 'animalId');
          s.createIndex('by-date', 'breedingDate');
        }
        if (!db.objectStoreNames.contains('pregnancy_records')) {
          const s = db.createObjectStore('pregnancy_records', { keyPath: 'id' });
          s.createIndex('by-animal', 'animalId');
          s.createIndex('by-expected', 'expectedCalvingDate');
        }
        if (!db.objectStoreNames.contains('calving_records')) {
          const s = db.createObjectStore('calving_records', { keyPath: 'id' });
          s.createIndex('by-mother', 'motherId');
          s.createIndex('by-date', 'calvingDate');
        }
        if (!db.objectStoreNames.contains('weight_records')) {
          const s = db.createObjectStore('weight_records', { keyPath: 'id' });
          s.createIndex('by-animal', 'animalId');
          s.createIndex('by-date', 'date');
        }
        if (!db.objectStoreNames.contains('lactation_records')) {
          const s = db.createObjectStore('lactation_records', { keyPath: 'id' });
          s.createIndex('by-animal', 'animalId');
        }
        if (!db.objectStoreNames.contains('income_records')) {
          const s = db.createObjectStore('income_records', { keyPath: 'id' });
          s.createIndex('by-date', 'date');
          s.createIndex('by-category', 'category');
        }
        if (!db.objectStoreNames.contains('expense_records')) {
          const s = db.createObjectStore('expense_records', { keyPath: 'id' });
          s.createIndex('by-date', 'date');
          s.createIndex('by-category', 'category');
        }
        if (!db.objectStoreNames.contains('employees')) {
          db.createObjectStore('employees', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('farm_tasks')) {
          const s = db.createObjectStore('farm_tasks', { keyPath: 'id' });
          s.createIndex('by-due-date', 'dueDate');
          s.createIndex('by-status', 'status');
        }
        if (!db.objectStoreNames.contains('reminders')) {
          const s = db.createObjectStore('reminders', { keyPath: 'id' });
          s.createIndex('by-dedupe', 'dedupeKey', { unique: true });
          s.createIndex('by-trigger', 'triggerDate');
        }
        if (!db.objectStoreNames.contains('sync_conflicts')) {
          const s = db.createObjectStore('sync_conflicts', { keyPath: 'conflictId' });
          s.createIndex('by-status', 'status');
        }
        if (!db.objectStoreNames.contains('safety_backups')) {
          db.createObjectStore('safety_backups', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

export function createMeta(
  existing?: SyncMetadata,
  actorOverride?: SyncActor,
  customId?: string
): SyncMetadata {
  const now = Date.now();
  const actor = actorOverride || currentSyncActor;
  if (!existing) {
    return {
      id: customId || crypto.randomUUID(),
      farmId: SHARED_FARM_ID,
      createdAt: now,
      createdByUid: actor?.uid,
      createdByEmail: actor?.email,
      createdByRole: actor?.role,
      createdByName: actor?.displayName,
      updatedAt: now,
      updatedBy: actor?.uid,
      updatedByEmail: actor?.email,
      updatedByRole: actor?.role,
      reviewStatus: actor?.role === 'WORKER' ? 'PENDING_REVIEW' : undefined,
      version: 1,
      baseVersion: 0,
      isDeleted: false,
      syncStatus: SyncStatus.PENDING_SYNC,
    };
  }
  const baseVersion =
    existing.syncStatus === SyncStatus.SYNCED ? existing.version : (existing.baseVersion ?? 0);
  const nextVersion = baseVersion + 1;
  return {
    id: existing.id,
    farmId: existing.farmId || SHARED_FARM_ID,
    createdAt: existing.createdAt,
    createdByUid: existing.createdByUid ?? existing.updatedBy,
    createdByEmail: existing.createdByEmail ?? existing.updatedByEmail,
    createdByRole: existing.createdByRole,
    createdByName: existing.createdByName,
    updatedAt: now,
    updatedBy: actor?.uid ?? existing.updatedBy,
    updatedByEmail: actor?.email ?? existing.updatedByEmail,
    updatedByRole: actor?.role ?? existing.updatedByRole,
    reviewStatus: existing.reviewStatus,
    correctionHistory: existing.correctionHistory,
    version: nextVersion,
    baseVersion,
    isDeleted: existing.isDeleted,
    syncStatus: SyncStatus.PENDING_SYNC,
  };
}

export function markSoftDeletedMeta(existing: SyncMetadata): SyncMetadata {
  return {
    ...createMeta(existing),
    isDeleted: true,
  };
}

export interface FullFarmSnapshot {
  settings: FarmSettings;
  preferences: AppPreferences;
  animals: Animal[];
  milkRecords: MilkRecord[];
  customers: Customer[];
  milkSales: MilkSale[];
  feedTypes: FeedType[];
  feedStockTransactions: FeedStockTransaction[];
  feedRecords: FeedRecord[];
  healthRecords: HealthRecord[];
  medicines: Medicine[];
  medicineUsages: MedicineUsage[];
  veterinaryVisits: VeterinaryVisit[];
  vaccinationRecords: VaccinationRecord[];
  breedingRecords: BreedingRecord[];
  pregnancyRecords: PregnancyRecord[];
  calvingRecords: CalvingRecord[];
  weightRecords: WeightRecord[];
  lactationRecords: LactationRecord[];
  incomeRecords: IncomeRecord[];
  expenseRecords: ExpenseRecord[];
  employees: Employee[];
  farmTasks: FarmTask[];
  reminders: Reminder[];
  syncConflicts: SyncConflictItem[];
  safetyBackups: SafetyBackupRecord[];
  pendingSyncCount: number;
}

export async function loadFullFarmSnapshot(): Promise<FullFarmSnapshot> {
  const db = await getDB();
  let settings = await db.get('farm_settings', 1);
  if (!settings) {
    settings = { ...DEFAULT_FARM_SETTINGS, updatedAt: Date.now() };
    await db.put('farm_settings', settings);
  }
  let preferences = await db.get('app_preferences', 1);
  if (!preferences) {
    preferences = { ...DEFAULT_APP_PREFERENCES, updatedAt: Date.now() };
    await db.put('app_preferences', preferences);
  }

  const [
    animals,
    milkRecords,
    customers,
    milkSales,
    feedTypes,
    feedStockTransactions,
    feedRecords,
    healthRecords,
    medicines,
    medicineUsages,
    veterinaryVisits,
    vaccinationRecords,
    breedingRecords,
    pregnancyRecords,
    calvingRecords,
    weightRecords,
    lactationRecords,
    incomeRecords,
    expenseRecords,
    employees,
    farmTasks,
    reminders,
    syncConflicts,
    safetyBackups,
  ] = await Promise.all([
    db.getAll('animals'),
    db.getAll('milk_records'),
    db.getAll('customers'),
    db.getAll('milk_sales'),
    db.getAll('feed_types'),
    db.getAll('feed_stock_transactions'),
    db.getAll('feed_records'),
    db.getAll('health_records'),
    db.getAll('medicines'),
    db.getAll('medicine_usages'),
    db.getAll('veterinary_visits'),
    db.getAll('vaccination_records'),
    db.getAll('breeding_records'),
    db.getAll('pregnancy_records'),
    db.getAll('calving_records'),
    db.getAll('weight_records'),
    db.getAll('lactation_records'),
    db.getAll('income_records'),
    db.getAll('expense_records'),
    db.getAll('employees'),
    db.getAll('farm_tasks'),
    db.getAll('reminders'),
    db.getAll('sync_conflicts'),
    db.getAll('safety_backups'),
  ]);

  const isWorkerSession = currentSyncActor?.role === 'WORKER';

  const workerSyncable: SyncMetadata[] = [
    ...animals,
    ...milkRecords,
    ...breedingRecords,
    ...pregnancyRecords,
    ...calvingRecords,
    ...weightRecords,
    ...lactationRecords,
  ].filter((x) => !x.isDeleted);

  const allOperational: SyncMetadata[] = isWorkerSession
    ? workerSyncable
    : [
        ...animals,
        ...milkRecords,
        ...customers,
        ...milkSales,
        ...feedTypes,
        ...feedStockTransactions,
        ...feedRecords,
        ...healthRecords,
        ...medicines,
        ...medicineUsages,
        ...veterinaryVisits,
        ...vaccinationRecords,
        ...breedingRecords,
        ...pregnancyRecords,
        ...calvingRecords,
        ...weightRecords,
        ...lactationRecords,
        ...incomeRecords,
        ...expenseRecords,
        ...employees,
        ...farmTasks,
        ...reminders.filter((r) => r.dedupeKey.startsWith('CUSTOM_') || r.dismissed),
      ];

  const pendingRecords = allOperational.filter(
    (item) =>
      item.syncStatus === SyncStatus.PENDING_SYNC ||
      item.syncStatus === SyncStatus.LOCAL_ONLY ||
      item.syncStatus === SyncStatus.ERROR
  ).length;
  const settingsPending =
    !isWorkerSession &&
    settings.setupCompleted &&
    settings.syncStatus === SyncStatus.PENDING_SYNC
      ? 1
      : 0;

  const filterActive = <T extends SyncMetadata>(list: T[]) => list.filter((x) => !x.isDeleted);

  return {
    settings,
    preferences,
    animals: filterActive(animals),
    milkRecords: filterActive(milkRecords),
    customers: isWorkerSession ? [] : filterActive(customers),
    milkSales: isWorkerSession ? [] : filterActive(milkSales),
    feedTypes: isWorkerSession ? [] : filterActive(feedTypes),
    feedStockTransactions: isWorkerSession ? [] : filterActive(feedStockTransactions),
    feedRecords: isWorkerSession ? [] : filterActive(feedRecords),
    healthRecords: isWorkerSession ? [] : filterActive(healthRecords),
    medicines: isWorkerSession ? [] : filterActive(medicines),
    medicineUsages: isWorkerSession ? [] : filterActive(medicineUsages),
    veterinaryVisits: isWorkerSession ? [] : filterActive(veterinaryVisits),
    vaccinationRecords: isWorkerSession ? [] : filterActive(vaccinationRecords),
    breedingRecords: filterActive(breedingRecords),
    pregnancyRecords: filterActive(pregnancyRecords),
    calvingRecords: filterActive(calvingRecords),
    weightRecords: filterActive(weightRecords),
    lactationRecords: filterActive(lactationRecords),
    incomeRecords: isWorkerSession ? [] : filterActive(incomeRecords),
    expenseRecords: isWorkerSession ? [] : filterActive(expenseRecords),
    employees: isWorkerSession ? [] : filterActive(employees),
    farmTasks: isWorkerSession ? [] : filterActive(farmTasks),
    reminders: isWorkerSession ? [] : filterActive(reminders),
    syncConflicts: isWorkerSession
      ? []
      : syncConflicts
          .filter((c) => c.status === 'OPEN')
          .sort((a, b) => b.updatedAtMs - a.updatedAtMs),
    safetyBackups: [...safetyBackups].sort((a, b) => b.createdAt - a.createdAt),
    pendingSyncCount: pendingRecords + settingsPending,
  };
}

// Atomic Calving + Calf Creation + Dam Status + Lactation Cycle Transaction
export interface CalfDraft {
  tagNumber: string;
  name?: string;
  gender: Gender;
  birthWeightKg?: number;
  color?: string;
}

export async function recordCalvingTransaction(params: {
  motherId: string;
  sireId?: string;
  breedingRecordId?: string;
  pregnancyRecordId?: string;
  calvingDate: string;
  calvingTime?: string;
  deliveryType?: 'NORMAL' | 'COMPLICATED';
  complications?: string;
  observations?: string;
  calves: CalfDraft[];
}): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(
    [
      'animals',
      'calving_records',
      'pregnancy_records',
      'lactation_records',
      'weight_records',
    ],
    'readwrite'
  );

  const animalStore = tx.objectStore('animals');
  const mother = await animalStore.get(params.motherId);
  if (!mother || mother.isDeleted) {
    throw new Error('Selected mother animal record does not exist.');
  }

  // Duplicate calving protection: prevent accidental duplicate delivery entry for the same mother
  const calvStore = tx.objectStore('calving_records');
  const priorMotherCalvings = (await calvStore.index('by-mother').getAll(mother.id)).filter(
    (c) => !c.isDeleted
  );
  for (const prev of priorMotherCalvings) {
    const gapDays = Math.abs(diffDaysIso(prev.calvingDate, params.calvingDate));
    if (gapDays === 0) {
      throw new Error(
        `Duplicate calving prevented: Delivery for Tag #${mother.tagNumber} on ${params.calvingDate} is already recorded.`
      );
    }
    if (gapDays < 180) {
      throw new Error(
        `Safety check: Tag #${mother.tagNumber} already has a recorded calving on ${prev.calvingDate} (${gapDays} days apart). Please verify the mother tag or date.`
      );
    }
  }

  const allAnimals = await animalStore.getAll();
  const usedTagsLower = new Set(
    allAnimals.filter((a) => !a.isDeleted).map((a) => a.tagNumber.toLowerCase())
  );

  const resolvedCalves: Array<CalfDraft & { resolvedTag: string }> = [];
  for (let i = 0; i < params.calves.length; i += 1) {
    const calf = params.calves[i];
    let cleanTag = calf.tagNumber.trim();
    if (!cleanTag) {
      // Auto-generate deterministic unique calf ear tag when entered quickly by Worker
      const compactDate = params.calvingDate.replace(/-/g, '').slice(2);
      const baseTag = `CALF-${mother.tagNumber}-${compactDate}-${i + 1}`;
      cleanTag = baseTag;
      let suffix = 2;
      while (usedTagsLower.has(cleanTag.toLowerCase())) {
        cleanTag = `${baseTag}-${suffix}`;
        suffix += 1;
      }
    } else if (usedTagsLower.has(cleanTag.toLowerCase())) {
      throw new Error(`Ear tag "${cleanTag}" is already assigned to another animal.`);
    }
    usedTagsLower.add(cleanTag.toLowerCase());
    resolvedCalves.push({ ...calf, resolvedTag: cleanTag });
  }

  const createdCalfIds: string[] = [];
  const genderLabels: string[] = [];
  let primaryBirthWeight: number | undefined;

  for (const calf of resolvedCalves) {
    const meta = createMeta();
    const calfAnimal: Animal = {
      ...meta,
      tagNumber: calf.resolvedTag,
      name: calf.name?.trim() || undefined,
      qrIdentifier: generateQrIdentifier(calf.resolvedTag, meta.id),
      species: mother.species,
      breed: mother.breed,
      gender: calf.gender,
      color: calf.color?.trim() || mother.color,
      dateOfBirth: params.calvingDate,
      shedLocation: mother.shedLocation,
      status: AnimalStatus.CALF,
      damId: mother.id,
      sireId: params.sireId || undefined,
      notes: `Born on farm from dam #${mother.tagNumber}`,
    };
    await animalStore.put(calfAnimal);
    createdCalfIds.push(calfAnimal.id);
    genderLabels.push(calf.gender === Gender.FEMALE ? 'Female' : 'Male');

    if (calf.birthWeightKg && calf.birthWeightKg > 0) {
      if (primaryBirthWeight === undefined) primaryBirthWeight = calf.birthWeightKg;
      const wMeta = createMeta();
      await tx.objectStore('weight_records').put({
        ...wMeta,
        animalId: calfAnimal.id,
        date: params.calvingDate,
        weightKg: calf.birthWeightKg,
        notes: 'Birth weight',
      });
    }
  }

  // Transition dam to LACTATING
  await animalStore.put({
    ...mother,
    ...createMeta(mother),
    status: AnimalStatus.LACTATING,
  });

  // Mark linked pregnancy as COMPLETED (automatically find active CONFIRMED pregnancy if not explicitly passed)
  const pregStore = tx.objectStore('pregnancy_records');
  let targetPregId = params.pregnancyRecordId;
  if (!targetPregId) {
    const motherPregs = (await pregStore.index('by-animal').getAll(mother.id)).filter(
      (p) => !p.isDeleted && (p.status === 'CONFIRMED' || p.status === 'SUSPECTED')
    );
    if (motherPregs.length > 0) {
      motherPregs.sort((a, b) => b.confirmationDate.localeCompare(a.confirmationDate));
      targetPregId = motherPregs[0].id;
    }
  }
  if (targetPregId) {
    const preg = await pregStore.get(targetPregId);
    if (preg) {
      await pregStore.put({
        ...preg,
        ...createMeta(preg),
        status: 'COMPLETED',
      });
    }
  }

  // Open new lactation cycle automatically
  const lactStore = tx.objectStore('lactation_records');
  const existingCycles = (await lactStore.index('by-animal').getAll(mother.id)).filter(
    (c) => !c.isDeleted
  );
  for (const activeCycle of existingCycles) {
    if (activeCycle.status !== 'COMPLETED') {
      await lactStore.put({
        ...activeCycle,
        ...createMeta(activeCycle),
        endDate: activeCycle.endDate || params.calvingDate,
        status: 'COMPLETED',
      });
    }
  }
  const nextLactNumber =
    existingCycles.length > 0 ? Math.max(...existingCycles.map((c) => c.lactationNumber)) + 1 : 1;
  const lactMeta = createMeta();
  await lactStore.put({
    ...lactMeta,
    animalId: mother.id,
    lactationNumber: nextLactNumber,
    startDate: params.calvingDate,
    status: 'ACTIVE',
    notes: `Started after calving (${createdCalfIds.length} calf/calves)`,
  });

  const resolvedDeliveryType: 'NORMAL' | 'COMPLICATED' =
    params.deliveryType || (params.complications?.trim() ? 'COMPLICATED' : 'NORMAL');

  // Save CalvingRecord
  const calvMeta = createMeta();
  await calvStore.put({
    ...calvMeta,
    motherId: mother.id,
    breedingRecordId: params.breedingRecordId,
    pregnancyRecordId: targetPregId,
    calvingDate: params.calvingDate,
    calvingTime: params.calvingTime || undefined,
    deliveryType: resolvedDeliveryType,
    calfCount: Math.max(resolvedCalves.length, 1),
    calfAnimalIds: createdCalfIds,
    calfGenderSummary: genderLabels.join(', ') || undefined,
    birthWeightKg: primaryBirthWeight,
    complications: params.complications?.trim() || undefined,
    observations: params.observations?.trim() || undefined,
  });

  await tx.done;
}

// Atomic Feed Stock Addition + Optional Expense Transaction
export async function recordFeedStockTransaction(params: {
  feedTypeId: string;
  date: string;
  transactionType: 'PURCHASE' | 'ADJUSTMENT_ADD' | 'ADJUSTMENT_REMOVE';
  quantityKg: number;
  unitCostPerKg: number;
  supplier?: string;
  notes?: string;
  logAsExpense: boolean;
}): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(
    ['feed_types', 'feed_stock_transactions', 'expense_records'],
    'readwrite'
  );
  const feedStore = tx.objectStore('feed_types');
  const feed = await feedStore.get(params.feedTypeId);
  if (!feed) throw new Error('Feed type not found.');

  const delta =
    params.transactionType === 'ADJUSTMENT_REMOVE' ? -params.quantityKg : params.quantityKg;
  const nextStock = Math.round((feed.currentStockKg + delta) * 100) / 100;
  if (nextStock < 0) {
    throw new Error(`Cannot deduct ${params.quantityKg} kg; only ${feed.currentStockKg} kg in stock.`);
  }

  const totalCost = Math.round(params.quantityKg * params.unitCostPerKg * 100) / 100;

  await feedStore.put({
    ...feed,
    ...createMeta(feed),
    currentStockKg: nextStock,
    unitCostPerKg: params.unitCostPerKg > 0 ? params.unitCostPerKg : feed.unitCostPerKg,
    supplier: params.supplier?.trim() || feed.supplier,
  });

  const tMeta = createMeta();
  await tx.objectStore('feed_stock_transactions').put({
    ...tMeta,
    feedTypeId: feed.id,
    date: params.date,
    transactionType: params.transactionType,
    quantityKg: params.quantityKg,
    unitCostPerKg: params.unitCostPerKg,
    totalCost,
    supplier: params.supplier?.trim() || undefined,
    notes: params.notes?.trim() || undefined,
  });

  if (params.logAsExpense && params.transactionType === 'PURCHASE' && totalCost > 0) {
    const eMeta = createMeta();
    await tx.objectStore('expense_records').put({
      ...eMeta,
      date: params.date,
      category: 'FEED',
      amount: totalCost,
      description: `Feed purchase: ${feed.name} (${params.quantityKg} kg)`,
      notes: params.supplier ? `Supplier: ${params.supplier}` : undefined,
    });
  }

  await tx.done;
}

// Atomic Feed Consumption + Stock Deduction
export async function recordFeedConsumptionTransaction(params: {
  feedTypeId: string;
  animalId?: string;
  groupOrShed?: string;
  date: string;
  quantityKg: number;
  allowNegativeOverride?: boolean;
  notes?: string;
}): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['feed_types', 'feed_records'], 'readwrite');
  const feedStore = tx.objectStore('feed_types');
  const feed = await feedStore.get(params.feedTypeId);
  if (!feed) throw new Error('Feed type not found.');

  if (feed.currentStockKg < params.quantityKg && !params.allowNegativeOverride) {
    throw new Error(
      `Insufficient stock (${feed.currentStockKg} kg available). Enable stock override or add stock first.`
    );
  }

  const nextStock = Math.max(0, Math.round((feed.currentStockKg - params.quantityKg) * 100) / 100);
  const totalCost = Math.round(params.quantityKg * feed.unitCostPerKg * 100) / 100;

  await feedStore.put({
    ...feed,
    ...createMeta(feed),
    currentStockKg: nextStock,
  });

  const rMeta = createMeta();
  await tx.objectStore('feed_records').put({
    ...rMeta,
    feedTypeId: feed.id,
    animalId: params.animalId || undefined,
    groupOrShed: params.groupOrShed?.trim() || undefined,
    date: params.date,
    quantityKg: params.quantityKg,
    unitCostPerKg: feed.unitCostPerKg,
    totalCost,
    notes: params.notes?.trim() || undefined,
  });

  await tx.done;
}

// Atomic Health Entry + Optional Medicine Stock Deduction + Optional Expense
export async function recordHealthTransaction(params: {
  animalId: string;
  date: string;
  symptoms: string;
  temperatureCelsius?: number;
  observations?: string;
  veterinaryFindings?: string;
  treatmentGiven?: string;
  medicineId?: string;
  medicineQuantityUsed?: number;
  dosageText?: string;
  cost: number;
  followUpDate?: string;
  status: 'SICK' | 'RECOVERING' | 'RESOLVED';
  notes?: string;
  logExpense: boolean;
}): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(
    ['health_records', 'medicines', 'medicine_usages', 'expense_records'],
    'readwrite'
  );

  let medName: string | undefined;
  let medUsageCost = 0;

  const hMeta = createMeta();

  if (params.medicineId && params.medicineQuantityUsed && params.medicineQuantityUsed > 0) {
    const medStore = tx.objectStore('medicines');
    const med = await medStore.get(params.medicineId);
    if (!med) throw new Error('Selected medicine not found.');
    if (med.currentStock < params.medicineQuantityUsed) {
      throw new Error(
        `Insufficient medicine stock (${med.currentStock} ${med.unit} remaining for ${med.name}).`
      );
    }
    medName = med.name;
    medUsageCost = Math.round(params.medicineQuantityUsed * med.costPerUnit * 100) / 100;

    await medStore.put({
      ...med,
      ...createMeta(med),
      currentStock: Math.round((med.currentStock - params.medicineQuantityUsed) * 100) / 100,
    });

    const uMeta = createMeta();
    await tx.objectStore('medicine_usages').put({
      ...uMeta,
      medicineId: med.id,
      healthRecordId: hMeta.id,
      animalId: params.animalId,
      date: params.date,
      quantityUsed: params.medicineQuantityUsed,
      dosageNotes: params.dosageText?.trim() || undefined,
      totalCost: medUsageCost,
    });
  }

  const totalCost = Math.round((params.cost + medUsageCost) * 100) / 100;

  await tx.objectStore('health_records').put({
    ...hMeta,
    animalId: params.animalId,
    date: params.date,
    symptoms: params.symptoms.trim(),
    temperatureCelsius: params.temperatureCelsius,
    observations: params.observations?.trim() || undefined,
    veterinaryFindings: params.veterinaryFindings?.trim() || undefined,
    treatmentGiven: params.treatmentGiven?.trim() || undefined,
    medicineId: params.medicineId || undefined,
    medicineName: medName,
    dosageText: params.dosageText?.trim() || undefined,
    cost: totalCost,
    followUpDate: params.followUpDate || undefined,
    status: params.status,
    notes: params.notes?.trim() || undefined,
  });

  if (params.logExpense && totalCost > 0) {
    const eMeta = createMeta();
    await tx.objectStore('expense_records').put({
      ...eMeta,
      date: params.date,
      category: 'MEDICINES',
      amount: totalCost,
      animalId: params.animalId,
      description: `Health treatment: ${params.symptoms.trim()}`,
    });
  }

  await tx.done;
}

// Deduplicated System Reminder Synchronizer
export async function syncSystemReminders(snapshot: FullFarmSnapshot): Promise<Reminder[]> {
  if (currentSyncActor?.role === 'WORKER') {
    return [];
  }

  const db = await getDB();
  const tx = db.transaction(['reminders'], 'readwrite');
  const store = tx.objectStore('reminders');
  const existing = await store.getAll();
  const byDedupe = new Map<string, Reminder>();
  for (const r of existing) {
    byDedupe.set(r.dedupeKey, r);
  }

  const today = getTodayIso();
  const animalMap = new Map(snapshot.animals.map((a) => [a.id, a]));
  const desired: Array<Omit<Reminder, keyof SyncMetadata | 'notifiedAt' | 'dismissed'>> = [];

  // 1. Vaccinations due within 14 days
  const twoWeeksOut = addDaysIso(today, 14);
  for (const v of snapshot.vaccinationRecords) {
    if (v.dueDate && v.dueDate <= twoWeeksOut) {
      const a = animalMap.get(v.animalId);
      desired.push({
        dedupeKey: `VAC_${v.id}_${v.dueDate}`,
        category: 'VACCINATION',
        title: `Vaccination Due: ${v.vaccineName}`,
        message: `${a ? `Tag #${a.tagNumber}` : 'Animal'} is due for ${v.vaccineName} on ${v.dueDate}.`,
        triggerDate: v.dueDate,
        animalId: v.animalId,
      });
    }
  }

  // 2. Pregnancy Check / Heat Return Follow-ups from Breeding Records within 7 days
  const weekOut = addDaysIso(today, 7);
  for (const b of snapshot.breedingRecords) {
    const checkDate = b.expectedPregnancyCheckDate || addDaysIso(b.breedingDate, 21);
    if (checkDate >= addDaysIso(today, -3) && checkDate <= weekOut) {
      const hasPregnancyEntry = snapshot.pregnancyRecords.some(
        (p) => p.breedingRecordId === b.id || (p.animalId === b.animalId && p.confirmationDate >= b.breedingDate)
      );
      if (!hasPregnancyEntry) {
        const a = animalMap.get(b.animalId);
        desired.push({
          dedupeKey: `PREG_CHK_${b.id}_${checkDate}`,
          category: 'PREGNANCY_FOLLOWUP',
          title: 'Pregnancy / Heat Follow-Up Due',
          message: `${a ? `Tag #${a.tagNumber}` : 'Animal'} bred on ${b.breedingDate} (${b.semenOrBullId}) is due for follow-up check.`,
          triggerDate: checkDate,
          animalId: b.animalId,
        });
      }
    }
  }

  // 3. Expected Calvings within 21 days
  const threeWeeksOut = addDaysIso(today, 21);
  for (const p of snapshot.pregnancyRecords) {
    if (p.status === 'CONFIRMED' && p.expectedCalvingDate <= threeWeeksOut) {
      const a = animalMap.get(p.animalId);
      desired.push({
        dedupeKey: `CALV_${p.id}_${p.expectedCalvingDate}`,
        category: 'EXPECTED_CALVING',
        title: 'Expected Calving Approaching',
        message: `${a ? `Tag #${a.tagNumber}` : 'Animal'} expected to calve around ${p.expectedCalvingDate}.`,
        triggerDate: p.expectedCalvingDate,
        animalId: p.animalId,
      });
    }
  }

  // 4. Vet follow-ups within 7 days
  for (const visit of snapshot.veterinaryVisits) {
    if (visit.followUpDate && visit.followUpDate <= weekOut) {
      const a = visit.animalId ? animalMap.get(visit.animalId) : undefined;
      desired.push({
        dedupeKey: `VET_${visit.id}_${visit.followUpDate}`,
        category: 'VET_FOLLOWUP',
        title: `Veterinary Follow-up (${visit.veterinarianName})`,
        message: `${a ? `Tag #${a.tagNumber}: ` : ''}${visit.reason}`,
        triggerDate: visit.followUpDate,
        animalId: visit.animalId,
      });
    }
  }

  // 5. Medicine Expiry & Low Stock
  const monthOut = addDaysIso(today, 30);
  for (const m of snapshot.medicines) {
    if (m.expiryDate && m.expiryDate <= monthOut) {
      desired.push({
        dedupeKey: `MED_EXP_${m.id}_${m.expiryDate}`,
        category: 'MEDICINE_EXPIRY',
        title: `Medicine Expiry Alert: ${m.name}`,
        message: `${m.name} expires on ${m.expiryDate}. Check stock before use.`,
        triggerDate: m.expiryDate,
      });
    }
    if (m.currentStock <= m.lowStockThreshold) {
      desired.push({
        dedupeKey: `MED_LOW_${m.id}`,
        category: 'LOW_MEDICINE_STOCK',
        title: `Low Medicine Stock: ${m.name}`,
        message: `Remaining: ${m.currentStock} ${m.unit} (reorder threshold ${m.lowStockThreshold} ${m.unit}).`,
        triggerDate: today,
      });
    }
  }

  // 6. Low Feed Stock
  for (const f of snapshot.feedTypes) {
    if (f.currentStockKg <= f.lowStockThresholdKg) {
      desired.push({
        dedupeKey: `FEED_LOW_${f.id}`,
        category: 'LOW_FEED_STOCK',
        title: `Low Feed Stock: ${f.name}`,
        message: `Remaining: ${f.currentStockKg} kg (threshold ${f.lowStockThresholdKg} kg).`,
        triggerDate: today,
      });
    }
  }

  // 7. Pending / Overdue Farm Tasks due today or earlier
  for (const task of snapshot.farmTasks) {
    if (task.status === 'PENDING' && task.dueDate <= today) {
      desired.push({
        dedupeKey: `TASK_${task.id}_${task.dueDate}`,
        category: 'TASK',
        title: `Farm Task: ${task.title}`,
        message: task.description || `Due on ${task.dueDate}`,
        triggerDate: task.dueDate,
        animalId: task.animalId,
      });
    }
  }

  for (const item of desired) {
    const found = byDedupe.get(item.dedupeKey);
    const deterministicId = `sysrem_${item.dedupeKey.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 88)}`;
    if (!found) {
      const now = Date.now();
      await store.put({
        id: deterministicId,
        farmId: SHARED_FARM_ID,
        createdAt: now,
        updatedAt: now,
        version: 1,
        baseVersion: 0,
        isDeleted: false,
        syncStatus: SyncStatus.LOCAL_ONLY,
        ...item,
        dismissed: false,
      });
    } else if (found.isDeleted) {
      await store.put({
        ...found,
        ...item,
        isDeleted: false,
        updatedAt: Date.now(),
      });
    }
  }

  await tx.done;
  const allNow = await db.getAll('reminders');
  return allNow.filter((r) => !r.isDeleted && !r.dismissed);
}

// Versioned Local JSON Backup & Pre-Validated Transactional Restore
export interface DairyTrackBackupEnvelope {
  app: 'DairyTrack';
  schemaVersion: 1;
  exportedAt: number;
  checksumSha256: string;
  payload: Record<string, unknown[]>;
}

const ALL_STORE_NAMES = [
  'farm_settings',
  'app_preferences',
  'animals',
  'milk_records',
  'customers',
  'milk_sales',
  'feed_types',
  'feed_stock_transactions',
  'feed_records',
  'health_records',
  'medicines',
  'medicine_usages',
  'veterinary_visits',
  'vaccination_records',
  'breeding_records',
  'pregnancy_records',
  'calving_records',
  'weight_records',
  'lactation_records',
  'income_records',
  'expense_records',
  'employees',
  'farm_tasks',
  'reminders',
] as const;

export async function createLocalBackupJson(updateTimestamp = true): Promise<string> {
  const db = await getDB();
  const payload: Record<string, unknown[]> = {};

  for (const storeName of ALL_STORE_NAMES) {
    payload[storeName] = await db.getAll(storeName);
  }

  const canonicalPayload = JSON.stringify(payload);
  const checksumSha256 = await sha256Hex(canonicalPayload);

  const now = Date.now();
  if (updateTimestamp) {
    const prefs = (await db.get('app_preferences', 1)) || DEFAULT_APP_PREFERENCES;
    await db.put('app_preferences', { ...prefs, lastLocalBackupAt: now, updatedAt: now });
  }

  const envelope: DairyTrackBackupEnvelope = {
    app: 'DairyTrack',
    schemaVersion: 1,
    exportedAt: now,
    checksumSha256,
    payload,
  };

  return JSON.stringify(envelope, null, 2);
}

export async function createPreRestoreSafetyBackup(reason: string): Promise<SafetyBackupRecord> {
  const db = await getDB();
  const backupJson = await createLocalBackupJson(false);
  const parsed = JSON.parse(backupJson) as DairyTrackBackupEnvelope;
  let recordCount = 0;
  for (const arr of Object.values(parsed.payload)) {
    if (Array.isArray(arr)) recordCount += arr.length;
  }

  const safetyRecord: SafetyBackupRecord = {
    id: `safety_${Date.now()}`,
    createdAt: Date.now(),
    reason,
    recordCount,
    backupJson,
  };

  await db.put('safety_backups', safetyRecord);

  // Retain latest 3 pre-restore safety backups so local storage stays bounded
  const allSafety = await db.getAll('safety_backups');
  if (allSafety.length > 3) {
    allSafety.sort((a, b) => b.createdAt - a.createdAt);
    for (const stale of allSafety.slice(3)) {
      await db.delete('safety_backups', stale.id);
    }
  }

  return safetyRecord;
}

export async function restoreFromLocalBackupJson(
  rawJson: string,
  options?: { skipSafetyBackup?: boolean }
): Promise<{ restoredRecords: number }> {
  let parsed: DairyTrackBackupEnvelope;
  try {
    parsed = JSON.parse(rawJson) as DairyTrackBackupEnvelope;
  } catch {
    throw new Error('Invalid JSON file. Backup could not be parsed.');
  }

  if (parsed.app !== 'DairyTrack' || parsed.schemaVersion !== 1 || !parsed.payload) {
    throw new Error('Incompatible backup header or unsupported schema version.');
  }

  // Verify SHA-256 checksum BEFORE touching any existing database tables
  const computedHash = await sha256Hex(JSON.stringify(parsed.payload));
  if (computedHash !== parsed.checksumSha256) {
    throw new Error(
      'Backup integrity checksum mismatch. Restoration aborted to protect your current farm data.'
    );
  }

  for (const storeName of ALL_STORE_NAMES) {
    if (parsed.payload[storeName] !== undefined && !Array.isArray(parsed.payload[storeName])) {
      throw new Error(`Corrupted table array in backup: ${storeName}`);
    }
  }

  // Automatic Pre-Restore Safety Backup BEFORE modifying local SQLite/IndexedDB stores
  if (!options?.skipSafetyBackup) {
    await createPreRestoreSafetyBackup('Automatic safety snapshot before backup restore');
  }

  const db = await getDB();
  const tx = db.transaction([...ALL_STORE_NAMES], 'readwrite');
  let restoredRecords = 0;

  for (const storeName of ALL_STORE_NAMES) {
    const store = tx.objectStore(storeName);
    await store.clear();
    const items = parsed.payload[storeName] || [];
    for (const item of items) {
      if (storeName === 'app_preferences') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await store.put(item as any);
      } else if (storeName === 'farm_settings') {
        await store.put({
          ...(item as Record<string, unknown>),
          id: 1,
          farmId: SHARED_FARM_ID,
          syncStatus: SyncStatus.PENDING_SYNC,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
      } else {
        const rec = item as Record<string, unknown>;
        await store.put({
          ...rec,
          farmId: SHARED_FARM_ID,
          syncStatus: SyncStatus.PENDING_SYNC,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
      }
      restoredRecords += 1;
    }
  }

  await tx.done;
  return { restoredRecords };
}

export async function restoreFromSafetyBackup(
  safetyId: string
): Promise<{ restoredRecords: number }> {
  const db = await getDB();
  const safety = await db.get('safety_backups', safetyId);
  if (!safety) {
    throw new Error('Selected safety backup snapshot was not found on this phone.');
  }
  return restoreFromLocalBackupJson(safety.backupJson, { skipSafetyBackup: true });
}

export function downloadCsvFile(filename: string, headers: string[], rows: Array<Array<string | number | undefined | null>>) {
  const escapeCsv = (val: string | number | undefined | null) => {
    if (val === undefined || val === null) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [
    headers.map(escapeCsv).join(','),
    ...rows.map((row) => row.map(escapeCsv).join(',')),
  ];
  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
