import { signInWithPopup, signOut, User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  DairyTrackBackupEnvelope,
  getDB,
  OPERATIONAL_STORE_NAMES,
  restoreFromLocalBackupJson,
  SHARED_FARM_ID,
  WORKER_ALLOWED_STORE_NAMES,
} from '../data/db';
import {
  CloudBackupMeta,
  FarmAccessProfile,
  FarmSettings,
  OperationalStoreName,
  Reminder,
  SyncConflictItem,
  SyncMetadata,
  SyncStatus,
  UserRole,
} from '../types/models';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './firebase';
import { sha256Hex } from './security';

export const BOOTSTRAPPED_ADMIN_EMAIL = 'inamdarrizwan755@gmail.com';

export const WORKER_ALLOWED_STORES = new Set<OperationalStoreName>(WORKER_ALLOWED_STORE_NAMES);

const WORKER_STRIPPED_FINANCIAL_KEYS = new Set([
  'pricePerLitre',
  'totalValue',
  'purchasePrice',
  'sellerInfo',
  'cost',
]);

const MAX_PHOTO_CHARS_FOR_CLOUD = 240000;

export function makeCloudDocId(storeName: OperationalStoreName, recordId: string): string {
  const safeId = recordId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 88);
  return `${storeName}__${safeId}`;
}

export function buildRoleEmailArrays(
  memberEmail: string,
  workerEmail: string,
  workerActive: boolean
): { managerEmails: string[]; authorizedEmails: string[] } {
  const cleanMember = memberEmail.trim().toLowerCase();
  const cleanWorker = workerEmail.trim().toLowerCase();
  const managerEmails = cleanMember
    ? [BOOTSTRAPPED_ADMIN_EMAIL, cleanMember]
    : [BOOTSTRAPPED_ADMIN_EMAIL];
  const authorizedEmails =
    cleanWorker && workerActive ? [...managerEmails, cleanWorker] : [...managerEmails];
  return { managerEmails, authorizedEmails };
}

export function getExpectedRecordEmails(
  farmAccess: FarmAccessProfile,
  storeName: OperationalStoreName
): string[] {
  return WORKER_ALLOWED_STORES.has(storeName)
    ? farmAccess.authorizedEmails
    : farmAccess.managerEmails;
}

const META_KEYS_TO_STRIP = new Set(['syncStatus', 'baseVersion']);

function sanitizePlainAuditObject(item: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(item)) {
    if (typeof v === 'string') out[k] = v.slice(0, 500);
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
  }
  return out;
}

export function sanitizeEntityForFirestore(
  entity: Record<string, unknown>,
  options?: { stripWorkerFinancials?: boolean; stripPhotos?: boolean }
): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  const entries = Object.entries(entity);
  for (const [key, val] of entries) {
    if (val === undefined || META_KEYS_TO_STRIP.has(key)) continue;
    if (options?.stripWorkerFinancials && WORKER_STRIPPED_FINANCIAL_KEYS.has(key)) {
      if (key === 'cost') {
        clean[key] = 0;
      }
      continue;
    }
    if (typeof val === 'string') {
      if (key === 'photoDataUrl') {
        if (options?.stripPhotos || val.length > MAX_PHOTO_CHARS_FOR_CLOUD) {
          continue;
        }
      }
      clean[key] = val.slice(0, key === 'photoDataUrl' ? MAX_PHOTO_CHARS_FOR_CLOUD : 4000);
    } else if (typeof val === 'number' && !Number.isNaN(val) && Number.isFinite(val)) {
      clean[key] = val;
    } else if (typeof val === 'boolean') {
      clean[key] = val;
    } else if (Array.isArray(val)) {
      clean[key] = val
        .slice(0, 15)
        .filter((item) => item !== undefined && item !== null)
        .map((item) => {
          if (typeof item === 'string') return item.slice(0, 200);
          if (typeof item === 'number' || typeof item === 'boolean') return item;
          if (typeof item === 'object' && !Array.isArray(item)) {
            return sanitizePlainAuditObject(item as Record<string, unknown>);
          }
          return String(item).slice(0, 200);
        });
    }
  }
  return clean;
}

function stableDataSignature(data: Record<string, unknown>): string {
  const ignored = new Set([
    'updatedAt',
    'updatedBy',
    'updatedByEmail',
    'updatedByRole',
    'version',
    'baseVersion',
    'syncStatus',
    'farmId',
  ]);
  const sortedKeys = Object.keys(data)
    .filter((k) => !ignored.has(k) && data[k] !== undefined)
    .sort();
  const obj: Record<string, unknown> = {};
  for (const k of sortedKeys) {
    obj[k] = data[k];
  }
  return JSON.stringify(obj);
}

function timestampToMs(ts: unknown): number {
  if (ts instanceof Timestamp) return ts.toMillis();
  if (typeof ts === 'number') return ts;
  return Date.now();
}

function parseFarmAccessDoc(data: Record<string, unknown>): FarmAccessProfile {
  const memberEmail = String(data.memberEmail || '').trim().toLowerCase();
  const workerEmail = String(data.workerEmail || '').trim().toLowerCase();
  const workerActive = Boolean(data.workerActive);
  const computed = buildRoleEmailArrays(memberEmail, workerEmail, workerActive);

  return {
    farmId: String(data.farmId || SHARED_FARM_ID),
    farmName: String(data.farmName || 'My Smart Dairy Farm'),
    adminUid: String(data.adminUid || ''),
    adminEmail: String(data.adminEmail || BOOTSTRAPPED_ADMIN_EMAIL),
    memberEmail,
    memberUid: String(data.memberUid || ''),
    workerEmail,
    workerUid: String(data.workerUid || ''),
    workerActive,
    managerEmails: Array.isArray(data.managerEmails)
      ? data.managerEmails.map(String)
      : computed.managerEmails,
    authorizedEmails: Array.isArray(data.authorizedEmails)
      ? data.authorizedEmails.map(String)
      : computed.authorizedEmails,
  };
}

