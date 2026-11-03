export enum SyncStatus {
  LOCAL_ONLY = 'LOCAL_ONLY',
  PENDING_SYNC = 'PENDING_SYNC',
  SYNCED = 'SYNCED',
  CONFLICT = 'CONFLICT',
  ERROR = 'ERROR',
}

export enum Species {
  COW = 'COW',
  BUFFALO = 'BUFFALO',
}

export enum Gender {
  FEMALE = 'FEMALE',
  MALE = 'MALE',
}

export enum AnimalStatus {
  ACTIVE = 'ACTIVE',
  LACTATING = 'LACTATING',
  PREGNANT = 'PREGNANT',
  DRY = 'DRY',
  HEIFER = 'HEIFER',
  CALF = 'CALF',
  SOLD = 'SOLD',
  DECEASED = 'DECEASED',
}

export enum MilkSession {
  MORNING = 'MORNING',
  AFTERNOON = 'AFTERNOON',
  EVENING = 'EVENING',
}

export const FARM_COMBINED_ANIMAL_ID = 'FARM_COMBINED';

export type UserRole = 'ADMIN' | 'MEMBER' | 'WORKER' | 'OFFLINE_LOCAL' | 'UNAUTHORIZED';

export type OperationalStoreName =
  | 'animals'
  | 'milk_records'
  | 'customers'
  | 'milk_sales'
  | 'feed_types'
  | 'feed_stock_transactions'
  | 'feed_records'
  | 'health_records'
  | 'medicines'
  | 'medicine_usages'
  | 'veterinary_visits'
  | 'vaccination_records'
  | 'breeding_records'
  | 'pregnancy_records'
  | 'calving_records'
  | 'weight_records'
  | 'lactation_records'
  | 'income_records'
  | 'expense_records'
  | 'employees'
  | 'farm_tasks'
  | 'reminders';

export interface CorrectionAuditEntry {
  timestamp: number;
  byUid: string;
  byEmail: string;
  byRole: UserRole;
  summary: string;
  reason: string;
}

export interface SyncMetadata {
  id: string;
  farmId?: string;
  createdAt: number;
  createdByUid?: string;
  createdByEmail?: string;
  createdByRole?: UserRole;
  createdByName?: string;
  updatedAt: number;
  updatedBy?: string;
  updatedByEmail?: string;
  updatedByRole?: UserRole;
  reviewStatus?: 'PENDING_REVIEW' | 'VERIFIED' | 'CORRECTED';
  correctionHistory?: CorrectionAuditEntry[];
  version: number;
  baseVersion?: number;
  isDeleted: boolean;
  syncStatus: SyncStatus;
}

export interface FarmSettings {
  id: number; // singleton = 1
  farmId?: string;
  farmName: string;
  ownerName: string;
  phone: string;
  address: string;
  currencySymbol: string;
  volumeUnit: string;
  weightUnit: string;
  enableAfternoonSession: boolean;
  defaultMilkRatePerLitre: number;
  gestationDaysCow: number;
  gestationDaysBuffalo: number;
  notificationsEnabled: boolean;
  setupCompleted: boolean;
  version?: number;
  updatedBy?: string;
  updatedByEmail?: string;
  syncStatus?: SyncStatus;
  updatedAt: number;
}

export interface AppPreferences {
  id: number; // singleton = 1 (strictly local per Android device)
  language: 'en' | 'mr';
  pinEnabled: boolean;
  pinHash: string | null;
  pinSalt: string | null;
  biometricEnabled: boolean;
  biometricCredentialId: string | null;
  cloudSyncEnabled: boolean;
  lastLocalBackupAt: number | null;
  lastCloudSyncedAt?: number | null;
  updatedAt: number;
}

export interface FarmAccessProfile {
  farmId: string;
  farmName: string;
  adminUid: string;
  adminEmail: string;
  memberEmail: string;
  memberUid: string;
  workerEmail: string;
  workerUid: string;
  workerActive: boolean;
  managerEmails: string[];
  authorizedEmails: string[];
}

export interface SafetyBackupRecord {
  id: string;
  createdAt: number;
  reason: string;
  recordCount: number;
  backupJson: string;
}

export interface CloudBackupMeta {
  backupId: string;
  label: string;
  schemaVersion: number;
  recordCount: number;
  checksumSha256: string;
  adminEmail: string;
  createdAtMs: number;
}

export interface SyncConflictItem {
  conflictId: string;
  farmId: string;
  docId: string;
  storeName: OperationalStoreName;
  recordId: string;
  serverVersion: number;
  proposedBaseVersion: number;
  serverData: Record<string, unknown>;
  proposedData: Record<string, unknown>;
  serverUpdatedByEmail: string;
  proposedByUid: string;
  proposedByEmail: string;
  status: 'OPEN' | 'RESOLVED';
  resolution: '' | 'KEEP_SERVER' | 'APPLY_PROPOSED' | 'KEEP_BOTH';
  createdAtMs: number;
  updatedAtMs: number;
}

