import { onAuthStateChanged, User } from 'firebase/auth';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  CalfDraft,
  createLocalBackupJson,
  createMeta,
  DEFAULT_APP_PREFERENCES,
  DEFAULT_FARM_SETTINGS,
  FullFarmSnapshot,
  getDB,
  loadFullFarmSnapshot,
  markSoftDeletedMeta,
  recordCalvingTransaction,
  recordFeedConsumptionTransaction,
  recordFeedStockTransaction,
  recordHealthTransaction,
  restoreFromLocalBackupJson,
  restoreFromSafetyBackup,
  setCurrentSyncActor,
  SHARED_FARM_ID,
  syncSystemReminders,
} from '../data/db';
import {
  calculateExpectedPregnancyFollowUpDate,
  calculateMilkValue,
  getCurrentTimeHm,
  getTodayIso,
  isCombinedMilkRecord,
  makeCombinedMilkId,
  validateMilkEntry,
} from '../domain/calculations';
import { dispatchLocalNotification } from '../hooks/usePWA';
import {
  adminForcePushAllRestoredRecords,
  createCloudBackupSnapshotAsAdmin,
  initializeOrVerifyFarmMembership,
  listCloudBackupSnapshotsAsAdmin,
  pushPendingChangesToCloud,
  resolveConflictAsAdmin,
  restoreCloudBackupSnapshotAsAdmin,
  signInWithGooglePopup,
  signOutCloudAccount,
  startRealtimeFarmListeners,
  updateTeamAccessAsAdmin,
} from '../services/cloudSync';
import { auth, formatSyncErrorForFarmer } from '../services/firebase';
import {
  ActiveRoute,
  Animal,
  AnimalStatus,
  AppPreferences,
  BreedingRecord,
  CloudBackupMeta,
  CloudSyncState,
  CorrectionAuditEntry,
  Customer,
  Employee,
  ExpenseRecord,
  FARM_COMBINED_ANIMAL_ID,
  FarmAccessProfile,
  FarmSettings,
  FarmTask,
  FeedType,
  IncomeRecord,
  LactationRecord,
  Medicine,
  MilkRecord,
  MilkSale,
  MilkSession,
  OperationalStoreName,
  PregnancyRecord,
  Reminder,
  SyncConflictItem,
  SyncMetadata,
  SyncStatus,
  UserRole,
  VaccinationRecord,
  VeterinaryVisit,
  WeightRecord,
} from '../types/models';

export interface ToastNotice {
  id: string;
  message: string;
  tone: 'success' | 'error' | 'info';
}

interface FarmContextValue extends FullFarmSnapshot {
  isLoading: boolean;
  isLocked: boolean;
  unlockApp: () => void;
  lockAppNow: () => void;
  route: ActiveRoute;
  navigate: (next: ActiveRoute) => void;
  toast: ToastNotice | null;
  notify: (message: string, tone?: 'success' | 'error' | 'info') => void;
  dismissToast: () => void;
  refreshAll: () => Promise<void>;

  // Three-User Cloud Sync & RBAC
  syncState: CloudSyncState;
  cloudSync: CloudSyncState; // backward-compatible alias
  canAdministerFarm: boolean; // Admin (or unlinked offline owner)
  canManageFinances: boolean; // Admin + Uncle (Full Financial Access)
  canReviewWorkerEntries: boolean; // Admin + Uncle
  isWorker: boolean; // Restricted Farm Worker
  signInToSharedFarm: () => Promise<void>;
  signOutFromSharedFarm: () => Promise<void>;
  triggerCloudSync: () => Promise<void>;
  saveUncleMemberEmail: (uncleEmail: string) => Promise<void>;
  updateTeamAccess: (input: {
    memberEmail: string;
    workerEmail: string;
    workerActive: boolean;
  }) => Promise<void>;
  resolveSyncConflict: (
    conflict: SyncConflictItem,
    resolution: 'KEEP_SERVER' | 'APPLY_PROPOSED' | 'KEEP_BOTH'
  ) => Promise<void>;

  // Audit & Correction Workflows (Admin + Uncle)
  applyAuditedCorrection: (params: {
    storeName: 'milk_records' | 'breeding_records' | 'calving_records';
    recordId: string;
    updates: Record<string, unknown>;
    summary: string;
    reason: string;
  }) => Promise<void>;
  markWorkerEntryVerified: (
    storeName: 'milk_records' | 'breeding_records' | 'calving_records',
    recordId: string
  ) => Promise<void>;

  // Settings & Preferences
  saveSettings: (next: Partial<FarmSettings>) => Promise<void>;
  savePreferences: (next: Partial<AppPreferences>) => Promise<void>;

  // Animals
  upsertAnimal: (animal: Omit<Animal, keyof SyncMetadata> & { id?: string }) => Promise<Animal>;
  archiveAnimal: (animalId: string) => Promise<void>;

  // Combined Farm-Wide Milk & Individual Milk & Sales
  submitCombinedMilkSession: (input: {
    date: string;
    session: MilkSession.MORNING | MilkSession.EVENING | MilkSession.AFTERNOON;
    quantityLitres: number;
    entryTime?: string;
    workerName?: string;
    fatPercentage?: number;
    snfPercentage?: number;
    notes?: string;
  }) => Promise<void>;
  upsertMilkRecord: (
    record: Omit<MilkRecord, keyof SyncMetadata> & { id?: string }
  ) => Promise<void>;
  saveBatchMilkRecords: (
    entries: Array<Omit<MilkRecord, keyof SyncMetadata>>
  ) => Promise<number>;
  deleteMilkRecord: (id: string) => Promise<void>;
  upsertCustomer: (
    customer: Omit<Customer, keyof SyncMetadata> & { id?: string }
  ) => Promise<void>;
  recordMilkSale: (
    sale: Omit<MilkSale, keyof SyncMetadata>,
    logIncome: boolean
  ) => Promise<void>;
  updateMilkSalePaymentStatus: (
    saleId: string,
    nextStatus: 'PAID' | 'PENDING' | 'PARTIAL',
    postIncomeWhenPaid: boolean
  ) => Promise<void>;

  // Feed
  upsertFeedType: (feed: Omit<FeedType, keyof SyncMetadata> & { id?: string }) => Promise<void>;
  addFeedStock: (params: Parameters<typeof recordFeedStockTransaction>[0]) => Promise<void>;
  logFeedConsumption: (
    params: Parameters<typeof recordFeedConsumptionTransaction>[0]
  ) => Promise<void>;