export async function signInWithGooglePopup(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutCloudAccount(): Promise<void> {
  await signOut(auth);
}

export async function initializeOrVerifyFarmMembership(
  user: User,
  localSettings: FarmSettings
): Promise<{
  role: UserRole;
  farmAccess: FarmAccessProfile | null;
  unauthorizedReason: string | null;
}> {
  const email = (user.email || '').trim().toLowerCase();
  if (!email || !user.emailVerified) {
    await signOut(auth);
    return {
      role: 'UNAUTHORIZED',
      farmAccess: null,
      unauthorizedReason: 'A verified Google email address is required to access DairyTrack Cloud.',
    };
  }

  const farmPath = `farms/${SHARED_FARM_ID}`;
  const farmRef = doc(db, 'farms', SHARED_FARM_ID);

  let snap;
  try {
    snap = await getDoc(farmRef);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Missing or insufficient permissions') && email !== BOOTSTRAPPED_ADMIN_EMAIL) {
      await signOut(auth);
      return {
        role: 'UNAUTHORIZED',
        farmAccess: null,
        unauthorizedReason: `Access restricted: "${email}" is not an active authorized account for this farm (or Worker access is currently suspended). Ask the Farm Administrator to authorize or activate your Google email.`,
      };
    }
    handleFirestoreError(err, OperationType.GET, farmPath);
  }

  if (!snap.exists()) {
    if (email !== BOOTSTRAPPED_ADMIN_EMAIL) {
      await signOut(auth);
      return {
        role: 'UNAUTHORIZED',
        farmAccess: null,
        unauthorizedReason:
          'Shared farm has not been initialized yet. Sign in first on the Administrator phone to initialize the farm and authorize team accounts.',
      };
    }

    const initialAccess = {
      farmId: SHARED_FARM_ID,
      farmName: (localSettings.farmName || 'My Smart Dairy Farm').slice(0, 120),
      adminUid: user.uid,
      adminEmail: BOOTSTRAPPED_ADMIN_EMAIL,
      memberEmail: '',
      memberUid: '',
      workerEmail: '',
      workerUid: '',
      workerActive: false,
      managerEmails: [BOOTSTRAPPED_ADMIN_EMAIL],
      authorizedEmails: [BOOTSTRAPPED_ADMIN_EMAIL],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(farmRef, initialAccess);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, farmPath);
    }

    const settingsPath = `farms/${SHARED_FARM_ID}/settings/config`;
    try {
      await setDoc(doc(db, 'farms', SHARED_FARM_ID, 'settings', 'config'), {
        farmId: SHARED_FARM_ID,
        farmName: (localSettings.farmName || 'My Smart Dairy Farm').slice(0, 120),
        ownerName: (localSettings.ownerName || '').slice(0, 120),
        phone: (localSettings.phone || '').slice(0, 30),
        address: (localSettings.address || '').slice(0, 300),
        currencySymbol: (localSettings.currencySymbol || '₹').slice(0, 8),
        volumeUnit: (localSettings.volumeUnit || 'L').slice(0, 16),
        weightUnit: (localSettings.weightUnit || 'kg').slice(0, 16),
        enableAfternoonSession: Boolean(localSettings.enableAfternoonSession),
        defaultMilkRatePerLitre: Number(localSettings.defaultMilkRatePerLitre || 48),
        gestationDaysCow: Number(localSettings.gestationDaysCow || 283),
        gestationDaysBuffalo: Number(localSettings.gestationDaysBuffalo || 310),
        notificationsEnabled: Boolean(localSettings.notificationsEnabled),
        setupCompleted: Boolean(localSettings.setupCompleted),
        version: Math.max(1, localSettings.version || 1),
        updatedBy: user.uid,
        updatedByEmail: email,
        authorizedEmails: [BOOTSTRAPPED_ADMIN_EMAIL],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, settingsPath);
    }

    return {
      role: 'ADMIN',
      farmAccess: {
        farmId: SHARED_FARM_ID,
        farmName: initialAccess.farmName,
        adminUid: user.uid,
        adminEmail: BOOTSTRAPPED_ADMIN_EMAIL,
        memberEmail: '',
        memberUid: '',
        workerEmail: '',
        workerUid: '',
        workerActive: false,
        managerEmails: [BOOTSTRAPPED_ADMIN_EMAIL],
        authorizedEmails: [BOOTSTRAPPED_ADMIN_EMAIL],
      },
      unauthorizedReason: null,
    };
  }

  const rawData = snap.data() as Record<string, unknown>;
  const profile = parseFarmAccessDoc(rawData);

  // Seamless Admin schema upgrade from 2-user to 3-user FarmAccess if needed
  if (email === BOOTSTRAPPED_ADMIN_EMAIL && profile.adminUid === user.uid) {
    if (!('workerEmail' in rawData) || !Array.isArray(rawData.managerEmails)) {
      const upgraded = buildRoleEmailArrays(
        profile.memberEmail,
        profile.workerEmail,
        profile.workerActive
      );
      try {
        await updateDoc(farmRef, {
          workerEmail: profile.workerEmail,
          workerUid: profile.workerUid,
          workerActive: profile.workerActive,
          managerEmails: upgraded.managerEmails,
          authorizedEmails: upgraded.authorizedEmails,
          updatedAt: serverTimestamp(),
        });
        profile.managerEmails = upgraded.managerEmails;
        profile.authorizedEmails = upgraded.authorizedEmails;
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, farmPath);
      }
    }
    return { role: 'ADMIN', farmAccess: profile, unauthorizedReason: null };
  }

  if (profile.memberEmail && email === profile.memberEmail) {
    if (!profile.memberUid) {
      try {
        await updateDoc(farmRef, {
          memberUid: user.uid,
          updatedAt: serverTimestamp(),
        });
        profile.memberUid = user.uid;
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, farmPath);
      }
    } else if (profile.memberUid !== user.uid) {
      await signOut(auth);
      return {
        role: 'UNAUTHORIZED',
        farmAccess: null,
        unauthorizedReason:
          'This Farm Member email is bound to another UID. Ask the Farm Administrator to refresh your email access.',
      };
    }
    return { role: 'MEMBER', farmAccess: profile, unauthorizedReason: null };
  }

  if (profile.workerEmail && email === profile.workerEmail) {
    if (!profile.workerActive) {
      await signOut(auth);
      return {
        role: 'UNAUTHORIZED',
        farmAccess: null,
        unauthorizedReason:
          'Your Farm Worker account is currently suspended by the Farm Administrator.',
      };
    }
    if (!profile.workerUid) {
      try {
        await updateDoc(farmRef, {
          workerUid: user.uid,
          updatedAt: serverTimestamp(),
        });
        profile.workerUid = user.uid;
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, farmPath);
      }
    } else if (profile.workerUid !== user.uid) {
      await signOut(auth);
      return {
        role: 'UNAUTHORIZED',
        farmAccess: null,
        unauthorizedReason:
          'This Farm Worker email is bound to another UID. Ask the Farm Administrator to refresh your Worker access.',
      };
    }
    return { role: 'WORKER', farmAccess: profile, unauthorizedReason: null };
  }

  await signOut(auth);
  return {
    role: 'UNAUTHORIZED',
    farmAccess: null,
    unauthorizedReason: `Access denied: "${email}" is not authorized for this farm. Maximum 3 authorized accounts (Administrator, Uncle Farm Member, and 1 Farm Worker) are permitted.`,
  };
}