export interface CloudSyncState {
  authReady: boolean;
  currentUser: {
    uid: string;
    email: string;
    displayName: string | null;
    emailVerified: boolean;
  } | null;
  role: UserRole;
  unauthorizedReason: string | null;
  farmAccess: FarmAccessProfile | null;
  status: 'OFFLINE' | 'LOCAL_ONLY' | 'SYNCING' | 'SYNCED' | 'PENDING' | 'CONFLICT' | 'ERROR';
  pendingCount: number;
  openConflictCount: number;
  lastSyncedAt: number | null;
  lastSyncError: string | null;
}

export interface Animal extends SyncMetadata {
  tagNumber: string;
  name?: string;
  qrIdentifier: string;
  rfidTag?: string;
  photoDataUrl?: string;
  species: Species;
  breed: string;
  gender: Gender;
  color?: string;
  dateOfBirth?: string; // YYYY-MM-DD
  purchaseDate?: string; // YYYY-MM-DD
  purchasePrice?: number;
  sellerInfo?: string;
  shedLocation?: string;
  status: AnimalStatus;
  damId?: string;
  sireId?: string;
  notes?: string;
}

export interface MilkRecord extends SyncMetadata {
  animalId: string; // 'FARM_COMBINED' for combined farm-wide milk sessions
  entryType?: 'COMBINED' | 'INDIVIDUAL';
  date: string; // YYYY-MM-DD
  session: MilkSession;
  entryTime?: string; // HH:mm
  workerName?: string;
  quantityLitres: number;
  fatPercentage?: number;
  snfPercentage?: number;
  qualityGrade?: 'A' | 'B' | 'C';
  pricePerLitre?: number;
  totalValue?: number;
  notes?: string;
}

export interface Customer extends SyncMetadata {
  name: string;
  phone: string;
  address?: string;
  defaultPricePerLitre: number;
  isActive: boolean;
  notes?: string;
}

export interface MilkSale extends SyncMetadata {
  customerId?: string;
  customerName: string;
  date: string; // YYYY-MM-DD
  session: MilkSession | 'BULK';
  quantityLitres: number;
  pricePerLitre: number;
  totalAmount: number;
  paymentStatus: 'PAID' | 'PENDING' | 'PARTIAL';
  notes?: string;
}

export interface FeedType extends SyncMetadata {
  name: string;
  category: 'GREEN_FODDER' | 'DRY_FODDER' | 'SILAGE' | 'CONCENTRATE' | 'MINERAL_MIX' | 'OTHER';
  supplier?: string;
  unit: string; // kg
  currentStockKg: number;
  lowStockThresholdKg: number;
  unitCostPerKg: number;
  notes?: string;
}

export interface FeedStockTransaction extends SyncMetadata {
  feedTypeId: string;
  date: string; // YYYY-MM-DD
  transactionType: 'PURCHASE' | 'ADJUSTMENT_ADD' | 'ADJUSTMENT_REMOVE';
  quantityKg: number;
  unitCostPerKg: number;
  totalCost: number;
  supplier?: string;
  notes?: string;
}

export interface FeedRecord extends SyncMetadata {
  feedTypeId: string;
  animalId?: string; // null/undefined = group/shed ration
  groupOrShed?: string;
  date: string; // YYYY-MM-DD
  quantityKg: number;
  unitCostPerKg: number;
  totalCost: number;
  notes?: string;
}

export interface HealthRecord extends SyncMetadata {
  animalId: string;
  date: string; // YYYY-MM-DD
  symptoms: string;
  temperatureCelsius?: number;
  observations?: string;
  veterinaryFindings?: string;
  treatmentGiven?: string;
  medicineId?: string;
  medicineName?: string;
  dosageText?: string;
  cost: number;
  followUpDate?: string; // YYYY-MM-DD
  status: 'SICK' | 'RECOVERING' | 'RESOLVED';
  notes?: string;
}

export interface Medicine extends SyncMetadata {
  name: string;
  unit: string; // ml, bolus, vial, g
  batchNumber?: string;
  expiryDate?: string; // YYYY-MM-DD
  currentStock: number;
  lowStockThreshold: number;
  costPerUnit: number;
  notes?: string;
}

export interface MedicineUsage extends SyncMetadata {
  medicineId: string;
  healthRecordId?: string;
  animalId: string;
  date: string; // YYYY-MM-DD
  quantityUsed: number;
  dosageNotes?: string;
  totalCost: number;
}

export interface VeterinaryVisit extends SyncMetadata {
  animalId?: string; // optional if general herd inspection
  veterinarianName: string;
  veterinarianPhone?: string;
  visitDate: string; // YYYY-MM-DD
  reason: string;
  findings?: string;
  treatment?: string;
  medicinePrescribed?: string;
  cost: number;
  followUpDate?: string; // YYYY-MM-DD
  notes?: string;
}

export interface VaccinationRecord extends SyncMetadata {
  animalId: string;
  vaccineName: string;
  administeredDate: string; // YYYY-MM-DD
  dueDate?: string; // YYYY-MM-DD
  veterinarian?: string;
  batchNumber?: string;
  cost: number;
  notes?: string;
}

