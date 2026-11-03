/**
 * Firestore Security Rules Verification Suite (Three-User DairyTrack RBAC)
 * Verifies Dirty Dozen adversarial attacks return PERMISSION_DENIED and valid role operations succeed.
 */
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import * as fs from 'fs';

const ADMIN_EMAIL = 'inamdarrizwan755@gmail.com';
const UNCLE_EMAIL = 'uncle.farm@gmail.com';
const WORKER_EMAIL = 'worker.dairy@gmail.com';

export async function runSecurityRulesAudit() {
  const testEnv: RulesTestEnvironment = await initializeTestEnvironment({
    projectId: 'dairytrack-rules-audit',
    firestore: {
      rules: fs.readFileSync('firestore.rules', 'utf8'),
    },
  });

  // 1. Unverified Admin Spoof -> DENIED
  const spoofAdmin = testEnv.authenticatedContext('uid_spoof', {
    email: ADMIN_EMAIL,
    email_verified: false,
  });
  await assertFails(
    setDoc(doc(spoofAdmin.firestore(), 'farms/primary_farm'), {
      farmId: 'primary_farm',
      farmName: 'Spoof Farm',
      adminUid: 'uid_spoof',
      adminEmail: ADMIN_EMAIL,
      memberEmail: '',
      memberUid: '',
      workerEmail: '',
      workerUid: '',
      workerActive: false,
      managerEmails: [ADMIN_EMAIL],
      authorizedEmails: [ADMIN_EMAIL],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );

  // Setup legitimate Admin & FarmAccess
  const adminCtx = testEnv.authenticatedContext('uid_admin', {
    email: ADMIN_EMAIL,
    email_verified: true,
  });
  await assertSucceeds(
    setDoc(doc(adminCtx.firestore(), 'farms/primary_farm'), {
      farmId: 'primary_farm',
      farmName: 'My Smart Dairy Farm',
      adminUid: 'uid_admin',
      adminEmail: ADMIN_EMAIL,
      memberEmail: UNCLE_EMAIL,
      memberUid: 'uid_uncle',
      workerEmail: WORKER_EMAIL,
      workerUid: 'uid_worker',
      workerActive: true,
      managerEmails: [ADMIN_EMAIL, UNCLE_EMAIL],
      authorizedEmails: [ADMIN_EMAIL, UNCLE_EMAIL, WORKER_EMAIL],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );

  // 2. Fourth Unauthorized Google Account -> DENIED
  const strangerCtx = testEnv.authenticatedContext('uid_stranger', {
    email: 'stranger@gmail.com',
    email_verified: true,
  });
  await assertFails(getDoc(doc(strangerCtx.firestore(), 'farms/primary_farm')));

  // 3. Uncle Privilege Escalation (Managing Worker/User Accounts) -> DENIED
  const uncleCtx = testEnv.authenticatedContext('uid_uncle', {
    email: UNCLE_EMAIL,
    email_verified: true,
  });
  await assertFails(
    updateDoc(doc(uncleCtx.firestore(), 'farms/primary_farm'), {
      workerActive: false,
      updatedAt: serverTimestamp(),
    })
  );

  // 4. Uncle Full Financial Access (Creating Income & Expense) -> SUCCEEDS
  await assertSucceeds(
    setDoc(doc(uncleCtx.firestore(), 'farms/primary_farm/records/income_records__inc1'), {
      docId: 'income_records__inc1',
      farmId: 'primary_farm',
      storeName: 'income_records',
      recordId: 'inc1',
      data: { id: 'inc1', amount: 15000, category: 'MILK_SALES', date: '2026-11-02' },
      version: 1,
      baseVersion: 0,
      isDeleted: false,
      clientCreatedAt: 1700000000000,
      clientUpdatedAt: 1700000000000,
      updatedBy: 'uid_uncle',
      updatedByEmail: UNCLE_EMAIL,
      authorizedEmails: [ADMIN_EMAIL, UNCLE_EMAIL],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );

  // 5. Worker Reading Financial Record -> DENIED
  const workerCtx = testEnv.authenticatedContext('uid_worker', {
    email: WORKER_EMAIL,
    email_verified: true,
  });
  await assertFails(
    getDoc(doc(workerCtx.firestore(), 'farms/primary_farm/records/income_records__inc1'))
  );

  // 6. Worker Creating Financial / Expense Record -> DENIED
  await assertFails(
    setDoc(doc(workerCtx.firestore(), 'farms/primary_farm/records/expense_records__exp1'), {
      docId: 'expense_records__exp1',
      farmId: 'primary_farm',
      storeName: 'expense_records',
      recordId: 'exp1',
      data: { id: 'exp1', amount: 500, category: 'FEED', date: '2026-11-02' },
      version: 1,
      baseVersion: 0,
      isDeleted: false,
      clientCreatedAt: 1700000000000,
      clientUpdatedAt: 1700000000000,
      updatedBy: 'uid_worker',
      updatedByEmail: WORKER_EMAIL,
      authorizedEmails: [ADMIN_EMAIL, UNCLE_EMAIL],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );

  // 7. Worker Submitting Combined Morning Milk -> SUCCEEDS
  await assertSucceeds(
    setDoc(doc(workerCtx.firestore(), 'farms/primary_farm/records/milk_records__m1'), {
      docId: 'milk_records__m1',
      farmId: 'primary_farm',
      storeName: 'milk_records',
      recordId: 'm1',
      data: { id: 'm1', animalId: 'FARM_COMBINED', session: 'MORNING', quantityLitres: 85.5, date: '2026-11-02' },
      version: 1,
      baseVersion: 0,
      isDeleted: false,
      clientCreatedAt: 1700000000000,
      clientUpdatedAt: 1700000000000,
      updatedBy: 'uid_worker',
      updatedByEmail: WORKER_EMAIL,
      authorizedEmails: [ADMIN_EMAIL, UNCLE_EMAIL, WORKER_EMAIL],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );

  // 8. Worker Attempting Soft-Deletion (isDeleted: true) -> DENIED
  await assertFails(
    updateDoc(doc(workerCtx.firestore(), 'farms/primary_farm/records/milk_records__m1'), {
      isDeleted: true,
      version: 2,
      baseVersion: 1,
      clientUpdatedAt: 1700000005000,
      updatedBy: 'uid_worker',
      updatedByEmail: WORKER_EMAIL,
      authorizedEmails: [ADMIN_EMAIL, UNCLE_EMAIL, WORKER_EMAIL],
      updatedAt: serverTimestamp(),
    })
  );

  // 9. Poisoning Financial Record with Worker Email in authorizedEmails -> DENIED
  await assertFails(
    setDoc(doc(uncleCtx.firestore(), 'farms/primary_farm/records/income_records__inc_leak'), {
      docId: 'income_records__inc_leak',
      farmId: 'primary_farm',
      storeName: 'income_records',
      recordId: 'inc_leak',
      data: { id: 'inc_leak', amount: 2000, category: 'OTHER', date: '2026-11-02' },
      version: 1,
      baseVersion: 0,
      isDeleted: false,
      clientCreatedAt: 1700000000000,
      clientUpdatedAt: 1700000000000,
      updatedBy: 'uid_uncle',
      updatedByEmail: UNCLE_EMAIL,
      authorizedEmails: [ADMIN_EMAIL, UNCLE_EMAIL, WORKER_EMAIL],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );

  // 10. Hard Delete on Any Document -> DENIED
  await assertFails(
    deleteDoc(doc(adminCtx.firestore(), 'farms/primary_farm/records/milk_records__m1'))
  );

  await testEnv.cleanup();
}