export async function updateTeamAccessAsAdmin(
  user: User,
  currentAccess: FarmAccessProfile,
  input: {
    memberEmail: string;
    workerEmail: string;
    workerActive: boolean;
  }
): Promise<FarmAccessProfile> {
  const adminEmail = (user.email || '').trim().toLowerCase();
  if (adminEmail !== BOOTSTRAPPED_ADMIN_EMAIL || user.uid !== currentAccess.adminUid) {
    throw new Error('Only the Farm Administrator can manage team accounts and permissions.');
  }

  const cleanMemberEmail = input.memberEmail.trim().toLowerCase();
  const cleanWorkerEmail = input.workerEmail.trim().toLowerCase();

  if (cleanMemberEmail) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanMemberEmail) || cleanMemberEmail.length > 160) {
      throw new Error('Enter a valid Google email address for Farm Member (Uncle).');
    }
    if (cleanMemberEmail === BOOTSTRAPPED_ADMIN_EMAIL) {
      throw new Error('Farm Member email must be separate from your Administrator email.');
    }
  }

  if (cleanWorkerEmail) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanWorkerEmail) || cleanWorkerEmail.length > 160) {
      throw new Error('Enter a valid Google email address for Farm Worker.');
    }
    if (cleanWorkerEmail === BOOTSTRAPPED_ADMIN_EMAIL) {
      throw new Error('Farm Worker email must be separate from your Administrator email.');
    }
    if (cleanMemberEmail && cleanWorkerEmail === cleanMemberEmail) {
      throw new Error('Farm Worker and Farm Member (Uncle) must use separate Google accounts.');
    }
  }

  const effectiveWorkerActive = cleanWorkerEmail ? Boolean(input.workerActive) : false;
  const { managerEmails: nextManagerEmails, authorizedEmails: nextAuthorizedEmails } =
    buildRoleEmailArrays(cleanMemberEmail, cleanWorkerEmail, effectiveWorkerActive);

  const nextMemberUid =
    cleanMemberEmail && cleanMemberEmail === currentAccess.memberEmail
      ? currentAccess.memberUid
      : '';
  const nextWorkerUid =
    cleanWorkerEmail && cleanWorkerEmail === currentAccess.workerEmail
      ? currentAccess.workerUid
      : '';

  const farmPath = `farms/${SHARED_FARM_ID}`;
  try {
    await updateDoc(doc(db, 'farms', SHARED_FARM_ID), {
      memberEmail: cleanMemberEmail,
      memberUid: nextMemberUid,
      workerEmail: cleanWorkerEmail,
      workerUid: nextWorkerUid,
      workerActive: effectiveWorkerActive,
      managerEmails: nextManagerEmails,
      authorizedEmails: nextAuthorizedEmails,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, farmPath);
  }

  const settingsRef = doc(db, 'farms', SHARED_FARM_ID, 'settings', 'config');
  try {
    const sSnap = await getDoc(settingsRef);
    if (sSnap.exists()) {
      await updateDoc(settingsRef, {
        authorizedEmails: nextAuthorizedEmails,
        updatedBy: user.uid,
        updatedByEmail: adminEmail,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `farms/${SHARED_FARM_ID}/settings/config`);
  }

  // Propagate role-segregated email arrays across existing records:
  // Worker-allowed stores receive nextAuthorizedEmails; financial/sensitive stores receive nextManagerEmails!
  const recordsPath = `farms/${SHARED_FARM_ID}/records`;
  try {
    const recordsQ = query(
      collection(db, 'farms', SHARED_FARM_ID, 'records'),
      where('authorizedEmails', 'array-contains', BOOTSTRAPPED_ADMIN_EMAIL)
    );
    const recSnap = await getDocs(recordsQ);
    const docs = recSnap.docs;
    for (let i = 0; i < docs.length; i += 350) {
      const batch = writeBatch(db);
      for (const d of docs.slice(i, i + 350)) {
        const sName = String(d.data().storeName || '') as OperationalStoreName;
        const targetEmails = WORKER_ALLOWED_STORES.has(sName)
          ? nextAuthorizedEmails
          : nextManagerEmails;
        batch.update(d.ref, {
          authorizedEmails: targetEmails,
          updatedBy: user.uid,
          updatedByEmail: adminEmail,
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, recordsPath);
  }

  const conflictsPath = `farms/${SHARED_FARM_ID}/conflicts`;
  try {
    const confQ = query(
      collection(db, 'farms', SHARED_FARM_ID, 'conflicts'),
      where('authorizedEmails', 'array-contains', BOOTSTRAPPED_ADMIN_EMAIL)
    );
    const confSnap = await getDocs(confQ);
    const docs = confSnap.docs;
    for (let i = 0; i < docs.length; i += 350) {
      const batch = writeBatch(db);
      for (const d of docs.slice(i, i + 350)) {
        batch.update(d.ref, {
          authorizedEmails: nextManagerEmails,
          updatedBy: user.uid,
          updatedByEmail: adminEmail,
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, conflictsPath);
  }

  return {
    ...currentAccess,
    memberEmail: cleanMemberEmail,
    memberUid: nextMemberUid,
    workerEmail: cleanWorkerEmail,
    workerUid: nextWorkerUid,
    workerActive: effectiveWorkerActive,
    managerEmails: nextManagerEmails,
    authorizedEmails: nextAuthorizedEmails,
  };
}

let activePushPromise: Promise<{ pushed: number; conflicts: number }> | null = null;

export async function pushPendingChangesToCloud(
  user: User,
  role: UserRole,
  farmAccess: FarmAccessProfile
): Promise<{ pushed: number; conflicts: number }> {
  if (role !== 'ADMIN' && role !== 'MEMBER' && role !== 'WORKER') {
    return { pushed: 0, conflicts: 0 };
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { pushed: 0, conflicts: 0 };
  if (activePushPromise) return activePushPromise;

  activePushPromise = (async () => {
    let pushed = 0;
    let conflicts = 0;
    const userEmail = (user.email || '').trim().toLowerCase();
    const localDb = await getDB();

    // 1. Push FarmSettings if user is ADMIN and settings has pending local edits
    if (role === 'ADMIN') {
      const localSettings = await localDb.get('farm_settings', 1);
      if (localSettings && localSettings.syncStatus === SyncStatus.PENDING_SYNC) {
        const settingsPath = `farms/${SHARED_FARM_ID}/settings/config`;
        const settingsRef = doc(db, 'farms', SHARED_FARM_ID, 'settings', 'config');
        try {
          let nextVer = Math.max(1, localSettings.version || 1);
          await runTransaction(db, async (tx) => {
            const sSnap = await tx.get(settingsRef);
            if (!sSnap.exists()) {
              tx.set(settingsRef, {
                farmId: SHARED_FARM_ID,
                farmName: (localSettings.farmName || 'My Smart Dairy Farm').slice(0, 120),
                ownerName: (localSettings.ownerName || '').slice(0, 120),
                phone: (localSettings.phone || '').slice(0, 30),
                address: (localSettings.address || '').slice(0, 300),
                currencySymbol: (localSettings.currencySymbol || '₹').slice(0, 8),
                volumeUnit: (localSettings.volumeUnit || 'L').slice(0, 16),
                weightUnit: (localSettings.weightUnit || 'kg').slice(0, 16),
                enableAfternoonSession: Boolean(localSettings.enableAfternoonSession),
                defaultMilkRatePerLitre: Number(localSettings.defaultMilkRatePerLitre || 48),
                gestationDaysCow: Number(localSettings.gestationDaysCow || 283),
                gestationDaysBuffalo: Number(localSettings.gestationDaysBuffalo || 310),
                notificationsEnabled: Boolean(localSettings.notificationsEnabled),
                setupCompleted: Boolean(localSettings.setupCompleted),
                version: nextVer,
                updatedBy: user.uid,
                updatedByEmail: userEmail,
                authorizedEmails: farmAccess.authorizedEmails,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            } else {
              const curVer = Number(sSnap.data().version || 1);
              nextVer = curVer + 1;
              tx.update(settingsRef, {
                farmName: (localSettings.farmName || 'My Smart Dairy Farm').slice(0, 120),
                ownerName: (localSettings.ownerName || '').slice(0, 120),
                phone: (localSettings.phone || '').slice(0, 30),
                address: (localSettings.address || '').slice(0, 300),
                currencySymbol: (localSettings.currencySymbol || '₹').slice(0, 8),
                volumeUnit: (localSettings.volumeUnit || 'L').slice(0, 16),
                weightUnit: (localSettings.weightUnit || 'kg').slice(0, 16),
                enableAfternoonSession: Boolean(localSettings.enableAfternoonSession),
                defaultMilkRatePerLitre: Number(localSettings.defaultMilkRatePerLitre || 48),
                gestationDaysCow: Number(localSettings.gestationDaysCow || 283),
                gestationDaysBuffalo: Number(localSettings.gestationDaysBuffalo || 310),
                notificationsEnabled: Boolean(localSettings.notificationsEnabled),
                setupCompleted: Boolean(localSettings.setupCompleted),
                version: nextVer,
                updatedBy: user.uid,
                updatedByEmail: userEmail,
                authorizedEmails: farmAccess.authorizedEmails,
                updatedAt: serverTimestamp(),
              });
            }
          });

          await localDb.put('farm_settings', {
            ...localSettings,
            version: nextVer,
            updatedBy: user.uid,
            updatedByEmail: userEmail,
            syncStatus: SyncStatus.SYNCED,
          });
          pushed += 1;
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, settingsPath);
        }
      }
    }

    // 2. Push pending records across permitted stores for this role
    const storesToPush =
      role === 'WORKER' ? WORKER_ALLOWED_STORE_NAMES : OPERATIONAL_STORE_NAMES;

    for (const storeName of storesToPush) {
      const allInStore = (await localDb.getAll(storeName)) as unknown as Array<
        SyncMetadata & Record<string, unknown>
      >;
      const targetRecordEmails = getExpectedRecordEmails(farmAccess, storeName);

      for (const item of allInStore) {
        if (role === 'WORKER' && item.isDeleted) {
          continue; // Workers are strictly prohibited from deleting records
        }

        if (storeName === 'reminders') {
          const rem = item as unknown as Reminder;
          if (!rem.dedupeKey.startsWith('CUSTOM_') && !rem.dismissed) {
            continue;
          }
        }

        if (
          item.syncStatus !== SyncStatus.PENDING_SYNC &&
          item.syncStatus !== SyncStatus.LOCAL_ONLY &&
          item.syncStatus !== SyncStatus.ERROR
        ) {
          continue;
        }

        const docId = makeCloudDocId(storeName, item.id);
        const recPath = `farms/${SHARED_FARM_ID}/records/${docId}`;
        const recRef = doc(db, 'farms', SHARED_FARM_ID, 'records', docId);
        const sanitizedData = sanitizeEntityForFirestore(item, {
          stripWorkerFinancials: role === 'WORKER',
        });
        const localBase = item.baseVersion ?? 0;

        try {
          type PushOutcome =
            | { kind: 'synced'; finalVersion: number }
            | {
                kind: 'conflict';
                serverVersion: number;
                serverData: Record<string, unknown>;
                serverUpdatedByEmail: string;
                serverIsDeleted: boolean;
              };

          const outcome: PushOutcome = await runTransaction(db, async (tx): Promise<PushOutcome> => {
            const snap = await tx.get(recRef);
            if (!snap.exists()) {
              const initialVer = Math.max(1, item.version || 1);
              tx.set(recRef, {
                docId,
                farmId: SHARED_FARM_ID,
                storeName,
                recordId: item.id,
                data: sanitizedData,
                version: initialVer,
                baseVersion: 0,
                isDeleted: role === 'WORKER' ? false : Boolean(item.isDeleted),
                clientCreatedAt: Math.max(0, Math.floor(item.createdAt || Date.now())),
                clientUpdatedAt: Math.max(0, Math.floor(item.updatedAt || Date.now())),
                updatedBy: user.uid,
                updatedByEmail: userEmail,
                authorizedEmails: targetRecordEmails,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
              return { kind: 'synced', finalVersion: initialVer };
            } else {
              const cloud = snap.data();
              const cloudVer = Number(cloud.version || 1);
              const cloudData = (cloud.data || {}) as Record<string, unknown>;

              // If a Worker updates an operational record (e.g. dam status -> LACTATING on calving),
              // preserve any existing manager-only financial fields already on cloudData!
              const mergedSanitized = { ...sanitizedData };
              if (role === 'WORKER') {
                for (const finKey of WORKER_STRIPPED_FINANCIAL_KEYS) {
                  if (cloudData[finKey] !== undefined) {
                    mergedSanitized[finKey] = cloudData[finKey];
                  }
                }
              }

              if (cloudVer === localBase && !(role === 'WORKER' && Boolean(cloud.isDeleted))) {
                const nextVer = cloudVer + 1;
                tx.update(recRef, {
                  data: mergedSanitized,
                  version: nextVer,
                  baseVersion: cloudVer,
                  isDeleted: role === 'WORKER' ? false : Boolean(item.isDeleted),
                  clientUpdatedAt: Math.max(0, Math.floor(item.updatedAt || Date.now())),
                  updatedBy: user.uid,
                  updatedByEmail: userEmail,
                  authorizedEmails: targetRecordEmails,
                  updatedAt: serverTimestamp(),
                });
                return { kind: 'synced', finalVersion: nextVer };
              } else if (
                stableDataSignature(cloudData) === stableDataSignature(mergedSanitized) &&
                Boolean(cloud.isDeleted) === Boolean(item.isDeleted)
              ) {
                return { kind: 'synced', finalVersion: cloudVer };
              } else {
                return {
                  kind: 'conflict',
                  serverVersion: cloudVer,
                  serverData: cloudData,
                  serverUpdatedByEmail: String(cloud.updatedByEmail || BOOTSTRAPPED_ADMIN_EMAIL),
                  serverIsDeleted: Boolean(cloud.isDeleted),
                };
              }
            }
          });

          if (outcome.kind === 'synced') {
            await localDb.put(
              storeName,
              {
                ...item,
                farmId: SHARED_FARM_ID,
                version: outcome.finalVersion,
                baseVersion: outcome.finalVersion,
                syncStatus: SyncStatus.SYNCED,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } as any
            );
            pushed += 1;
          } else {
            const conflictId = `conf_${docId}_${Date.now()}`.slice(0, 120);
            const conflictPath = `farms/${SHARED_FARM_ID}/conflicts/${conflictId}`;
            const nowMs = Date.now();
            try {
              await setDoc(doc(db, 'farms', SHARED_FARM_ID, 'conflicts', conflictId), {
                conflictId,
                farmId: SHARED_FARM_ID,
                docId,
                storeName,
                recordId: item.id,
                serverVersion: outcome.serverVersion,
                proposedBaseVersion: localBase,
                serverData: outcome.serverData,
                proposedData: sanitizedData,
                serverUpdatedByEmail: outcome.serverUpdatedByEmail,
                proposedByUid: user.uid,
                proposedByEmail: userEmail,
                status: 'OPEN',
                resolution: '',
                updatedBy: user.uid,
                updatedByEmail: userEmail,
                authorizedEmails: farmAccess.managerEmails,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            } catch (cErr) {
              handleFirestoreError(cErr, OperationType.CREATE, conflictPath);
            }

            if (role !== 'WORKER') {
              await localDb.put('sync_conflicts', {
                conflictId,
                farmId: SHARED_FARM_ID,
                docId,
                storeName,
                recordId: item.id,
                serverVersion: outcome.serverVersion,
                proposedBaseVersion: localBase,
                serverData: outcome.serverData,
                proposedData: sanitizedData,
                serverUpdatedByEmail: outcome.serverUpdatedByEmail,
                proposedByUid: user.uid,
                proposedByEmail: userEmail,
                status: 'OPEN',
                resolution: '',
                createdAtMs: nowMs,
                updatedAtMs: nowMs,
              });
            }

            const cleanedServerForLocal =
              role === 'WORKER'
                ? sanitizeEntityForFirestore(outcome.serverData, { stripWorkerFinancials: true })
                : outcome.serverData;

            await localDb.put(
              storeName,
              {
                ...cleanedServerForLocal,
                id: item.id,
                farmId: SHARED_FARM_ID,
                version: outcome.serverVersion,
                baseVersion: outcome.serverVersion,
                isDeleted: outcome.serverIsDeleted,
                syncStatus: SyncStatus.SYNCED,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } as any
            );
            conflicts += 1;
          }
        } catch (err) {
          await localDb.put(
            storeName,
            {
              ...item,
              syncStatus: SyncStatus.ERROR,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any
          );
          handleFirestoreError(err, OperationType.WRITE, recPath);
        }
      }
    }

    const prefs = await localDb.get('app_preferences', 1);
    if (prefs) {
      await localDb.put('app_preferences', {
        ...prefs,
        cloudSyncEnabled: true,
        lastCloudSyncedAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    return { pushed, conflicts };
  })();

  try {
    return await activePushPromise;
  } finally {
    activePushPromise = null;
  }
}

export function startRealtimeFarmListeners(params: {
  user: User;
  role: UserRole;
  onDataApplied: () => void;
  onAccessUpdated: (nextAccess: FarmAccessProfile) => void;
  onAccessRevoked: (reason: string) => void;
  onError: (err: unknown) => void;
}): Unsubscribe {
  const { user, role, onDataApplied, onAccessUpdated, onAccessRevoked, onError } = params;
  const userEmail = (user.email || '').trim().toLowerCase();
  const unsubs: Unsubscribe[] = [];

  // 1. Farm Access Document Listener
  const farmPath = `farms/${SHARED_FARM_ID}`;
  unsubs.push(
    onSnapshot(
      doc(db, 'farms', SHARED_FARM_ID),
      (snap) => {
        if (!snap.exists()) return;
        const nextAccess = parseFarmAccessDoc(snap.data() as Record<string, unknown>);

        if (role === 'MEMBER' && (!nextAccess.memberEmail || nextAccess.memberEmail !== userEmail)) {
          onAccessRevoked('Your Farm Member access was revoked by the Farm Administrator.');
          return;
        }
        if (
          role === 'WORKER' &&
          (!nextAccess.workerEmail || nextAccess.workerEmail !== userEmail || !nextAccess.workerActive)
        ) {
          onAccessRevoked(
            'Your Farm Worker account has been suspended or revoked by the Farm Administrator.'
          );
          return;
        }
        onAccessUpdated(nextAccess);
      },
      (err) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.includes('Missing or insufficient permissions') &&
          userEmail !== BOOTSTRAPPED_ADMIN_EMAIL
        ) {
          onAccessRevoked('Your farm account access is no longer active.');
          return;
        }
        try {
          handleFirestoreError(err, OperationType.GET, farmPath);
        } catch (wrapped) {
          onError(wrapped);
        }
      }
    )
  );

  // 2. Shared Farm Settings Listener
  const settingsPath = `farms/${SHARED_FARM_ID}/settings/config`;
  unsubs.push(
    onSnapshot(
      doc(db, 'farms', SHARED_FARM_ID, 'settings', 'config'),
      async (snap) => {
        if (!snap.exists()) return;
        const d = snap.data();
        const localDb = await getDB();
        const cur = await localDb.get('farm_settings', 1);
        if (role === 'ADMIN' && cur && cur.syncStatus === SyncStatus.PENDING_SYNC) {
          return;
        }
        const incomingVer = Number(d.version || 1);
        if (!cur || incomingVer >= (cur.version || 0)) {
          await localDb.put('farm_settings', {
            id: 1,
            farmId: SHARED_FARM_ID,
            farmName: String(d.farmName || 'My Smart Dairy Farm'),
            ownerName: String(d.ownerName || ''),
            phone: String(d.phone || ''),
            address: String(d.address || ''),
            currencySymbol: String(d.currencySymbol || '₹'),
            volumeUnit: String(d.volumeUnit || 'L'),
            weightUnit: String(d.weightUnit || 'kg'),
            enableAfternoonSession: Boolean(d.enableAfternoonSession),
            defaultMilkRatePerLitre: role === 'WORKER' ? 0 : Number(d.defaultMilkRatePerLitre ?? 48),
            gestationDaysCow: Number(d.gestationDaysCow ?? 283),
            gestationDaysBuffalo: Number(d.gestationDaysBuffalo ?? 310),
            notificationsEnabled: Boolean(d.notificationsEnabled),
            setupCompleted: Boolean(d.setupCompleted),
            version: incomingVer,
            updatedBy: String(d.updatedBy || ''),
            updatedByEmail: String(d.updatedByEmail || ''),
            syncStatus: SyncStatus.SYNCED,
            updatedAt: timestampToMs(d.updatedAt),
          });
          onDataApplied();
        }
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.GET, settingsPath);
        } catch (wrapped) {
          onError(wrapped);
        }
      }
    )
  );

  // 3. Shared Farm Records Real-Time Stream
  const recordsPath = `farms/${SHARED_FARM_ID}/records`;
  const recordsQ = query(
    collection(db, 'farms', SHARED_FARM_ID, 'records'),
    where('authorizedEmails', 'array-contains', userEmail)
  );
  unsubs.push(
    onSnapshot(
      recordsQ,
      async (snapshot) => {
        const changes = snapshot.docChanges();
        if (changes.length === 0) return;
        const localDb = await getDB();
        let mutated = false;

        for (const change of changes) {
          if (change.type !== 'added' && change.type !== 'modified') continue;
          const docData = change.doc.data();
          const storeName = docData.storeName as OperationalStoreName;
          if (!OPERATIONAL_STORE_NAMES.includes(storeName)) continue;
          if (role === 'WORKER' && !WORKER_ALLOWED_STORES.has(storeName)) continue;

          const recordId = String(docData.recordId);
          const cloudVer = Number(docData.version || 1);
          const rawPayload = (docData.data || {}) as Record<string, unknown>;
          const payload =
            role === 'WORKER'
              ? sanitizeEntityForFirestore(rawPayload, { stripWorkerFinancials: true })
              : rawPayload;

          const existingLocal = (await localDb.get(storeName, recordId)) as
            | (SyncMetadata & Record<string, unknown>)
            | undefined;

          if (
            existingLocal &&
            (existingLocal.syncStatus === SyncStatus.PENDING_SYNC ||
              existingLocal.syncStatus === SyncStatus.ERROR)
          ) {
            continue;
          }

          if (
            existingLocal &&
            existingLocal.syncStatus === SyncStatus.SYNCED &&
            existingLocal.version === cloudVer &&
            existingLocal.isDeleted === Boolean(docData.isDeleted)
          ) {
            continue;
          }

          if (storeName === 'reminders' && typeof payload.dedupeKey === 'string') {
            const byDedupe = await localDb
              .getFromIndex('reminders', 'by-dedupe', payload.dedupeKey);
            if (byDedupe && byDedupe.id !== recordId) {
              await localDb.delete('reminders', byDedupe.id);
            }
          }

          const mergedRecord = {
            ...payload,
            id: recordId,
            farmId: SHARED_FARM_ID,
            createdAt: Number(docData.clientCreatedAt || payload.createdAt || Date.now()),
            updatedAt: Number(docData.clientUpdatedAt || payload.updatedAt || Date.now()),
            updatedBy: String(docData.updatedBy || ''),
            updatedByEmail: String(docData.updatedByEmail || ''),
            version: cloudVer,
            baseVersion: cloudVer,
            isDeleted: Boolean(docData.isDeleted),
            syncStatus: SyncStatus.SYNCED,
          };

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await localDb.put(storeName, mergedRecord as any);
          mutated = true;
        }

        if (mutated) {
          const prefs = await localDb.get('app_preferences', 1);
          if (prefs) {
            await localDb.put('app_preferences', {
              ...prefs,
              lastCloudSyncedAt: Date.now(),
              updatedAt: Date.now(),
            });
          }
          onDataApplied();
        }
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, recordsPath);
        } catch (wrapped) {
          onError(wrapped);
        }
      }
    )
  );

  // 4. Sync Conflicts Queue Real-Time Stream (Managers ONLY: Admin & Uncle)
  if (role === 'ADMIN' || role === 'MEMBER') {
    const conflictsPath = `farms/${SHARED_FARM_ID}/conflicts`;
    const conflictsQ = query(
      collection(db, 'farms', SHARED_FARM_ID, 'conflicts'),
      where('authorizedEmails', 'array-contains', userEmail)
    );
    unsubs.push(
      onSnapshot(
        conflictsQ,
        async (snapshot) => {
          const changes = snapshot.docChanges();
          if (changes.length === 0) return;
          const localDb = await getDB();
          let mutated = false;

          for (const change of changes) {
            if (change.type !== 'added' && change.type !== 'modified') continue;
            const d = change.doc.data();
            const item: SyncConflictItem = {
              conflictId: String(d.conflictId),
              farmId: String(d.farmId || SHARED_FARM_ID),
              docId: String(d.docId),
              storeName: d.storeName as OperationalStoreName,
              recordId: String(d.recordId),
              serverVersion: Number(d.serverVersion || 1),
              proposedBaseVersion: Number(d.proposedBaseVersion || 0),
              serverData: (d.serverData || {}) as Record<string, unknown>,
              proposedData: (d.proposedData || {}) as Record<string, unknown>,
              serverUpdatedByEmail: String(d.serverUpdatedByEmail || ''),
              proposedByUid: String(d.proposedByUid || ''),
              proposedByEmail: String(d.proposedByEmail || ''),
              status: d.status === 'RESOLVED' ? 'RESOLVED' : 'OPEN',
              resolution: (d.resolution || '') as SyncConflictItem['resolution'],
              createdAtMs: timestampToMs(d.createdAt),
              updatedAtMs: timestampToMs(d.updatedAt),
            };
            await localDb.put('sync_conflicts', item);
            mutated = true;
          }

          if (mutated) {
            onDataApplied();
          }
        },
        (err) => {
          try {
            handleFirestoreError(err, OperationType.LIST, conflictsPath);
          } catch (wrapped) {
            onError(wrapped);
          }
        }
      )
    );
  }

  return () => {
    for (const u of unsubs) {
      u();
    }
  };
}

export const ADDITIVE_CONFLICT_STORES = new Set<OperationalStoreName>([
  'milk_records',
  'milk_sales',
  'feed_records',
  'feed_stock_transactions',
  'health_records',
  'veterinary_visits',
  'vaccination_records',
  'weight_records',
  'income_records',
  'expense_records',
  'farm_tasks',
]);

export async function resolveConflictAsAdmin(params: {
  user: User;
  farmAccess: FarmAccessProfile;
  conflict: SyncConflictItem;
  resolution: 'KEEP_SERVER' | 'APPLY_PROPOSED' | 'KEEP_BOTH';
}): Promise<void> {
  const { user, farmAccess, conflict, resolution } = params;
  const adminEmail = (user.email || '').trim().toLowerCase();
  if (adminEmail !== BOOTSTRAPPED_ADMIN_EMAIL || user.uid !== farmAccess.adminUid) {
    throw new Error('Only the Farm Administrator can resolve synchronization conflicts.');
  }

  const localDb = await getDB();
  const recRef = doc(db, 'farms', SHARED_FARM_ID, 'records', conflict.docId);
  const confRef = doc(db, 'farms', SHARED_FARM_ID, 'conflicts', conflict.conflictId);
  const targetRecordEmails = getExpectedRecordEmails(farmAccess, conflict.storeName);

  if (resolution === 'APPLY_PROPOSED') {
    const recPath = `farms/${SHARED_FARM_ID}/records/${conflict.docId}`;
    try {
      let appliedVersion = conflict.serverVersion + 1;
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(recRef);
        const curVer = snap.exists() ? Number(snap.data().version || 1) : conflict.serverVersion;
        appliedVersion = curVer + 1;
        const cleanData = sanitizeEntityForFirestore({
          ...conflict.proposedData,
          id: conflict.recordId,
        });
        if (snap.exists()) {
          tx.update(recRef, {
            data: cleanData,
            version: appliedVersion,
            baseVersion: curVer,
            isDeleted: Boolean(conflict.proposedData.isDeleted),
            clientUpdatedAt: Date.now(),
            updatedBy: user.uid,
            updatedByEmail: adminEmail,
            authorizedEmails: targetRecordEmails,
            updatedAt: serverTimestamp(),
          });
        }
      });

      await localDb.put(
        conflict.storeName,
        {
          ...conflict.proposedData,
          id: conflict.recordId,
          farmId: SHARED_FARM_ID,
          version: appliedVersion,
          baseVersion: appliedVersion,
          updatedBy: user.uid,
          updatedByEmail: adminEmail,
          syncStatus: SyncStatus.SYNCED,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, recPath);
    }
  } else if (resolution === 'KEEP_BOTH') {
    const newId = crypto.randomUUID();
    const newDocId = makeCloudDocId(conflict.storeName, newId);
    const newRecPath = `farms/${SHARED_FARM_ID}/records/${newDocId}`;
    const now = Date.now();
    const duplicatedPayload = sanitizeEntityForFirestore({
      ...conflict.proposedData,
      id: newId,
      createdAt: now,
      updatedAt: now,
    });

    try {
      await setDoc(doc(db, 'farms', SHARED_FARM_ID, 'records', newDocId), {
        docId: newDocId,
        farmId: SHARED_FARM_ID,
        storeName: conflict.storeName,
        recordId: newId,
        data: duplicatedPayload,
        version: 1,
        baseVersion: 0,
        isDeleted: false,
        clientCreatedAt: now,
        clientUpdatedAt: now,
        updatedBy: user.uid,
        updatedByEmail: adminEmail,
        authorizedEmails: targetRecordEmails,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await localDb.put(
        conflict.storeName,
        {
          ...duplicatedPayload,
          id: newId,
          farmId: SHARED_FARM_ID,
          createdAt: now,
          updatedAt: now,
          updatedBy: user.uid,
          updatedByEmail: adminEmail,
          version: 1,
          baseVersion: 1,
          isDeleted: false,
          syncStatus: SyncStatus.SYNCED,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, newRecPath);
    }
  }

  const confPath = `farms/${SHARED_FARM_ID}/conflicts/${conflict.conflictId}`;
  try {
    await updateDoc(confRef, {
      status: 'RESOLVED',
      resolution,
      updatedBy: user.uid,
      updatedByEmail: adminEmail,
      authorizedEmails: farmAccess.managerEmails,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, confPath);
  }

  await localDb.put('sync_conflicts', {
    ...conflict,
    status: 'RESOLVED',
    resolution,
    updatedAtMs: Date.now(),
  });
}

export async function adminForcePushAllRestoredRecords(
  user: User,
  farmAccess: FarmAccessProfile
): Promise<number> {
  const adminEmail = (user.email || '').trim().toLowerCase();
  if (adminEmail !== BOOTSTRAPPED_ADMIN_EMAIL || user.uid !== farmAccess.adminUid) {
    throw new Error('Only the Farm Administrator can synchronize a backup restore.');
  }

  const localDb = await getDB();
  let count = 0;

  const localSettings = await localDb.get('farm_settings', 1);
  if (localSettings) {
    const settingsRef = doc(db, 'farms', SHARED_FARM_ID, 'settings', 'config');
    try {
      await runTransaction(db, async (tx) => {
        const sSnap = await tx.get(settingsRef);
        const nextVer = sSnap.exists() ? Number(sSnap.data().version || 1) + 1 : 1;
        if (!sSnap.exists()) {
          tx.set(settingsRef, {
            farmId: SHARED_FARM_ID,
            farmName: (localSettings.farmName || 'My Smart Dairy Farm').slice(0, 120),
            ownerName: (localSettings.ownerName || '').slice(0, 120),
            phone: (localSettings.phone || '').slice(0, 30),
            address: (localSettings.address || '').slice(0, 300),
            currencySymbol: (localSettings.currencySymbol || '₹').slice(0, 8),
            volumeUnit: (localSettings.volumeUnit || 'L').slice(0, 16),
            weightUnit: (localSettings.weightUnit || 'kg').slice(0, 16),
            enableAfternoonSession: Boolean(localSettings.enableAfternoonSession),
            defaultMilkRatePerLitre: Number(localSettings.defaultMilkRatePerLitre || 48),
            gestationDaysCow: Number(localSettings.gestationDaysCow || 283),
            gestationDaysBuffalo: Number(localSettings.gestationDaysBuffalo || 310),
            notificationsEnabled: Boolean(localSettings.notificationsEnabled),
            setupCompleted: Boolean(localSettings.setupCompleted),
            version: nextVer,
            updatedBy: user.uid,
            updatedByEmail: adminEmail,
            authorizedEmails: farmAccess.authorizedEmails,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          tx.update(settingsRef, {
            farmName: (localSettings.farmName || 'My Smart Dairy Farm').slice(0, 120),
            ownerName: (localSettings.ownerName || '').slice(0, 120),
            phone: (localSettings.phone || '').slice(0, 30),
            address: (localSettings.address || '').slice(0, 300),
            currencySymbol: (localSettings.currencySymbol || '₹').slice(0, 8),
            volumeUnit: (localSettings.volumeUnit || 'L').slice(0, 16),
            weightUnit: (localSettings.weightUnit || 'kg').slice(0, 16),
            enableAfternoonSession: Boolean(localSettings.enableAfternoonSession),
            defaultMilkRatePerLitre: Number(localSettings.defaultMilkRatePerLitre || 48),
            gestationDaysCow: Number(localSettings.gestationDaysCow || 283),
            gestationDaysBuffalo: Number(localSettings.gestationDaysBuffalo || 310),
            notificationsEnabled: Boolean(localSettings.notificationsEnabled),
            setupCompleted: Boolean(localSettings.setupCompleted),
            version: nextVer,
            updatedBy: user.uid,
            updatedByEmail: adminEmail,
            authorizedEmails: farmAccess.authorizedEmails,
            updatedAt: serverTimestamp(),
          });
        }
      });
      await localDb.put('farm_settings', {
        ...localSettings,
        syncStatus: SyncStatus.SYNCED,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `farms/${SHARED_FARM_ID}/settings/config`);
    }
  }

  for (const storeName of OPERATIONAL_STORE_NAMES) {
    const items = (await localDb.getAll(storeName)) as unknown as Array<
      SyncMetadata & Record<string, unknown>
    >;
    const targetRecordEmails = getExpectedRecordEmails(farmAccess, storeName);

    for (const item of items) {
      if (storeName === 'reminders') {
        const rem = item as unknown as Reminder;
        if (!rem.dedupeKey.startsWith('CUSTOM_') && !rem.dismissed) continue;
      }
      const docId = makeCloudDocId(storeName, item.id);
      const recRef = doc(db, 'farms', SHARED_FARM_ID, 'records', docId);
      const sanitizedData = sanitizeEntityForFirestore(item);

      try {
        let finalVer = 1;
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(recRef);
          if (!snap.exists()) {
            finalVer = Math.max(1, item.version || 1);
            tx.set(recRef, {
              docId,
              farmId: SHARED_FARM_ID,
              storeName,
              recordId: item.id,
              data: sanitizedData,
              version: finalVer,
              baseVersion: 0,
              isDeleted: Boolean(item.isDeleted),
              clientCreatedAt: Math.max(0, Math.floor(item.createdAt || Date.now())),
              clientUpdatedAt: Math.max(0, Math.floor(item.updatedAt || Date.now())),
              updatedBy: user.uid,
              updatedByEmail: adminEmail,
              authorizedEmails: targetRecordEmails,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else {
            const curVer = Number(snap.data().version || 1);
            finalVer = curVer + 1;
            tx.update(recRef, {
              data: sanitizedData,
              version: finalVer,
              baseVersion: curVer,
              isDeleted: Boolean(item.isDeleted),
              clientUpdatedAt: Math.max(0, Math.floor(item.updatedAt || Date.now())),
              updatedBy: user.uid,
              updatedByEmail: adminEmail,
              authorizedEmails: targetRecordEmails,
              updatedAt: serverTimestamp(),
            });
          }
        });
        await localDb.put(
          storeName,
          {
            ...item,
            farmId: SHARED_FARM_ID,
            version: finalVer,
            baseVersion: finalVer,
            syncStatus: SyncStatus.SYNCED,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any
        );
        count += 1;
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `farms/${SHARED_FARM_ID}/records/${docId}`);
      }
    }
  }

  return count;
}

// ============================================================================
// Optional Cloud Backup Vault (Separated from Live Two-Way Synchronization)
// ============================================================================

export async function createCloudBackupSnapshotAsAdmin(
  user: User,
  label: string
): Promise<CloudBackupMeta> {
  const adminEmail = (user.email || '').trim().toLowerCase();
  if (adminEmail !== BOOTSTRAPPED_ADMIN_EMAIL) {
    throw new Error('Only the Farm Administrator can create Cloud Backup snapshots.');
  }

  const localDb = await getDB();
  const snapshotData: Record<string, unknown[]> = {};
  let recordCount = 0;

  const settings = await localDb.get('farm_settings', 1);
  if (settings) {
    snapshotData.farm_settings = [
      sanitizeEntityForFirestore(settings as unknown as Record<string, unknown>, {
        stripPhotos: true,
      }),
    ];
    recordCount += 1;
  }

  for (const storeName of OPERATIONAL_STORE_NAMES) {
    const allItems = (await localDb.getAll(storeName)) as unknown as Array<Record<string, unknown>>;
    const cleanedItems = allItems.map((it) =>
      sanitizeEntityForFirestore(it, { stripPhotos: true })
    );
    snapshotData[storeName] = cleanedItems;
    recordCount += cleanedItems.length;
  }

  const checksumSha256 = await sha256Hex(JSON.stringify(snapshotData));
  const backupId = `cbkp_${Date.now()}`;
  const cleanLabel = (label.trim() || `Cloud Snapshot ${new Date().toLocaleDateString('en-IN')}`).slice(
    0,
    120
  );
  const path = `farms/${SHARED_FARM_ID}/backups/${backupId}`;

  try {
    await setDoc(doc(db, 'farms', SHARED_FARM_ID, 'backups', backupId), {
      backupId,
      farmId: SHARED_FARM_ID,
      label: cleanLabel,
      schemaVersion: 1,
      recordCount,
      checksumSha256,
      snapshotData,
      adminUid: user.uid,
      adminEmail,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }

  return {
    backupId,
    label: cleanLabel,
    schemaVersion: 1,
    recordCount,
    checksumSha256,
    adminEmail,
    createdAtMs: Date.now(),
  };
}

export async function listCloudBackupSnapshotsAsAdmin(user: User): Promise<CloudBackupMeta[]> {
  const adminEmail = (user.email || '').trim().toLowerCase();
  if (adminEmail !== BOOTSTRAPPED_ADMIN_EMAIL) return [];

  const path = `farms/${SHARED_FARM_ID}/backups`;
  try {
    const q = query(
      collection(db, 'farms', SHARED_FARM_ID, 'backups'),
      where('adminEmail', '==', BOOTSTRAPPED_ADMIN_EMAIL)
    );
    const snap = await getDocs(q);
    const list: CloudBackupMeta[] = snap.docs.map((d) => {
      const data = d.data();
      return {
        backupId: String(data.backupId),
        label: String(data.label || 'Cloud Snapshot'),
        schemaVersion: Number(data.schemaVersion || 1),
        recordCount: Number(data.recordCount || 0),
        checksumSha256: String(data.checksumSha256 || ''),
        adminEmail: String(data.adminEmail || adminEmail),
        createdAtMs: timestampToMs(data.createdAt),
      };
    });
    list.sort((a, b) => b.createdAtMs - a.createdAtMs);
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function restoreCloudBackupSnapshotAsAdmin(
  user: User,
  farmAccess: FarmAccessProfile,
  backupId: string
): Promise<{ restoredRecords: number }> {
  const adminEmail = (user.email || '').trim().toLowerCase();
  if (adminEmail !== BOOTSTRAPPED_ADMIN_EMAIL || user.uid !== farmAccess.adminUid) {
    throw new Error('Only the Farm Administrator can restore a Cloud Backup snapshot.');
  }

  const path = `farms/${SHARED_FARM_ID}/backups/${backupId}`;
  let snap;
  try {
    snap = await getDoc(doc(db, 'farms', SHARED_FARM_ID, 'backups', backupId));
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }

  if (!snap.exists()) {
    throw new Error('Selected Cloud Backup snapshot does not exist.');
  }

  const data = snap.data();
  const snapshotData = (data.snapshotData || {}) as Record<string, unknown[]>;
  const expectedChecksum = String(data.checksumSha256 || '');
  const computedChecksum = await sha256Hex(JSON.stringify(snapshotData));

  if (expectedChecksum && computedChecksum !== expectedChecksum) {
    throw new Error(
      'Cloud Backup SHA-256 integrity verification failed. Restoration aborted to protect farm data.'
    );
  }

  const localDb = await getDB();
  const currentPrefs = await localDb.get('app_preferences', 1);
  const fullPayload: Record<string, unknown[]> = {
    ...snapshotData,
    app_preferences: currentPrefs ? [currentPrefs] : [],
  };
  const envelopeChecksum = await sha256Hex(JSON.stringify(fullPayload));
  const envelope: DairyTrackBackupEnvelope = {
    app: 'DairyTrack',
    schemaVersion: 1,
    exportedAt: Date.now(),
    checksumSha256: envelopeChecksum,
    payload: fullPayload,
  };

  const res = await restoreFromLocalBackupJson(JSON.stringify(envelope));
  if (navigator.onLine) {
    await adminForcePushAllRestoredRecords(user, farmAccess);
  }
  return res;
}