  // Health, Medicine, Vet & Vaccination
  logHealthEvent: (params: Parameters<typeof recordHealthTransaction>[0]) => Promise<void>;
  updateHealthStatus: (id: string, status: 'SICK' | 'RECOVERING' | 'RESOLVED') => Promise<void>;
  upsertMedicine: (med: Omit<Medicine, keyof SyncMetadata> & { id?: string }) => Promise<void>;
  logVeterinaryVisit: (
    visit: Omit<VeterinaryVisit, keyof SyncMetadata>,
    logExpense: boolean
  ) => Promise<void>;
  logVaccination: (
    vac: Omit<VaccinationRecord, keyof SyncMetadata>,
    logExpense: boolean
  ) => Promise<void>;

  // Breeding, Pregnancy, Calving, Weight & Lactation
  logBreedingAttempt: (
    record: Omit<BreedingRecord, keyof SyncMetadata>,
    logExpense: boolean
  ) => Promise<void>;
  logPregnancyCheck: (
    record: Omit<PregnancyRecord, keyof SyncMetadata>,
    updateAnimalStatus: boolean
  ) => Promise<void>;
  logCalvingWithCalves: (params: Parameters<typeof recordCalvingTransaction>[0]) => Promise<void>;
  logWeightRecord: (record: Omit<WeightRecord, keyof SyncMetadata>) => Promise<void>;
  upsertLactationCycle: (
    record: Omit<LactationRecord, keyof SyncMetadata> & { id?: string }
  ) => Promise<void>;

  // Finance & Employees (Full Access for Admin & Uncle)
  addIncome: (record: Omit<IncomeRecord, keyof SyncMetadata>) => Promise<void>;
  upsertIncome: (record: Omit<IncomeRecord, keyof SyncMetadata> & { id?: string }) => Promise<void>;
  addExpense: (record: Omit<ExpenseRecord, keyof SyncMetadata>) => Promise<void>;
  upsertExpense: (
    record: Omit<ExpenseRecord, keyof SyncMetadata> & { id?: string }
  ) => Promise<void>;
  deleteFinanceEntry: (kind: 'income' | 'expense', id: string) => Promise<void>;
  upsertEmployee: (emp: Omit<Employee, keyof SyncMetadata> & { id?: string }) => Promise<void>;

  // Tasks & Reminders
  upsertTask: (task: Omit<FarmTask, keyof SyncMetadata> & { id?: string }) => Promise<void>;
  toggleTaskComplete: (taskId: string) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  addCustomReminder: (
    rem: Omit<Reminder, keyof SyncMetadata | 'dedupeKey' | 'dismissed'>
  ) => Promise<void>;
  dismissReminder: (id: string) => Promise<void>;

  // Backup, Pre-Restore Safety Backup & Optional Cloud Backup
  cloudBackups: CloudBackupMeta[];
  refreshCloudBackups: () => Promise<void>;
  createCloudBackup: (label: string) => Promise<CloudBackupMeta>;
  restoreFromCloudBackup: (backupId: string) => Promise<{ restoredRecords: number }>;
  rollbackSafetyBackup: (safetyId: string) => Promise<{ restoredRecords: number }>;
  exportBackup: () => Promise<string>;
  importBackup: (rawJson: string) => Promise<{ restoredRecords: number }>;
}

const FarmContext = createContext<FarmContextValue | null>(null);