export interface BreedingRecord extends SyncMetadata {
  animalId: string;
  heatDate: string; // YYYY-MM-DD
  heatNotes?: string;
  breedingDate: string; // YYYY-MM-DD
  breedingTime?: string; // HH:mm
  expectedPregnancyCheckDate?: string; // YYYY-MM-DD
  method: 'AI' | 'NATURAL';
  semenOrBullId: string;
  sireAnimalId?: string;
  sireBreed?: string;
  semenSource?: string;
  technician?: string;
  attemptNumber: number;
  cost: number;
  notes?: string;
}

export interface PregnancyRecord extends SyncMetadata {
  animalId: string;
  breedingRecordId: string;
  confirmationDate: string; // YYYY-MM-DD
  status: 'CONFIRMED' | 'SUSPECTED' | 'NEGATIVE' | 'COMPLETED' | 'LOST';
  gestationDaysUsed: number;
  expectedCalvingDate: string; // YYYY-MM-DD
  expectedDryOffDate?: string; // YYYY-MM-DD
  notes?: string;
}

export interface CalvingRecord extends SyncMetadata {
  motherId: string;
  breedingRecordId?: string;
  pregnancyRecordId?: string;
  calvingDate: string; // YYYY-MM-DD
  calvingTime?: string; // HH:mm
  deliveryType?: 'NORMAL' | 'COMPLICATED';
  calfCount: number;
  calfAnimalIds: string[];
  calfGenderSummary?: string;
  birthWeightKg?: number;
  complications?: string;
  observations?: string;
}

export interface WeightRecord extends SyncMetadata {
  animalId: string;
  date: string; // YYYY-MM-DD
  weightKg: number;
  notes?: string;
}

export interface LactationRecord extends SyncMetadata {
  animalId: string;
  lactationNumber: number;
  startDate: string; // YYYY-MM-DD
  dryOffDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  peakDailyLitres?: number;
  manualTotalLitres?: number;
  status: 'ACTIVE' | 'DRY_PERIOD' | 'COMPLETED';
  notes?: string;
}

export type IncomeCategory = 'MILK_SALES' | 'ANIMAL_SALES' | 'CALF_SALES' | 'MANURE' | 'OTHER';

export interface IncomeRecord extends SyncMetadata {
  date: string; // YYYY-MM-DD
  category: IncomeCategory;
  amount: number;
  animalId?: string;
  milkSaleId?: string;
  description: string;
  notes?: string;
}

export type ExpenseCategory =
  | 'FEED'
  | 'MEDICINES'
  | 'VETERINARY'
  | 'BREEDING'
  | 'LABOUR'
  | 'EQUIPMENT'
  | 'ANIMAL_PURCHASE'
  | 'MAINTENANCE'
  | 'OTHER';

export interface ExpenseRecord extends SyncMetadata {
  date: string; // YYYY-MM-DD
  category: ExpenseCategory;
  amount: number;
  animalId?: string;
  employeeId?: string;
  description: string;
  notes?: string;
}

export interface Employee extends SyncMetadata {
  name: string;
  phone: string;
  role: string;
  joiningDate: string; // YYYY-MM-DD
  isActive: boolean;
  notes?: string;
}

export interface FarmTask extends SyncMetadata {
  title: string;
  description?: string;
  dueDate: string; // YYYY-MM-DD
  dueTime?: string; // HH:mm
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'PENDING' | 'COMPLETED';
  animalId?: string;
  notes?: string;
}

export interface Reminder extends SyncMetadata {
  dedupeKey: string; // prevents duplicate scheduling
  category:
    | 'VACCINATION'
    | 'PREGNANCY_FOLLOWUP'
    | 'EXPECTED_CALVING'
    | 'VET_FOLLOWUP'
    | 'MEDICINE_EXPIRY'
    | 'LOW_MEDICINE_STOCK'
    | 'LOW_FEED_STOCK'
    | 'TASK'
    | 'CUSTOM';
  title: string;
  message: string;
  triggerDate: string; // YYYY-MM-DD
  animalId?: string;
  notifiedAt?: number;
  dismissed: boolean;
}

export type ActiveRoute =
  | { name: 'dashboard' }
  | { name: 'animals'; filterStatus?: AnimalStatus | 'ALL'; openAdd?: boolean }
  | { name: 'animal-profile'; animalId: string; initialTab?: string }
  | { name: 'milk'; initialTab?: 'combined' | 'production' | 'batch' | 'sales' | 'customers' }
  | { name: 'more' }
  | { name: 'feed' }
  | { name: 'health'; initialTab?: 'health' | 'medicines' | 'vet' | 'vaccinations' }
  | { name: 'breeding'; initialTab?: 'breeding' | 'pregnancy' | 'calving' | 'calves' | 'weight-lactation' }
  | { name: 'finance'; initialTab?: 'summary' | 'income' | 'expenses' | 'staff' }
  | { name: 'tasks' }
  | { name: 'reports' }
  | { name: 'backup' }
  | { name: 'settings' };
