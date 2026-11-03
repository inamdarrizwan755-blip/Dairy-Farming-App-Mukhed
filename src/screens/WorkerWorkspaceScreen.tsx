import {
  Baby,
  CheckCircle2,
  Clock,
  Heart,
  Moon,
  Plus,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sun,
  Trash2,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { QrScannerModal } from '../components/QrModalAndScanner';
import { useFarm } from '../context/FarmContext';
import { CalfDraft } from '../data/db';
import {
  BUFFALO_BREEDS,
  calculateExpectedPregnancyFollowUpDate,
  COW_BREEDS,
  formatIndianDate,
  getCurrentTimeHm,
  getTodayIso,
  isCombinedMilkRecord,
} from '../domain/calculations';
import {
  AnimalStatus,
  Gender,
  MilkSession,
  Species,
  SyncStatus,
} from '../types/models';

type WorkerTaskTab = 'morning_milk' | 'evening_milk' | 'ai_breeding' | 'calving';

export const WorkerWorkspaceScreen: React.FC = () => {
  const {
    settings,
    animals,
    milkRecords,
    breedingRecords,
    pregnancyRecords,
    calvingRecords,
    syncState,
    submitCombinedMilkSession,
    logBreedingAttempt,
    logCalvingWithCalves,
    triggerCloudSync,
    notify,
  } = useFarm();

  const today = getTodayIso();
  const defaultOperatorName =
    syncState.currentUser?.displayName ||
    syncState.currentUser?.email?.split('@')[0] ||
    'Farm Worker';

  const [activeTask, setActiveTask] = useState<WorkerTaskTab>('morning_milk');
  const [scannerTarget, setScannerTarget] = useState<'ai' | 'calving' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 1. Morning Milk State (Separate Dedicated Form)
  const [mDate, setMDate] = useState(today);
  const [mLitres, setMLitres] = useState('');
  const [mTime, setMTime] = useState(getCurrentTimeHm());
  const [mWorker, setMWorker] = useState(defaultOperatorName);
  const [mNotes, setMNotes] = useState('');

  // 2. Evening Milk State (Separate Dedicated Form)
  const [eDate, setEDate] = useState(today);
  const [eLitres, setELitres] = useState('');
  const [eTime, setETime] = useState(getCurrentTimeHm());
  const [eWorker, setEWorker] = useState(defaultOperatorName);
  const [eNotes, setENotes] = useState('');

  // 3. Semen Insertion / Artificial Insemination State
  const [aiAnimalId, setAiAnimalId] = useState('');
  const [aiDate, setAiDate] = useState(today);
  const [aiTime, setAiTime] = useState(getCurrentTimeHm());
  const [aiStrawId, setAiStrawId] = useState('');
  const [aiBreed, setAiBreed] = useState('');
  const [aiSource, setAiSource] = useState('');
  const [aiTechnician, setAiTechnician] = useState('');
  const [aiNotes, setAiNotes] = useState('');

  // 4. Delivery / Calving State
  const [cMotherId, setCMotherId] = useState('');
  const [cDate, setCDate] = useState(today);
  const [cTime, setCTime] = useState(getCurrentTimeHm());
  const [cDeliveryType, setCDeliveryType] = useState<'NORMAL' | 'COMPLICATED'>('NORMAL');
  const [cObservations, setCObservations] = useState('');
  const [calvesDraft, setCalvesDraft] = useState<CalfDraft[]>([
    { tagNumber: '', name: '', gender: Gender.FEMALE, birthWeightKg: undefined },
  ]);

  const animalMap = useMemo(() => new Map(animals.map((a) => [a.id, a])), [animals]);

  const eligibleFemales = useMemo(
    () =>
      animals
        .filter(
          (a) =>
            !a.isDeleted &&
            a.gender === Gender.FEMALE &&
            a.status !== AnimalStatus.SOLD &&
            a.status !== AnimalStatus.DECEASED
        )
        .sort((a, b) => a.tagNumber.localeCompare(b.tagNumber)),
    [animals]
  );

  const existingMorning = useMemo(
    () =>
      milkRecords.find(
        (r) =>
          !r.isDeleted &&
          r.date === mDate &&
          r.session === MilkSession.MORNING &&
          isCombinedMilkRecord(r)
      ),
    [mDate, milkRecords]
  );

  const existingEvening = useMemo(
    () =>
      milkRecords.find(
        (r) =>
          !r.isDeleted &&
          r.date === eDate &&
          r.session === MilkSession.EVENING &&
          isCombinedMilkRecord(r)
      ),
    [eDate, milkRecords]
  );

  const selectedAiAnimal = aiAnimalId ? animalMap.get(aiAnimalId) : undefined;
  const aiAttemptNumber = useMemo(() => {
    if (!aiAnimalId) return 1;
    return breedingRecords.filter((b) => !b.isDeleted && b.animalId === aiAnimalId).length + 1;
  }, [aiAnimalId, breedingRecords]);

  const expectedFollowUpIso = useMemo(
    () => calculateExpectedPregnancyFollowUpDate(aiDate),
    [aiDate]
  );

  const breedSuggestions = useMemo(() => {
    if (selectedAiAnimal?.species === Species.BUFFALO) return BUFFALO_BREEDS;
    if (selectedAiAnimal?.species === Species.COW) return COW_BREEDS;
    return [...COW_BREEDS, ...BUFFALO_BREEDS];
  }, [selectedAiAnimal?.species]);

  const handleMorningSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(mLitres);
    if (!qty || qty <= 0) {
      notify('Enter a valid Morning milk quantity in litres.', 'error');
      return;
    }
    try {
      setSubmitting(true);
      await submitCombinedMilkSession({
        date: mDate,
        session: MilkSession.MORNING,
        quantityLitres: qty,
        entryTime: mTime || getCurrentTimeHm(),
        workerName: mWorker.trim() || defaultOperatorName,
        notes: mNotes.trim() || undefined,
      });
      setMLitres('');
      setMNotes('');
      setMTime(getCurrentTimeHm());
      notify(`Morning milk (${qty} L) saved and queued for sync.`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save morning milk.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEveningSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(eLitres);
    if (!qty || qty <= 0) {
      notify('Enter a valid Evening milk quantity in litres.', 'error');
      return;
    }
    try {
      setSubmitting(true);
      await submitCombinedMilkSession({
        date: eDate,
        session: MilkSession.EVENING,
        quantityLitres: qty,
        entryTime: eTime || getCurrentTimeHm(),
        workerName: eWorker.trim() || defaultOperatorName,
        notes: eNotes.trim() || undefined,
      });
      setELitres('');
      setENotes('');
      setETime(getCurrentTimeHm());
      notify(`Evening milk (${qty} L) saved and queued for sync.`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save evening milk.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiAnimalId) {
      notify('Select or scan the female animal first.', 'error');
      return;
    }
    if (!aiStrawId.trim()) {
      notify('Enter the Semen Straw / Bull ID.', 'error');
      return;
    }
    try {
      setSubmitting(true);
      await logBreedingAttempt(
        {
          animalId: aiAnimalId,
          heatDate: aiDate,
          breedingDate: aiDate,
          breedingTime: aiTime || getCurrentTimeHm(),
          expectedPregnancyCheckDate: expectedFollowUpIso,
          method: 'AI',
          semenOrBullId: aiStrawId.trim(),
          sireBreed: aiBreed.trim() || undefined,
          semenSource: aiSource.trim() || undefined,
          technician: aiTechnician.trim() || undefined,
          attemptNumber: aiAttemptNumber,
          cost: 0,
          notes: aiNotes.trim() || undefined,
          heatNotes: aiNotes.trim() || undefined,
        },
        false
      );
      setAiStrawId('');
      setAiNotes('');
      setAiTime(getCurrentTimeHm());
      notify(
        `Saved Semen Insertion (Attempt #${aiAttemptNumber}). Follow-up check on ${formatIndianDate(expectedFollowUpIso)}.`,
        'success'
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save AI record.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCalvingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cMotherId) {
      notify('Select or scan the mother animal.', 'error');
      return;
    }
    const activePreg = pregnancyRecords.find(
      (p) => !p.isDeleted && p.animalId === cMotherId && p.status === 'CONFIRMED'
    );
    try {
      setSubmitting(true);
      await logCalvingWithCalves({
        motherId: cMotherId,
        pregnancyRecordId: activePreg?.id,
        breedingRecordId: activePreg?.breedingRecordId,
        calvingDate: cDate,
        calvingTime: cTime || getCurrentTimeHm(),
        deliveryType: cDeliveryType,
        complications:
          cDeliveryType === 'COMPLICATED'
            ? cObservations.trim() || 'Complicated / Assisted delivery'
            : undefined,
        observations: cObservations.trim() || undefined,
        calves: calvesDraft,
      });
      setCalvesDraft([{ tagNumber: '', name: '', gender: Gender.FEMALE, birthWeightKg: undefined }]);
      setCDeliveryType('NORMAL');
      setCObservations('');
      setCTime(getCurrentTimeHm());
      notify(
        'Delivery saved! Newborn calf registered and mother lactation started.',
        'success'
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save calving entry.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Recent non-financial entries visible to the Worker for sync transparency
  const recentEntries = useMemo(() => {
    const items: Array<{
      id: string;
      typeLabel: string;
      detail: string;
      dateIso: string;
      createdAt: number;
      syncStatus: SyncStatus;
      reviewStatus?: string;
    }> = [];

    for (const m of milkRecords) {
      if (m.isDeleted || !isCombinedMilkRecord(m)) continue;
      items.push({
        id: m.id,
        typeLabel: m.session === MilkSession.MORNING ? 'Morning Milk' : m.session === MilkSession.EVENING ? 'Evening Milk' : 'Afternoon Milk',
        detail: `${m.quantityLitres.toFixed(1)} L${m.entryTime ? ` · ${m.entryTime}` : ''}${m.workerName ? ` · ${m.workerName}` : ''}`,
        dateIso: m.date,
        createdAt: m.createdAt,
        syncStatus: m.syncStatus,
        reviewStatus: m.reviewStatus,
      });
    }

    for (const b of breedingRecords) {
      if (b.isDeleted) continue;
      const a = animalMap.get(b.animalId);
      items.push({
        id: b.id,
        typeLabel: 'Semen Insertion (AI)',
        detail: `${a ? `Tag #${a.tagNumber}` : 'Animal'} · Straw ${b.semenOrBullId} · Attempt #${b.attemptNumber}`,
        dateIso: b.breedingDate,
        createdAt: b.createdAt,
        syncStatus: b.syncStatus,
        reviewStatus: b.reviewStatus,
      });
    }

    for (const c of calvingRecords) {
      if (c.isDeleted) continue;
      const m = animalMap.get(c.motherId);
      items.push({
        id: c.id,
        typeLabel: 'Delivery / Calving',
        detail: `${m ? `Mother #${m.tagNumber}` : 'Mother'} · ${c.calfCount} calf (${c.deliveryType || 'NORMAL'})`,
        dateIso: c.calvingDate,
        createdAt: c.createdAt,
        syncStatus: c.syncStatus,
        reviewStatus: c.reviewStatus,
      });
    }

    return items.sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);
  }, [animalMap, breedingRecords, calvingRecords, milkRecords]);

  const formatRecordSyncLabel = (st: SyncStatus) => {
    if (st === SyncStatus.SYNCED) return { text: 'Synced', cls: 'text-[#1B4D3E]' };
    if (st === SyncStatus.ERROR) return { text: 'Error', cls: 'text-red-700' };
    return { text: 'Pending', cls: 'text-amber-800' };
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-10">
      {/* Worker Header Card */}
      <section className="rounded-2xl border border-stone-200/90 bg-white p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold text-[#1B4D3E]">
              {settings.farmName} · Daily Farm Entry Operator
            </p>
            <h1 className="mt-0.5 text-xl font-extrabold text-stone-900 sm:text-2xl">
              Welcome, {defaultOperatorName}
            </h1>
            <p className="mt-0.5 text-xs text-stone-600">
              Signed in as <span className="font-mono">{syncState.currentUser?.email}</span> · Works offline and syncs automatically
            </p>
          </div>

          <button
            type="button"
            onClick={() => void triggerCloudSync()}
            className="flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-xs font-semibold text-stone-800 hover:bg-stone-50"
          >
            <RefreshCw
              className={`h-4 w-4 text-[#1B4D3E] ${
                syncState.status === 'SYNCING' ? 'animate-spin' : ''
              }`}
            />
            Sync Entries Now
          </button>
        </div>

        {/* 4 Dedicated Task Mode Buttons */}
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <button
            type="button"
            onClick={() => setActiveTask('morning_milk')}
            className={`flex min-h-[64px] flex-col items-start justify-between rounded-xl border p-3 text-left transition-colors ${
              activeTask === 'morning_milk'
                ? 'border-[#1B4D3E] bg-[#1B4D3E] text-white'
                : 'border-stone-200 bg-stone-50/70 text-stone-800 hover:bg-stone-100'
            }`}
          >
            <Sun className="h-4 w-4" />
            <span className="text-xs font-bold leading-tight">1. Morning Milk</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTask('evening_milk')}
            className={`flex min-h-[64px] flex-col items-start justify-between rounded-xl border p-3 text-left transition-colors ${
              activeTask === 'evening_milk'
                ? 'border-[#1B4D3E] bg-[#1B4D3E] text-white'
                : 'border-stone-200 bg-stone-50/70 text-stone-800 hover:bg-stone-100'
            }`}
          >
            <Moon className="h-4 w-4" />
            <span className="text-xs font-bold leading-tight">2. Evening Milk</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTask('ai_breeding')}
            className={`flex min-h-[64px] flex-col items-start justify-between rounded-xl border p-3 text-left transition-colors ${
              activeTask === 'ai_breeding'
                ? 'border-[#1B4D3E] bg-[#1B4D3E] text-white'
                : 'border-stone-200 bg-stone-50/70 text-stone-800 hover:bg-stone-100'
            }`}
          >
            <Heart className="h-4 w-4" />
            <span className="text-xs font-bold leading-tight">3. Semen / AI</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTask('calving')}
            className={`flex min-h-[64px] flex-col items-start justify-between rounded-xl border p-3 text-left transition-colors ${
              activeTask === 'calving'
                ? 'border-[#1B4D3E] bg-[#1B4D3E] text-white'
                : 'border-stone-200 bg-stone-50/70 text-stone-800 hover:bg-stone-100'
            }`}
          >
            <Baby className="h-4 w-4" />
            <span className="text-xs font-bold leading-tight">4. Delivery / Calving</span>
          </button>
        </div>
      </section>

      {/* SCREEN 1: MORNING MILK COLLECTION */}
      {activeTask === 'morning_milk' && (
        <form
          onSubmit={handleMorningSubmit}
          className="rounded-2xl border border-stone-200/90 bg-white p-5 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <div className="flex items-center gap-2.5">
              <Sun className="h-5 w-5 text-[#1B4D3E]" />
              <div>
                <h2 className="text-base font-bold text-stone-900">
                  Morning Milk Collection (Whole Farm)
                </h2>
                <p className="text-xs text-stone-600">
                  Enter the combined total morning milk collected across the farm.
                </p>
              </div>
            </div>
            <span className="font-mono text-xs font-semibold text-stone-600 tabular-nums">
              {formatIndianDate(mDate)}
            </span>
          </div>

          {existingMorning && (
            <div className="rounded-xl border border-[#1B4D3E]/30 bg-[#1B4D3E]/5 p-4 text-xs text-stone-800">
              <div className="flex items-center gap-2 font-bold text-[#1B4D3E]">
                <CheckCircle2 className="h-4 w-4" />
                Morning Milk Already Recorded for {formatIndianDate(mDate)}
              </div>
              <p className="mt-1 font-mono tabular-nums">
                Submitted: <strong>{existingMorning.quantityLitres.toFixed(1)} L</strong>
                {existingMorning.entryTime ? ` at ${existingMorning.entryTime}` : ''} by{' '}
                {existingMorning.workerName || existingMorning.createdByEmail || 'Team'}
              </p>
              <p className="mt-1 text-stone-600">
                Duplicate entries are blocked to protect farm totals. Ask the Administrator or Uncle if an audited correction is required.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Collection Date *
              </label>
              <input
                type="date"
                required
                value={mDate}
                onChange={(e) => setMDate(e.target.value)}
                className="mt-1 min-h-[48px] w-full rounded-xl border border-stone-300 px-3.5 font-mono text-sm tabular-nums focus:border-[#1B4D3E] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">Entry Time *</label>
              <input
                type="time"
                required
                value={mTime}
                onChange={(e) => setMTime(e.target.value)}
                className="mt-1 min-h-[48px] w-full rounded-xl border border-stone-300 px-3.5 font-mono text-sm tabular-nums focus:border-[#1B4D3E] focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-stone-700">
                Total Morning Milk Quantity (Litres) *
              </label>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                min="0.1"
                max="5000"
                required
                disabled={!!existingMorning}
                value={mLitres}
                onChange={(e) => setMLitres(e.target.value)}
                placeholder="e.g. 68.5"
                className="mt-1 min-h-[54px] w-full rounded-xl border border-stone-300 px-4 font-mono text-lg font-bold text-stone-900 tabular-nums focus:border-[#1B4D3E] focus:outline-none disabled:bg-stone-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Worker / Operator Name
              </label>
              <input
                type="text"
                value={mWorker}
                onChange={(e) => setMWorker(e.target.value)}
                disabled={!!existingMorning}
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 text-sm focus:border-[#1B4D3E] focus:outline-none disabled:bg-stone-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Optional Notes
              </label>
              <input
                type="text"
                value={mNotes}
                onChange={(e) => setMNotes(e.target.value)}
                disabled={!!existingMorning}
                placeholder="Optional milking note..."
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 text-sm focus:border-[#1B4D3E] focus:outline-none disabled:bg-stone-100"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || !!existingMorning}
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#1B4D3E] text-sm font-bold text-white hover:bg-[#153D31] disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            {existingMorning
              ? 'Morning Milk Already Submitted'
              : submitting
              ? 'Saving Morning Milk...'
              : 'Save Morning Milk Collection'}
          </button>
        </form>
      )}

      {/* SCREEN 2: EVENING MILK COLLECTION */}
      {activeTask === 'evening_milk' && (
        <form
          onSubmit={handleEveningSubmit}
          className="rounded-2xl border border-stone-200/90 bg-white p-5 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <div className="flex items-center gap-2.5">
              <Moon className="h-5 w-5 text-[#1B4D3E]" />
              <div>
                <h2 className="text-base font-bold text-stone-900">
                  Evening Milk Collection (Whole Farm)
                </h2>
                <p className="text-xs text-stone-600">
                  Enter the combined total evening milk collected across the farm.
                </p>
              </div>
            </div>
            <span className="font-mono text-xs font-semibold text-stone-600 tabular-nums">
              {formatIndianDate(eDate)}
            </span>
          </div>

          {existingEvening && (
            <div className="rounded-xl border border-[#1B4D3E]/30 bg-[#1B4D3E]/5 p-4 text-xs text-stone-800">
              <div className="flex items-center gap-2 font-bold text-[#1B4D3E]">
                <CheckCircle2 className="h-4 w-4" />
                Evening Milk Already Recorded for {formatIndianDate(eDate)}
              </div>
              <p className="mt-1 font-mono tabular-nums">
                Submitted: <strong>{existingEvening.quantityLitres.toFixed(1)} L</strong>
                {existingEvening.entryTime ? ` at ${existingEvening.entryTime}` : ''} by{' '}
                {existingEvening.workerName || existingEvening.createdByEmail || 'Team'}
              </p>
              <p className="mt-1 text-stone-600">
                Duplicate entries are blocked to protect farm totals. Ask the Administrator or Uncle if an audited correction is required.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Collection Date *
              </label>
              <input
                type="date"
                required
                value={eDate}
                onChange={(e) => setEDate(e.target.value)}
                className="mt-1 min-h-[48px] w-full rounded-xl border border-stone-300 px-3.5 font-mono text-sm tabular-nums focus:border-[#1B4D3E] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">Entry Time *</label>
              <input
                type="time"
                required
                value={eTime}
                onChange={(e) => setETime(e.target.value)}
                className="mt-1 min-h-[48px] w-full rounded-xl border border-stone-300 px-3.5 font-mono text-sm tabular-nums focus:border-[#1B4D3E] focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-stone-700">
                Total Evening Milk Quantity (Litres) *
              </label>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                min="0.1"
                max="5000"
                required
                disabled={!!existingEvening}
                value={eLitres}
                onChange={(e) => setELitres(e.target.value)}
                placeholder="e.g. 54.0"
                className="mt-1 min-h-[54px] w-full rounded-xl border border-stone-300 px-4 font-mono text-lg font-bold text-stone-900 tabular-nums focus:border-[#1B4D3E] focus:outline-none disabled:bg-stone-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Worker / Operator Name
              </label>
              <input
                type="text"
                value={eWorker}
                onChange={(e) => setEWorker(e.target.value)}
                disabled={!!existingEvening}
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 text-sm focus:border-[#1B4D3E] focus:outline-none disabled:bg-stone-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Optional Notes
              </label>
              <input
                type="text"
                value={eNotes}
                onChange={(e) => setENotes(e.target.value)}
                disabled={!!existingEvening}
                placeholder="Optional milking note..."
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 text-sm focus:border-[#1B4D3E] focus:outline-none disabled:bg-stone-100"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || !!existingEvening}
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#1B4D3E] text-sm font-bold text-white hover:bg-[#153D31] disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            {existingEvening
              ? 'Evening Milk Already Submitted'
              : submitting
              ? 'Saving Evening Milk...'
              : 'Save Evening Milk Collection'}
          </button>
        </form>
      )}

      {/* SCREEN 3: SEMEN INSERTION / ARTIFICIAL INSEMINATION */}
      {activeTask === 'ai_breeding' && (
        <form
          onSubmit={handleAiSubmit}
          className="rounded-2xl border border-stone-200/90 bg-white p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-3">
            <div className="flex items-center gap-2.5">
              <Heart className="h-5 w-5 text-[#1B4D3E]" />
              <div>
                <h2 className="text-base font-bold text-stone-900">
                  Semen Insertion / Artificial Insemination
                </h2>
                <p className="text-xs text-stone-600">
                  Select or scan the female animal and record straw/bull insemination details.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setScannerTarget('ai')}
              className="flex min-h-[42px] items-center gap-1.5 rounded-xl border border-stone-300 bg-stone-50 px-3.5 text-xs font-semibold text-stone-800 hover:bg-stone-100"
            >
              <QrCode className="h-4 w-4 text-[#1B4D3E]" />
              Scan Animal QR
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-stone-700">
                Female Animal (Tag # & Name) *
              </label>
              <select
                required
                value={aiAnimalId}
                onChange={(e) => setAiAnimalId(e.target.value)}
                className="mt-1 min-h-[48px] w-full rounded-xl border border-stone-300 bg-white px-3.5 text-sm focus:border-[#1B4D3E] focus:outline-none"
              >
                <option value="">— Select Female Cow / Buffalo —</option>
                {eligibleFemales.map((a) => (
                  <option key={a.id} value={a.id}>
                    Tag #{a.tagNumber} {a.name ? `(${a.name})` : ''} · {a.species} · {a.status}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Insemination Date *
              </label>
              <input
                type="date"
                required
                value={aiDate}
                onChange={(e) => setAiDate(e.target.value)}
                className="mt-1 min-h-[48px] w-full rounded-xl border border-stone-300 px-3.5 font-mono text-sm tabular-nums focus:border-[#1B4D3E] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Insemination Time *
              </label>
              <input
                type="time"
                required
                value={aiTime}
                onChange={(e) => setAiTime(e.target.value)}
                className="mt-1 min-h-[48px] w-full rounded-xl border border-stone-300 px-3.5 font-mono text-sm tabular-nums focus:border-[#1B4D3E] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Semen Straw / Bull ID *
              </label>
              <input
                type="text"
                required
                value={aiStrawId}
                onChange={(e) => setAiStrawId(e.target.value)}
                placeholder="e.g. BAIF-HF-409"
                className="mt-1 min-h-[48px] w-full rounded-xl border border-stone-300 px-3.5 font-mono text-sm focus:border-[#1B4D3E] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">Sire Breed</label>
              <input
                type="text"
                list="worker-breed-suggestions"
                value={aiBreed}
                onChange={(e) => setAiBreed(e.target.value)}
                placeholder="e.g. HF / Gir / Murrah"
                className="mt-1 min-h-[48px] w-full rounded-xl border border-stone-300 px-3.5 text-sm focus:border-[#1B4D3E] focus:outline-none"
              />
              <datalist id="worker-breed-suggestions">
                {breedSuggestions.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">Semen Source</label>
              <input
                type="text"
                value={aiSource}
                onChange={(e) => setAiSource(e.target.value)}
                placeholder="e.g. NDDB / BAIF / SAG"
                className="mt-1 min-h-[48px] w-full rounded-xl border border-stone-300 px-3.5 text-sm focus:border-[#1B4D3E] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Technician Name
              </label>
              <input
                type="text"
                value={aiTechnician}
                onChange={(e) => setAiTechnician(e.target.value)}
                placeholder="AI Technician / Vet name"
                className="mt-1 min-h-[48px] w-full rounded-xl border border-stone-300 px-3.5 text-sm focus:border-[#1B4D3E] focus:outline-none"
              />
            </div>
          </div>

          {/* Automatic Attempt # & Pregnancy Check Schedule Readout */}
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3.5 text-xs">
            <div>
              <span className="text-stone-500">Attempt Number</span>
              <p className="mt-0.5 font-mono text-sm font-bold text-stone-900 tabular-nums">
                Attempt #{aiAttemptNumber}
              </p>
            </div>
            <div>
              <span className="text-stone-500">Expected Pregnancy Check (+21d)</span>
              <p className="mt-0.5 font-mono text-sm font-bold text-[#1B4D3E] tabular-nums">
                {formatIndianDate(expectedFollowUpIso)}
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700">
              Heat Signs & Notes (Optional)
            </label>
            <input
              type="text"
              value={aiNotes}
              onChange={(e) => setAiNotes(e.target.value)}
              placeholder="Standing heat, mucus discharge, technician remarks..."
              className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 text-sm focus:border-[#1B4D3E] focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#1B4D3E] text-sm font-bold text-white hover:bg-[#153D31] disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            {submitting ? 'Saving AI Record...' : 'Save Semen Insertion / AI Record'}
          </button>
        </form>
      )}

      {/* SCREEN 4: DELIVERY / CALVING */}
      {activeTask === 'calving' && (
        <form
          onSubmit={handleCalvingSubmit}
          className="rounded-2xl border border-stone-200/90 bg-white p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-3">
            <div className="flex items-center gap-2.5">
              <Baby className="h-5 w-5 text-[#1B4D3E]" />
              <div>
                <h2 className="text-base font-bold text-stone-900">
                  Delivery / Calving Registration
                </h2>
                <p className="text-xs text-stone-600">
                  Records calving, creates newborn calf record(s), and starts mother lactation.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setScannerTarget('calving')}
              className="flex min-h-[42px] items-center gap-1.5 rounded-xl border border-stone-300 bg-stone-50 px-3.5 text-xs font-semibold text-stone-800 hover:bg-stone-100"
            >
              <QrCode className="h-4 w-4 text-[#1B4D3E]" />
              Scan Mother QR
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-stone-700">
                Mother Animal (Dam) *
              </label>
              <select
                required
                value={cMotherId}
                onChange={(e) => setCMotherId(e.target.value)}
                className="mt-1 min-h-[48px] w-full rounded-xl border border-stone-300 bg-white px-3.5 text-sm focus:border-[#1B4D3E] focus:outline-none"
              >
                <option value="">— Select Mother Cow / Buffalo —</option>
                {eligibleFemales.map((a) => (
                  <option key={a.id} value={a.id}>
                    Tag #{a.tagNumber} {a.name ? `(${a.name})` : ''} · {a.species} · {a.status}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">Delivery Date *</label>
              <input
                type="date"
                required
                value={cDate}
                onChange={(e) => setCDate(e.target.value)}
                className="mt-1 min-h-[48px] w-full rounded-xl border border-stone-300 px-3.5 font-mono text-sm tabular-nums focus:border-[#1B4D3E] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">Delivery Time *</label>
              <input
                type="time"
                required
                value={cTime}
                onChange={(e) => setCTime(e.target.value)}
                className="mt-1 min-h-[48px] w-full rounded-xl border border-stone-300 px-3.5 font-mono text-sm tabular-nums focus:border-[#1B4D3E] focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-stone-700">Delivery Type *</label>
              <div className="mt-1 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setCDeliveryType('NORMAL')}
                  className={`min-h-[46px] rounded-xl border text-xs font-bold transition-colors ${
                    cDeliveryType === 'NORMAL'
                      ? 'border-[#1B4D3E] bg-[#1B4D3E] text-white'
                      : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  Normal Delivery
                </button>
                <button
                  type="button"
                  onClick={() => setCDeliveryType('COMPLICATED')}
                  className={`min-h-[46px] rounded-xl border text-xs font-bold transition-colors ${
                    cDeliveryType === 'COMPLICATED'
                      ? 'border-amber-800 bg-amber-800 text-white'
                      : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  Complicated / Assisted
                </button>
              </div>
            </div>
          </div>

          {/* Newborn Calf List */}
          <div className="space-y-3 border-t border-stone-100 pt-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-800">
                Newborn Calf Details ({calvesDraft.length}{' '}
                {calvesDraft.length === 1 ? 'Calf' : 'Calves'})
              </span>
              <button
                type="button"
                onClick={() =>
                  setCalvesDraft((prev) => [
                    ...prev,
                    { tagNumber: '', name: '', gender: Gender.FEMALE, birthWeightKg: undefined },
                  ])
                }
                className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-stone-200 px-3 text-xs font-semibold text-[#1B4D3E] hover:bg-stone-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Twin Calf
              </button>
            </div>

            {calvesDraft.map((calf, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-stone-200 bg-stone-50 p-3.5 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-800">Calf #{idx + 1}</span>
                  {calvesDraft.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setCalvesDraft((prev) => prev.filter((_, itemIdx) => itemIdx !== idx))
                      }
                      className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:underline"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-stone-600">
                      Calf Gender *
                    </label>
                    <select
                      value={calf.gender}
                      onChange={(e) =>
                        setCalvesDraft((prev) =>
                          prev.map((c, i) =>
                            i === idx ? { ...c, gender: e.target.value as Gender } : c
                          )
                        )
                      }
                      className="mt-1 min-h-[44px] w-full rounded-lg border border-stone-300 bg-white px-2.5 text-xs font-medium"
                    >
                      <option value={Gender.FEMALE}>Female Calf</option>
                      <option value={Gender.MALE}>Male Calf</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-stone-600">
                      Birth Weight (kg)
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.5"
                      min="1"
                      value={calf.birthWeightKg ?? ''}
                      onChange={(e) =>
                        setCalvesDraft((prev) =>
                          prev.map((c, i) =>
                            i === idx
                              ? {
                                  ...c,
                                  birthWeightKg: e.target.value
                                    ? Number(e.target.value)
                                    : undefined,
                                }
                              : c
                          )
                        )
                      }
                      placeholder="e.g. 28"
                      className="mt-1 min-h-[44px] w-full rounded-lg border border-stone-300 bg-white px-2.5 font-mono text-xs tabular-nums"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-stone-600">
                      Ear Tag # (Optional)
                    </label>
                    <input
                      type="text"
                      value={calf.tagNumber}
                      onChange={(e) =>
                        setCalvesDraft((prev) =>
                          prev.map((c, i) =>
                            i === idx ? { ...c, tagNumber: e.target.value } : c
                          )
                        )
                      }
                      placeholder="Auto-tag if blank"
                      className="mt-1 min-h-[44px] w-full rounded-lg border border-stone-300 bg-white px-2.5 font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-stone-600">
                      Calf Name (Optional)
                    </label>
                    <input
                      type="text"
                      value={calf.name || ''}
                      onChange={(e) =>
                        setCalvesDraft((prev) =>
                          prev.map((c, i) => (i === idx ? { ...c, name: e.target.value } : c))
                        )
                      }
                      placeholder="Optional"
                      className="mt-1 min-h-[44px] w-full rounded-lg border border-stone-300 bg-white px-2.5 text-xs"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700">
              Observations / Colostrum Feeding Notes
            </label>
            <input
              type="text"
              value={cObservations}
              onChange={(e) => setCObservations(e.target.value)}
              placeholder="Colostrum fed time, placenta status, calf health..."
              className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 text-sm focus:border-[#1B4D3E] focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#1B4D3E] text-sm font-bold text-white hover:bg-[#153D31] disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            {submitting ? 'Saving Calving Entry...' : 'Complete Calving & Register Calf'}
          </button>
        </form>
      )}

      {/* Recent Submitted Entries & Sync Queue (Strictly Non-Financial) */}
      <section className="rounded-2xl border border-stone-200/90 bg-white p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#1B4D3E]" />
            <h2 className="text-base font-bold text-stone-900">
              Recent Farm Entries & Sync Status
            </h2>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-stone-500">
            <ShieldCheck className="h-3.5 w-3.5 text-[#1B4D3E]" />
            Protected Ledger
          </span>
        </div>

        {recentEntries.length === 0 ? (
          <p className="mt-4 text-sm text-stone-500">
            No milk, AI, or calving entries recorded yet today.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-stone-100">
            {recentEntries.map((item) => {
              const syncBadge = formatRecordSyncLabel(item.syncStatus);
              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs"
                >
                  <div>
                    <p className="font-bold text-stone-900">
                      {item.typeLabel} ·{' '}
                      <span className="font-mono font-semibold text-stone-600 tabular-nums">
                        {formatIndianDate(item.dateIso)}
                      </span>
                    </p>
                    <p className="mt-0.5 font-mono text-stone-700 tabular-nums">{item.detail}</p>
                  </div>
                  <div className="text-right">
                    <span className={`font-semibold ${syncBadge.cls}`}>{syncBadge.text}</span>
                    {item.reviewStatus && (
                      <span className="text-stone-500">
                        {' '}
                        · {item.reviewStatus.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Camera QR Scanner Modal for AI & Calving Animal Selection */}
      {scannerTarget && (
        <QrScannerModal
          onClose={() => setScannerTarget(null)}
          onFoundAnimal={(foundId) => {
            const found = animalMap.get(foundId);
            setScannerTarget(null);
            if (!found || found.gender !== Gender.FEMALE) {
              notify('Scanned animal is not an active female cow or buffalo.', 'error');
              return;
            }
            if (scannerTarget === 'ai') {
              setAiAnimalId(found.id);
            } else {
              setCMotherId(found.id);
            }
            notify(`Selected Tag #${found.tagNumber}${found.name ? ` (${found.name})` : ''}`, 'success');
          }}
        />
      )}
    </div>
  );
};