export const FarmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [snapshot, setSnapshot] = useState<FullFarmSnapshot>({
    settings: DEFAULT_FARM_SETTINGS,
    preferences: DEFAULT_APP_PREFERENCES,
    animals: [],
    milkRecords: [],
    customers: [],
    milkSales: [],
    feedTypes: [],
    feedStockTransactions: [],
    feedRecords: [],
    healthRecords: [],
    medicines: [],
    medicineUsages: [],
    veterinaryVisits: [],
    vaccinationRecords: [],
    breedingRecords: [],
    pregnancyRecords: [],
    calvingRecords: [],
    weightRecords: [],
    lactationRecords: [],
    incomeRecords: [],
    expenseRecords: [],
    employees: [],
    farmTasks: [],
    reminders: [],
    syncConflicts: [],
    safetyBackups: [],
    pendingSyncCount: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [lockEvaluated, setLockEvaluated] = useState(false);
  const [route, setRoute] = useState<ActiveRoute>({ name: 'dashboard' });
  const [toast, setToast] = useState<ToastNotice | null>(null);
  const [cloudBackups, setCloudBackups] = useState<CloudBackupMeta[]>([]);

  // Cloud Sync State
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>('OFFLINE_LOCAL');
  const [unauthorizedReason, setUnauthorizedReason] = useState<string | null>(null);
  const [farmAccess, setFarmAccess] = useState<FarmAccessProfile | null>(null);
  const [isSyncingNow, setIsSyncingNow] = useState(false);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  const firebaseUserRef = useRef<User | null>(null);
  const roleRef = useRef<UserRole>('OFFLINE_LOCAL');
  const farmAccessRef = useRef<FarmAccessProfile | null>(null);
  const syncTimerRef = useRef<number | null>(null);

  firebaseUserRef.current = firebaseUser;
  roleRef.current = role;
  farmAccessRef.current = farmAccess;

  const notify = useCallback((message: string, tone: 'success' | 'error' | 'info' = 'success') => {
    const id = crypto.randomUUID();
    setToast({ id, message, tone });
    setTimeout(() => {
      setToast((prev) => (prev?.id === id ? null : prev));
    }, 4200);
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  const assertNotWorker = (actionDescription: string) => {
    if (roleRef.current === 'WORKER' || roleRef.current === 'UNAUTHORIZED') {
      throw new Error(`Permission denied: Farm Workers cannot ${actionDescription}.`);
    }
  };

  const assertAdminOnly = (actionDescription: string) => {
    if (roleRef.current !== 'ADMIN' && roleRef.current !== 'OFFLINE_LOCAL') {
      throw new Error(`Permission denied: Only the Farm Administrator can ${actionDescription}.`);
    }
  };

  const refreshAll = useCallback(async () => {
    const data = await loadFullFarmSnapshot();
    const activeReminders = await syncSystemReminders(data);
    const merged: FullFarmSnapshot = { ...data, reminders: activeReminders };
    setSnapshot(merged);

    if (!lockEvaluated) {
      if (merged.preferences.pinEnabled && merged.preferences.pinHash) {
        setIsLocked(true);
      }
      setLockEvaluated(true);
    }

    if (merged.settings.notificationsEnabled && roleRef.current !== 'WORKER') {
      const today = getTodayIso();
      const localDb = await getDB();
      for (const rem of activeReminders) {
        if (!rem.notifiedAt && rem.triggerDate <= today) {
          const sent = await dispatchLocalNotification(rem.title, rem.message, rem.dedupeKey);
          if (sent) {
            await localDb.put('reminders', { ...rem, notifiedAt: Date.now() });
          }
        }
      }
    }
    setIsLoading(false);
  }, [lockEvaluated]);

  const executeBackgroundPush = useCallback(async () => {
    const u = firebaseUserRef.current;
    const r = roleRef.current;
    const access = farmAccessRef.current;
    if (!u || (r !== 'ADMIN' && r !== 'MEMBER' && r !== 'WORKER') || !access) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    setIsSyncingNow(true);
    try {
      const res = await pushPendingChangesToCloud(u, r, access);
      setLastSyncError(null);
      await refreshAll();
      if (res.conflicts > 0 && r !== 'WORKER') {
        notify(
          `${res.conflicts} simultaneous offline edit(s) saved safely for Administrator review.`,
          'info'
        );
      }
    } catch (err) {
      setLastSyncError(formatSyncErrorForFarmer(err));
      await refreshAll();
    } finally {
      setIsSyncingNow(false);
    }
  }, [notify, refreshAll]);

  const scheduleOutboundSync = useCallback(() => {
    if (syncTimerRef.current !== null) {
      window.clearTimeout(syncTimerRef.current);
    }
    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = null;
      void executeBackgroundPush();
    }, 350);
  }, [executeBackgroundPush]);

  const refreshAndQueueSync = useCallback(async () => {
    await refreshAll();
    scheduleOutboundSync();
  }, [refreshAll, scheduleOutboundSync]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      scheduleOutboundSync();
    };
    const onOffline = () => {
      setIsOnline(false);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        scheduleOutboundSync();
      }
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisibility);

    const retryInterval = window.setInterval(() => {
      const r = roleRef.current;
      if (navigator.onLine && (r === 'ADMIN' || r === 'MEMBER' || r === 'WORKER')) {
        void executeBackgroundPush();
      }
    }, 45000);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(retryInterval);
    };
  }, [executeBackgroundPush, scheduleOutboundSync]);

  // Firebase Auth & Real-Time Firestore Listeners Lifecycle
  useEffect(() => {
    let stopListeners: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (stopListeners) {
        stopListeners();
        stopListeners = null;
      }

      if (!user) {
        setCurrentSyncActor(null);
        setFirebaseUser(null);
        setFarmAccess(null);
        setCloudBackups([]);
        setRole((prev) => (prev === 'UNAUTHORIZED' ? 'UNAUTHORIZED' : 'OFFLINE_LOCAL'));
        setAuthReady(true);
        void refreshAll();
        return;
      }

      const email = (user.email || '').trim().toLowerCase();
      setCurrentSyncActor({
        uid: user.uid,
        email,
        displayName: user.displayName || undefined,
      });

      try {
        const localData = await loadFullFarmSnapshot();
        const verified = await initializeOrVerifyFarmMembership(user, localData.settings);

        if (verified.role === 'UNAUTHORIZED' || !verified.farmAccess) {
          setCurrentSyncActor(null);
          setFirebaseUser(null);
          setFarmAccess(null);
          setRole('UNAUTHORIZED');
          setUnauthorizedReason(verified.unauthorizedReason);
          setAuthReady(true);
          if (verified.unauthorizedReason) {
            notify(verified.unauthorizedReason, 'error');
          }
          return;
        }

        setCurrentSyncActor({
          uid: user.uid,
          email,
          role: verified.role,
          displayName: user.displayName || undefined,
        });
        setUnauthorizedReason(null);
        setFirebaseUser(user);
        setRole(verified.role);
        setFarmAccess(verified.farmAccess);
        setLastSyncError(null);
        setAuthReady(true);
        await refreshAll();

        if (verified.role === 'ADMIN') {
          void listCloudBackupSnapshotsAsAdmin(user)
            .then(setCloudBackups)
            .catch(() => {});
        }

        stopListeners = startRealtimeFarmListeners({
          user,
          role: verified.role,
          onDataApplied: () => {
            void refreshAll();
          },
          onAccessUpdated: (nextAccess) => {
            setFarmAccess(nextAccess);
          },
          onAccessRevoked: (reason) => {
            void signOutCloudAccount();
            setCurrentSyncActor(null);
            setRole('UNAUTHORIZED');
            setUnauthorizedReason(reason);
            notify(reason, 'error');
          },
          onError: (err) => {
            setLastSyncError(formatSyncErrorForFarmer(err));
          },
        });

        setTimeout(() => {
          void executeBackgroundPush();
        }, 250);
      } catch (err) {
        setAuthReady(true);
        setFirebaseUser(user);
        setLastSyncError(formatSyncErrorForFarmer(err));
      }
    });

    return () => {
      if (stopListeners) stopListeners();
      unsubAuth();
    };
  }, [executeBackgroundPush, notify, refreshAll]);

  const signInToSharedFarm = async () => {
    try {
      setUnauthorizedReason(null);
      setLastSyncError(null);
      await signInWithGooglePopup();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('popup-closed-by-user')) {
        notify(`Google Sign-In failed: ${formatSyncErrorForFarmer(err)}`, 'error');
      }
    }
  };

  const signOutFromSharedFarm = async () => {
    await signOutCloudAccount();
    setCurrentSyncActor(null);
    setRole('OFFLINE_LOCAL');
    setUnauthorizedReason(null);
    setLastSyncError(null);
    notify('Signed out of Cloud Sync. Local offline database remains safe on this phone.', 'info');
  };

  const triggerCloudSync = async () => {
    if (
      !firebaseUser ||
      (role !== 'ADMIN' && role !== 'MEMBER' && role !== 'WORKER') ||
      !farmAccess
    ) {
      notify('Sign in with your authorized Google account first to sync across phones.', 'info');
      return;
    }
    if (!navigator.onLine) {
      notify('Phone is currently offline. Entries are safely queued and will sync automatically.', 'info');
      return;
    }
    await executeBackgroundPush();
    if (!lastSyncError) {
      notify('Shared farm data synchronized', 'success');
    }
  };

  const updateTeamAccess = async (input: {
    memberEmail: string;
    workerEmail: string;
    workerActive: boolean;
  }) => {
    if (!firebaseUser || role !== 'ADMIN' || !farmAccess) {
      throw new Error('Sign in as the Farm Administrator first to manage team access.');
    }
    setIsSyncingNow(true);
    try {
      const updated = await updateTeamAccessAsAdmin(firebaseUser, farmAccess, input);
      setFarmAccess(updated);
      setLastSyncError(null);
    } catch (err) {
      const friendly = formatSyncErrorForFarmer(err);
      setLastSyncError(friendly);
      throw new Error(friendly);
    } finally {
      setIsSyncingNow(false);
    }
  };

  const saveUncleMemberEmail = async (uncleEmail: string) => {
    if (!farmAccess) {
      throw new Error('Sign in as the Farm Administrator first to manage member access.');
    }
    await updateTeamAccess({
      memberEmail: uncleEmail,
      workerEmail: farmAccess.workerEmail,
      workerActive: farmAccess.workerActive,
    });
  };

  const resolveSyncConflict = async (
    conflict: SyncConflictItem,
    resolution: 'KEEP_SERVER' | 'APPLY_PROPOSED' | 'KEEP_BOTH'
  ) => {
    if (!firebaseUser || role !== 'ADMIN' || !farmAccess) {
      throw new Error('Only the Farm Administrator can resolve sync conflicts.');
    }
    setIsSyncingNow(true);
    try {
      await resolveConflictAsAdmin({
        user: firebaseUser,
        farmAccess,
        conflict,
        resolution,
      });
      await refreshAll();
    } catch (err) {
      const friendly = formatSyncErrorForFarmer(err);
      setLastSyncError(friendly);
      throw new Error(friendly);
    } finally {
      setIsSyncingNow(false);
    }
  };

  const applyAuditedCorrection = async (params: {
    storeName: 'milk_records' | 'breeding_records' | 'calving_records';
    recordId: string;
    updates: Record<string, unknown>;
    summary: string;
    reason: string;
  }) => {
    assertNotWorker('correct audited farm records');
    const cleanReason = params.reason.trim();
    if (!cleanReason) {
      throw new Error('Please enter a brief correction reason for the audit log.');
    }

    const localDb = await getDB();
    const existing = (await localDb.get(params.storeName, params.recordId)) as
      | (SyncMetadata & Record<string, unknown>)
      | undefined;
    if (!existing || existing.isDeleted) {
      throw new Error('Target record was not found.');
    }

    const auditEntry: CorrectionAuditEntry = {
      timestamp: Date.now(),
      byUid: firebaseUser?.uid || 'local_owner',
      byEmail: firebaseUser?.email?.toLowerCase() || 'local_owner',
      byRole: role,
      summary: params.summary.trim().slice(0, 240),
      reason: cleanReason.slice(0, 240),
    };

    const nextHistory = [...(existing.correctionHistory || []), auditEntry].slice(-12);
    const meta = createMeta(existing);

    await localDb.put(
      params.storeName,
      {
        ...existing,
        ...params.updates,
        ...meta,
        reviewStatus: 'CORRECTED',
        correctionHistory: nextHistory,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any
    );

    await refreshAndQueueSync();
  };

  const markWorkerEntryVerified = async (
    storeName: 'milk_records' | 'breeding_records' | 'calving_records',
    recordId: string
  ) => {
    assertNotWorker('verify worker entries');
    const localDb = await getDB();
    const existing = (await localDb.get(storeName, recordId)) as
      | (SyncMetadata & Record<string, unknown>)
      | undefined;
    if (!existing || existing.isDeleted) return;

    const meta = createMeta(existing);
    await localDb.put(
      storeName,
      {
        ...existing,
        ...meta,
        reviewStatus: 'VERIFIED',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any
    );
    await refreshAndQueueSync();
  };

  const navigate = useCallback((next: ActiveRoute) => {
    if (roleRef.current === 'WORKER') {
      // Workers are strictly confined to the Worker Workspace
      return;
    }
    setRoute(next);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  const unlockApp = useCallback(() => setIsLocked(false), []);
  const lockAppNow = useCallback(() => {
    if (snapshot.preferences.pinEnabled && snapshot.preferences.pinHash) {
      setIsLocked(true);
    }
  }, [snapshot.preferences.pinEnabled, snapshot.preferences.pinHash]);

  const canAdministerFarm = role === 'ADMIN' || role === 'OFFLINE_LOCAL';
  const canManageFinances = role === 'ADMIN' || role === 'MEMBER' || role === 'OFFLINE_LOCAL';
  const canReviewWorkerEntries = role === 'ADMIN' || role === 'MEMBER' || role === 'OFFLINE_LOCAL';
  const isWorker = role === 'WORKER';

  const saveSettings = async (next: Partial<FarmSettings>) => {
    assertAdminOnly('modify shared Farm Settings');
    const localDb = await getDB();
    const current = (await localDb.get('farm_settings', 1)) || DEFAULT_FARM_SETTINGS;
    const updated: FarmSettings = {
      ...current,
      ...next,
      id: 1,
      farmId: SHARED_FARM_ID,
      setupCompleted: true,
      version: (current.version || 0) + 1,
      updatedBy: firebaseUser?.uid || current.updatedBy,
      updatedByEmail: firebaseUser?.email?.toLowerCase() || current.updatedByEmail,
      syncStatus: SyncStatus.PENDING_SYNC,
      updatedAt: Date.now(),
    };
    await localDb.put('farm_settings', updated);
    await refreshAndQueueSync();
  };

  const savePreferences = async (next: Partial<AppPreferences>) => {
    const localDb = await getDB();
    const current = (await localDb.get('app_preferences', 1)) || DEFAULT_APP_PREFERENCES;
    const updated: AppPreferences = {
      ...current,
      ...next,
      id: 1,
      updatedAt: Date.now(),
    };
    await localDb.put('app_preferences', updated);
    await refreshAll();
  };

  const upsertAnimal = async (
    input: Omit<Animal, keyof SyncMetadata> & { id?: string }
  ): Promise<Animal> => {
    assertNotWorker('add or edit herd animal profiles directly');
    const localDb = await getDB();
    const existing = input.id ? await localDb.get('animals', input.id) : undefined;
    const meta = createMeta(existing);
    const record: Animal = {
      ...input,
      ...meta,
    };
    await localDb.put('animals', record);
    await refreshAndQueueSync();
    return record;
  };

  const archiveAnimal = async (animalId: string) => {
    assertNotWorker('delete or archive animals');
    const localDb = await getDB();
    const existing = await localDb.get('animals', animalId);
    if (!existing) return;
    await localDb.put('animals', {
      ...existing,
      ...markSoftDeletedMeta(existing),
    });
    await refreshAndQueueSync();
  };

  // Combined Farm-Wide Milk Session Entry (Morning / Evening / Afternoon) with Duplicate Prevention
  const submitCombinedMilkSession = async (input: {
    date: string;
    session: MilkSession.MORNING | MilkSession.EVENING | MilkSession.AFTERNOON;
    quantityLitres: number;
    entryTime?: string;
    workerName?: string;
    fatPercentage?: number;
    snfPercentage?: number;
    notes?: string;
  }) => {
    const validationErr = validateMilkEntry({
      animalId: FARM_COMBINED_ANIMAL_ID,
      date: input.date,
      quantityLitres: input.quantityLitres,
      fatPercentage: input.fatPercentage,
      snfPercentage: input.snfPercentage,
      isCombined: true,
    });
    if (validationErr) {
      throw new Error(validationErr);
    }

    const localDb = await getDB();
    const deterministicId = makeCombinedMilkId(input.date, input.session);
    const existingDeterministic = await localDb.get('milk_records', deterministicId);

    // Check if an active combined entry already exists for this exact (date, session)
    const sameDateRecs = await localDb.getAllFromIndex('milk_records', 'by-date', input.date);
    const activeDuplicate = sameDateRecs.find(
      (r) => !r.isDeleted && r.session === input.session && isCombinedMilkRecord(r)
    );

    if (activeDuplicate) {
      throw new Error(
        `${input.session} milk collection for ${input.date} is already recorded (${activeDuplicate.quantityLitres} L). ${
          role === 'WORKER'
            ? 'Ask the Administrator or Uncle if a correction is needed.'
            : 'Use the Correct button on the existing entry to record an audited adjustment.'
        }`
      );
    }

    const rate =
      role === 'WORKER' ? undefined : snapshot.settings.defaultMilkRatePerLitre || undefined;
    const totalValue = role === 'WORKER' ? undefined : calculateMilkValue(input.quantityLitres, rate);

    const meta = createMeta(existingDeterministic, undefined, deterministicId);
    const record: MilkRecord = {
      ...meta,
      isDeleted: false,
      reviewStatus: role === 'WORKER' ? 'PENDING_REVIEW' : 'VERIFIED',
      animalId: FARM_COMBINED_ANIMAL_ID,
      entryType: 'COMBINED',
      date: input.date,
      session: input.session,
      entryTime: input.entryTime || getCurrentTimeHm(),
      workerName:
        input.workerName?.trim() ||
        firebaseUser?.displayName ||
        firebaseUser?.email?.split('@')[0] ||
        (role === 'ADMIN' ? 'Administrator' : role === 'MEMBER' ? 'Uncle' : 'Farm Worker'),
      quantityLitres: Math.round(input.quantityLitres * 100) / 100,
      fatPercentage: input.fatPercentage,
      snfPercentage: input.snfPercentage,
      pricePerLitre: rate,
      totalValue,
      notes: input.notes?.trim() || undefined,
    };

    await localDb.put('milk_records', record);
    await refreshAndQueueSync();
  };

  const upsertMilkRecord = async (
    input: Omit<MilkRecord, keyof SyncMetadata> & { id?: string }
  ) => {
    if (role === 'WORKER' && input.id) {
      throw new Error('Farm Workers cannot overwrite submitted milk records. Ask Admin or Uncle for audited correction.');
    }
    const localDb = await getDB();
    const existing = input.id ? await localDb.get('milk_records', input.id) : undefined;
    const meta = createMeta(existing);
    await localDb.put('milk_records', { ...input, ...meta });
    await refreshAndQueueSync();
  };

  const saveBatchMilkRecords = async (
    entries: Array<Omit<MilkRecord, keyof SyncMetadata>>
  ): Promise<number> => {
    assertNotWorker('submit cow-wise batch pricing sheets');
    const localDb = await getDB();
    const tx = localDb.transaction(['milk_records'], 'readwrite');
    const store = tx.objectStore('milk_records');
    let saved = 0;
    for (const entry of entries) {
      if (entry.quantityLitres > 0) {
        const meta = createMeta();
        await store.put({ ...entry, entryType: 'INDIVIDUAL', ...meta });
        saved += 1;
      }
    }
    await tx.done;
    await refreshAndQueueSync();
    return saved;
  };

  const deleteMilkRecord = async (id: string) => {
    assertNotWorker('delete milk collection records');
    const localDb = await getDB();
    const existing = await localDb.get('milk_records', id);
    if (!existing) return;
    await localDb.put('milk_records', {
      ...existing,
      ...markSoftDeletedMeta(existing),
    });
    await refreshAndQueueSync();
  };

  const upsertCustomer = async (
    input: Omit<Customer, keyof SyncMetadata> & { id?: string }
  ) => {
    assertNotWorker('manage milk customers');
    const localDb = await getDB();
    const existing = input.id ? await localDb.get('customers', input.id) : undefined;
    const meta = createMeta(existing);
    await localDb.put('customers', { ...input, ...meta });
    await refreshAndQueueSync();
  };

  const recordMilkSale = async (
    sale: Omit<MilkSale, keyof SyncMetadata>,
    logIncome: boolean
  ) => {
    assertNotWorker('record milk sales or customer payments');
    const localDb = await getDB();
    const tx = localDb.transaction(['milk_sales', 'income_records'], 'readwrite');
    const sMeta = createMeta();
    await tx.objectStore('milk_sales').put({ ...sale, ...sMeta });
    if (logIncome && sale.totalAmount > 0 && sale.paymentStatus === 'PAID') {
      const iMeta = createMeta();
      await tx.objectStore('income_records').put({
        ...iMeta,
        date: sale.date,
        category: 'MILK_SALES',
        amount: sale.totalAmount,
        milkSaleId: sMeta.id,
        description: `Milk sale to ${sale.customerName} (${sale.quantityLitres} L)`,
      });
    }
    await tx.done;
    await refreshAndQueueSync();
  };

  const updateMilkSalePaymentStatus = async (
    saleId: string,
    nextStatus: 'PAID' | 'PENDING' | 'PARTIAL',
    postIncomeWhenPaid: boolean
  ) => {
    assertNotWorker('update customer payment statuses');
    const localDb = await getDB();
    const tx = localDb.transaction(['milk_sales', 'income_records'], 'readwrite');
    const saleStore = tx.objectStore('milk_sales');
    const existing = await saleStore.get(saleId);
    if (!existing || existing.isDeleted) {
      throw new Error('Milk sale record not found.');
    }

    const updatedSale: MilkSale = {
      ...existing,
      ...createMeta(existing),
      paymentStatus: nextStatus,
    };
    await saleStore.put(updatedSale);

    if (postIncomeWhenPaid && nextStatus === 'PAID' && existing.paymentStatus !== 'PAID') {
      const incStore = tx.objectStore('income_records');
      const allIncomes = await incStore.getAll();
      const alreadyLinked = allIncomes.find((i) => !i.isDeleted && i.milkSaleId === saleId);
      if (!alreadyLinked && existing.totalAmount > 0) {
        const iMeta = createMeta();
        await incStore.put({
          ...iMeta,
          date: getTodayIso(),
          category: 'MILK_SALES',
          amount: existing.totalAmount,
          milkSaleId: saleId,
          description: `Payment received: ${existing.customerName} (${existing.quantityLitres} L sale on ${existing.date})`,
        });
      }
    }

    await tx.done;
    await refreshAndQueueSync();
  };

  const upsertFeedType = async (
    input: Omit<FeedType, keyof SyncMetadata> & { id?: string }
  ) => {
    assertNotWorker('manage feed inventory');
    const localDb = await getDB();
    const existing = input.id ? await localDb.get('feed_types', input.id) : undefined;
    const meta = createMeta(existing);
    await localDb.put('feed_types', { ...input, ...meta });
    await refreshAndQueueSync();
  };

  const addFeedStock = async (params: Parameters<typeof recordFeedStockTransaction>[0]) => {
    assertNotWorker('add feed stock or purchases');
    await recordFeedStockTransaction(params);
    await refreshAndQueueSync();
  };

  const logFeedConsumption = async (
    params: Parameters<typeof recordFeedConsumptionTransaction>[0]
  ) => {
    assertNotWorker('record feed rations');
    await recordFeedConsumptionTransaction(params);
    await refreshAndQueueSync();
  };

  const logHealthEvent = async (params: Parameters<typeof recordHealthTransaction>[0]) => {
    assertNotWorker('record veterinary or medicine costs');
    await recordHealthTransaction(params);
    await refreshAndQueueSync();
  };

  const updateHealthStatus = async (
    id: string,
    status: 'SICK' | 'RECOVERING' | 'RESOLVED'
  ) => {
    assertNotWorker('update health records');
    const localDb = await getDB();
    const existing = await localDb.get('health_records', id);
    if (!existing) return;
    await localDb.put('health_records', {
      ...existing,
      ...createMeta(existing),
      status,
    });
    await refreshAndQueueSync();
  };

  const upsertMedicine = async (
    input: Omit<Medicine, keyof SyncMetadata> & { id?: string }
  ) => {
    assertNotWorker('manage medicine inventory');
    const localDb = await getDB();
    const existing = input.id ? await localDb.get('medicines', input.id) : undefined;
    const meta = createMeta(existing);
    await localDb.put('medicines', { ...input, ...meta });
    await refreshAndQueueSync();
  };

  const logVeterinaryVisit = async (
    visit: Omit<VeterinaryVisit, keyof SyncMetadata>,
    logExpense: boolean
  ) => {
    assertNotWorker('record veterinary visits');
    const localDb = await getDB();
    const tx = localDb.transaction(['veterinary_visits', 'expense_records'], 'readwrite');
    const vMeta = createMeta();
    await tx.objectStore('veterinary_visits').put({ ...visit, ...vMeta });
    if (logExpense && visit.cost > 0) {
      const eMeta = createMeta();
      await tx.objectStore('expense_records').put({
        ...eMeta,
        date: visit.visitDate,
        category: 'VETERINARY',
        amount: visit.cost,
        animalId: visit.animalId,
        description: `Vet visit (${visit.veterinarianName}): ${visit.reason}`,
      });
    }
    await tx.done;
    await refreshAndQueueSync();
  };

  const logVaccination = async (
    vac: Omit<VaccinationRecord, keyof SyncMetadata>,
    logExpense: boolean
  ) => {
    assertNotWorker('record vaccinations');
    const localDb = await getDB();
    const tx = localDb.transaction(['vaccination_records', 'expense_records'], 'readwrite');
    const vMeta = createMeta();
    await tx.objectStore('vaccination_records').put({ ...vac, ...vMeta });
    if (logExpense && vac.cost > 0) {
      const eMeta = createMeta();
      await tx.objectStore('expense_records').put({
        ...eMeta,
        date: vac.administeredDate,
        category: 'VETERINARY',
        amount: vac.cost,
        animalId: vac.animalId,
        description: `Vaccination: ${vac.vaccineName}`,
      });
    }
    await tx.done;
    await refreshAndQueueSync();
  };

  const logBreedingAttempt = async (
    record: Omit<BreedingRecord, keyof SyncMetadata>,
    logExpense: boolean
  ) => {
    const localDb = await getDB();
    const bMeta = createMeta();
    const enriched: BreedingRecord = {
      ...record,
      ...bMeta,
      breedingTime: record.breedingTime || getCurrentTimeHm(),
      expectedPregnancyCheckDate:
        record.expectedPregnancyCheckDate ||
        calculateExpectedPregnancyFollowUpDate(record.breedingDate),
      cost: role === 'WORKER' ? 0 : record.cost,
    };

    if (role !== 'WORKER' && logExpense && record.cost > 0) {
      const tx = localDb.transaction(['breeding_records', 'expense_records'], 'readwrite');
      await tx.objectStore('breeding_records').put(enriched);
      const eMeta = createMeta();
      await tx.objectStore('expense_records').put({
        ...eMeta,
        date: record.breedingDate,
        category: 'BREEDING',
        amount: record.cost,
        animalId: record.animalId,
        description: `${record.method} breeding (${record.semenOrBullId})`,
      });
      await tx.done;
    } else {
      await localDb.put('breeding_records', enriched);
    }

    await refreshAndQueueSync();
  };

  const logPregnancyCheck = async (
    record: Omit<PregnancyRecord, keyof SyncMetadata>,
    updateAnimalStatus: boolean
  ) => {
    assertNotWorker('confirm veterinary pregnancy checks');
    const localDb = await getDB();
    const tx = localDb.transaction(['pregnancy_records', 'animals'], 'readwrite');
    const pMeta = createMeta();
    await tx.objectStore('pregnancy_records').put({ ...record, ...pMeta });
    if (updateAnimalStatus && record.status === 'CONFIRMED') {
      const animalStore = tx.objectStore('animals');
      const animal = await animalStore.get(record.animalId);
      if (animal && !animal.isDeleted) {
        await animalStore.put({
          ...animal,
          ...createMeta(animal),
          status: AnimalStatus.PREGNANT,
        });
      }
    }
    await tx.done;
    await refreshAndQueueSync();
  };

  const logCalvingWithCalves = async (
    params: Parameters<typeof recordCalvingTransaction>[0]
  ) => {
    await recordCalvingTransaction(params);
    await refreshAndQueueSync();
  };

  const logWeightRecord = async (record: Omit<WeightRecord, keyof SyncMetadata>) => {
    const localDb = await getDB();
    const meta = createMeta();
    await localDb.put('weight_records', { ...record, ...meta });
    await refreshAndQueueSync();
  };

  const upsertLactationCycle = async (
    input: Omit<LactationRecord, keyof SyncMetadata> & { id?: string }
  ) => {
    assertNotWorker('manage lactation cycles directly');
    const localDb = await getDB();
    const existing = input.id ? await localDb.get('lactation_records', input.id) : undefined;
    const meta = createMeta(existing);
    await localDb.put('lactation_records', { ...input, ...meta });
    if (input.status === 'DRY_PERIOD') {
      const animal = await localDb.get('animals', input.animalId);
      if (animal && !animal.isDeleted) {
        await localDb.put('animals', {
          ...animal,
          ...createMeta(animal),
          status: AnimalStatus.DRY,
        });
      }
    }
    await refreshAndQueueSync();
  };

  const addIncome = async (record: Omit<IncomeRecord, keyof SyncMetadata>) => {
    assertNotWorker('access or add farm income');
    const localDb = await getDB();
    const meta = createMeta();
    await localDb.put('income_records', { ...record, ...meta });
    await refreshAndQueueSync();
  };

  const upsertIncome = async (
    input: Omit<IncomeRecord, keyof SyncMetadata> & { id?: string }
  ) => {
    assertNotWorker('manage farm income');
    const localDb = await getDB();
    const existing = input.id ? await localDb.get('income_records', input.id) : undefined;
    const meta = createMeta(existing);
    await localDb.put('income_records', { ...input, ...meta });
    await refreshAndQueueSync();
  };

  const addExpense = async (record: Omit<ExpenseRecord, keyof SyncMetadata>) => {
    assertNotWorker('access or add farm expenses');
    const localDb = await getDB();
    const meta = createMeta();
    await localDb.put('expense_records', { ...record, ...meta });
    await refreshAndQueueSync();
  };

  const upsertExpense = async (
    input: Omit<ExpenseRecord, keyof SyncMetadata> & { id?: string }
  ) => {
    assertNotWorker('manage farm expenses');
    const localDb = await getDB();
    const existing = input.id ? await localDb.get('expense_records', input.id) : undefined;
    const meta = createMeta(existing);
    await localDb.put('expense_records', { ...input, ...meta });
    await refreshAndQueueSync();
  };

  const deleteFinanceEntry = async (kind: 'income' | 'expense', id: string) => {
    assertNotWorker('delete financial records');
    const localDb = await getDB();
    const storeName: OperationalStoreName =
      kind === 'income' ? 'income_records' : 'expense_records';
    const existing = await localDb.get(storeName, id);
    if (!existing) return;
    await localDb.put(storeName, {
      ...existing,
      ...markSoftDeletedMeta(existing),
    });
    await refreshAndQueueSync();
  };

  const upsertEmployee = async (
    input: Omit<Employee, keyof SyncMetadata> & { id?: string }
  ) => {
    assertNotWorker('manage farm employees');
    const localDb = await getDB();
    const existing = input.id ? await localDb.get('employees', input.id) : undefined;
    const meta = createMeta(existing);
    await localDb.put('employees', { ...input, ...meta });
    await refreshAndQueueSync();
  };

  const upsertTask = async (
    input: Omit<FarmTask, keyof SyncMetadata> & { id?: string }
  ) => {
    assertNotWorker('manage farm tasks');
    const localDb = await getDB();
    const existing = input.id ? await localDb.get('farm_tasks', input.id) : undefined;
    const meta = createMeta(existing);
    await localDb.put('farm_tasks', { ...input, ...meta });
    await refreshAndQueueSync();
  };

  const toggleTaskComplete = async (taskId: string) => {
    assertNotWorker('update farm tasks');
    const localDb = await getDB();
    const existing = await localDb.get('farm_tasks', taskId);
    if (!existing) return;
    await localDb.put('farm_tasks', {
      ...existing,
      ...createMeta(existing),
      status: existing.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED',
    });
    await refreshAndQueueSync();
  };

  const deleteTask = async (taskId: string) => {
    assertNotWorker('delete farm tasks');
    const localDb = await getDB();
    const existing = await localDb.get('farm_tasks', taskId);
    if (!existing) return;
    await localDb.put('farm_tasks', {
      ...existing,
      ...markSoftDeletedMeta(existing),
    });
    await refreshAndQueueSync();
  };

  const addCustomReminder = async (
    rem: Omit<Reminder, keyof SyncMetadata | 'dedupeKey' | 'dismissed'>
  ) => {
    assertNotWorker('manage reminders');
    const localDb = await getDB();
    const meta = createMeta();
    await localDb.put('reminders', {
      ...meta,
      ...rem,
      dedupeKey: `CUSTOM_${meta.id}`,
      dismissed: false,
    });
    await refreshAndQueueSync();
  };

  const dismissReminder = async (id: string) => {
    assertNotWorker('dismiss reminders');
    const localDb = await getDB();
    const existing = await localDb.get('reminders', id);
    if (!existing) return;
    await localDb.put('reminders', {
      ...existing,
      ...createMeta(existing),
      dismissed: true,
    });
    await refreshAndQueueSync();
  };

  const refreshCloudBackups = async () => {
    if (!firebaseUser || role !== 'ADMIN') return;
    const list = await listCloudBackupSnapshotsAsAdmin(firebaseUser);
    setCloudBackups(list);
  };

  const createCloudBackup = async (label: string): Promise<CloudBackupMeta> => {
    if (!firebaseUser || role !== 'ADMIN') {
      throw new Error('Sign in as the Farm Administrator to create a Cloud Backup snapshot.');
    }
    setIsSyncingNow(true);
    try {
      const created = await createCloudBackupSnapshotAsAdmin(firebaseUser, label);
      await refreshCloudBackups();
      return created;
    } catch (err) {
      const friendly = formatSyncErrorForFarmer(err);
      setLastSyncError(friendly);
      throw new Error(friendly);
    } finally {
      setIsSyncingNow(false);
    }
  };

  const restoreFromCloudBackup = async (
    backupId: string
  ): Promise<{ restoredRecords: number }> => {
    if (!firebaseUser || role !== 'ADMIN' || !farmAccess) {
      throw new Error('Only the Farm Administrator can restore a Cloud Backup snapshot.');
    }
    setIsSyncingNow(true);
    try {
      const res = await restoreCloudBackupSnapshotAsAdmin(firebaseUser, farmAccess, backupId);
      setLastSyncError(null);
      await refreshAll();
      return res;
    } catch (err) {
      const friendly = formatSyncErrorForFarmer(err);
      setLastSyncError(friendly);
      throw new Error(friendly);
    } finally {
      setIsSyncingNow(false);
    }
  };

  const rollbackSafetyBackup = async (safetyId: string): Promise<{ restoredRecords: number }> => {
    assertAdminOnly('restore a pre-restore safety backup');
    const res = await restoreFromSafetyBackup(safetyId);
    await refreshAll();
    if (firebaseUser && role === 'ADMIN' && farmAccess && navigator.onLine) {
      setIsSyncingNow(true);
      try {
        await adminForcePushAllRestoredRecords(firebaseUser, farmAccess);
        setLastSyncError(null);
        await refreshAll();
      } catch (err) {
        setLastSyncError(formatSyncErrorForFarmer(err));
      } finally {
        setIsSyncingNow(false);
      }
    }
    return res;
  };

  const exportBackup = async () => {
    assertNotWorker('export farm backups');
    const json = await createLocalBackupJson();
    await refreshAll();
    return json;
  };

  const importBackup = async (rawJson: string) => {
    assertAdminOnly('restore farm backups');
    const res = await restoreFromLocalBackupJson(rawJson);
    await refreshAll();
    if (firebaseUser && role === 'ADMIN' && farmAccess && navigator.onLine) {
      setIsSyncingNow(true);
      try {
        await adminForcePushAllRestoredRecords(firebaseUser, farmAccess);
        setLastSyncError(null);
        await refreshAll();
      } catch (err) {
        setLastSyncError(formatSyncErrorForFarmer(err));
      } finally {
        setIsSyncingNow(false);
      }
    }
    return res;
  };

  // Compute unified visible sync status across all 3 roles
  let computedSyncStatus: CloudSyncState['status'] = 'LOCAL_ONLY';
  if (role === 'ADMIN' || role === 'MEMBER' || role === 'WORKER') {
    if (!isOnline) {
      computedSyncStatus = snapshot.pendingSyncCount > 0 ? 'PENDING' : 'OFFLINE';
    } else if (lastSyncError) {
      computedSyncStatus = 'ERROR';
    } else if (role !== 'WORKER' && snapshot.syncConflicts.length > 0) {
      computedSyncStatus = 'CONFLICT';
    } else if (isSyncingNow) {
      computedSyncStatus = 'SYNCING';
    } else if (snapshot.pendingSyncCount > 0) {
      computedSyncStatus = 'PENDING';
    } else {
      computedSyncStatus = 'SYNCED';
    }
  }

  const syncState: CloudSyncState = {
    authReady,
    currentUser: firebaseUser
      ? {
           uid: firebaseUser.uid,
           email: (firebaseUser.email || '').toLowerCase(),
           displayName: firebaseUser.displayName,
           emailVerified: firebaseUser.emailVerified,
         }
      : null,
    role,
    unauthorizedReason,
    farmAccess,
    status: computedSyncStatus,
    pendingCount: snapshot.pendingSyncCount,
    openConflictCount: snapshot.syncConflicts.length,
    lastSyncedAt: snapshot.preferences.lastCloudSyncedAt || null,
    lastSyncError,
  };

  return (
    <FarmContext.Provider
      value={{
        ...snapshot,
        isLoading,
        isLocked,
        unlockApp,
        lockAppNow,
        route,
        navigate,
        toast,
        notify,
        dismissToast,
        refreshAll,
        syncState,
        cloudSync: syncState,
        canAdministerFarm,
        canManageFinances,
        canReviewWorkerEntries,
        isWorker,
        signInToSharedFarm,
        signOutFromSharedFarm,
        triggerCloudSync,
        saveUncleMemberEmail,
        updateTeamAccess,
        resolveSyncConflict,
        applyAuditedCorrection,
        markWorkerEntryVerified,
        saveSettings,
        savePreferences,
        upsertAnimal,
        archiveAnimal,
        submitCombinedMilkSession,
        upsertMilkRecord,
        saveBatchMilkRecords,
        deleteMilkRecord,
        upsertCustomer,
        recordMilkSale,
        updateMilkSalePaymentStatus,
        upsertFeedType,
        addFeedStock,
        logFeedConsumption,
        logHealthEvent,
        updateHealthStatus,
        upsertMedicine,
        logVeterinaryVisit,
        logVaccination,
        logBreedingAttempt,
        logPregnancyCheck,
        logCalvingWithCalves,
        logWeightRecord,
        upsertLactationCycle,
        addIncome,
        upsertIncome,
        addExpense,
        upsertExpense,
        deleteFinanceEntry,
        upsertEmployee,
        upsertTask,
        toggleTaskComplete,
        deleteTask,
        addCustomReminder,
        dismissReminder,
        cloudBackups,
        refreshCloudBackups,
        createCloudBackup,
        restoreFromCloudBackup,
        rollbackSafetyBackup,
        exportBackup,
        importBackup,
      }}
    >
      {children}
    </FarmContext.Provider>
  );
};

export function useFarm() {
  const ctx = useContext(FarmContext);
  if (!ctx) throw new Error('useFarm must be used within FarmProvider');
  return ctx;
}
