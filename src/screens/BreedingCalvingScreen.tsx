import { ArrowLeft, CheckCircle2, Edit3, Heart, Plus, Scale, X } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useFarm } from '../context/FarmContext';
import { CalfDraft } from '../data/db';
import {
  calculateAge,
  calculateExpectedCalving,
  calculateExpectedPregnancyFollowUpDate,
  calculateWeightGrowth,
  computeLactationMetrics,
  formatDateTimeIndian,
  formatIndianDate,
  formatINR,
  getCurrentTimeHm,
  getTodayIso,
} from '../domain/calculations';
import {
  AnimalStatus,
  BreedingRecord,
  CalvingRecord,
  Gender,
} from '../types/models';

export const BreedingCalvingScreen: React.FC<{
  initialTab?: 'breeding' | 'pregnancy' | 'calving' | 'calves' | 'weight-lactation';
}> = ({ initialTab = 'breeding' }) => {
  const {
    animals,
    settings,
    milkRecords,
    breedingRecords,
    pregnancyRecords,
    calvingRecords,
    weightRecords,
    lactationRecords,
    canReviewWorkerEntries,
    logBreedingAttempt,
    logPregnancyCheck,
    logCalvingWithCalves,
    logWeightRecord,
    upsertLactationCycle,
    applyAuditedCorrection,
    markWorkerEntryVerified,
    navigate,
    notify,
  } = useFarm();

  const [tab, setTab] = useState<
    'breeding' | 'pregnancy' | 'calving' | 'calves' | 'weight-lactation'
  >(initialTab);
  const today = getTodayIso();
  const animalMap = useMemo(() => new Map(animals.map((a) => [a.id, a])), [animals]);
  const femaleAnimals = useMemo(
    () =>
      animals.filter(
        (a) =>
          a.gender === Gender.FEMALE &&
          a.status !== AnimalStatus.SOLD &&
          a.status !== AnimalStatus.DECEASED
      ),
    [animals]
  );

  // 1. Breeding / AI Form
  const [bAnimalId, setBAnimalId] = useState('');
  const [heatDate, setHeatDate] = useState(today);
  const [heatNotes, setHeatNotes] = useState('');
  const [bDate, setBDate] = useState(today);
  const [bTime, setBTime] = useState(getCurrentTimeHm());
  const [bMethod, setBMethod] = useState<'AI' | 'NATURAL'>('AI');
  const [semenBullId, setSemenBullId] = useState('');
  const [sireBreed, setSireBreed] = useState('');
  const [semenSource, setSemenSource] = useState('');
  const [technician, setTechnician] = useState('');
  const [bCost, setBCost] = useState('0');

  // 2. Pregnancy Check Form
  const [pAnimalId, setPAnimalId] = useState('');
  const [pBreedingId, setPBreedingId] = useState('');
  const [pConfirmDate, setPConfirmDate] = useState(today);
  const [pStatus, setPStatus] = useState<'CONFIRMED' | 'SUSPECTED' | 'NEGATIVE' | 'LOST'>(
    'CONFIRMED'
  );
  const [pExpectedOverride, setPExpectedOverride] = useState('');
  const [pNotes, setPNotes] = useState('');

  // 3. Calving Wizard Form
  const [cMotherId, setCMotherId] = useState('');
  const [cPregnancyId, setCPregnancyId] = useState('');
  const [cDate, setCDate] = useState(today);
  const [cTime, setCTime] = useState(getCurrentTimeHm());
  const [cDeliveryType, setCDeliveryType] = useState<'NORMAL' | 'COMPLICATED'>('NORMAL');
  const [cComplications, setCComplications] = useState('');
  const [cObservations, setCObservations] = useState('');
  const [calvesDraft, setCalvesDraft] = useState<CalfDraft[]>([
    { tagNumber: '', name: '', gender: Gender.FEMALE, birthWeightKg: undefined },
  ]);

  // 4. Weight & Lactation Form
  const [wAnimalId, setWAnimalId] = useState('');
  const [wDate, setWDate] = useState(today);
  const [wKg, setWKg] = useState('');
  const [lAnimalId, setLAnimalId] = useState('');
  const [lNumber, setLNumber] = useState('1');
  const [lStart, setLStart] = useState(today);
  const [lDryDate, setLDryDate] = useState('');
  const [lStatus, setLStatus] = useState<'ACTIVE' | 'DRY_PERIOD' | 'COMPLETED'>('ACTIVE');

  // Audited Correction Modal State (Breeding & Calving)
  const [correctingBreeding, setCorrectingBreeding] = useState<BreedingRecord | null>(null);
  const [cbStraw, setCbStraw] = useState('');
  const [cbTech, setCbTech] = useState('');
  const [cbDate, setCbDate] = useState('');
  const [cbReason, setCbReason] = useState('');

  const [correctingCalving, setCorrectingCalving] = useState<CalvingRecord | null>(null);
  const [ccDeliveryType, setCcDeliveryType] = useState<'NORMAL' | 'COMPLICATED'>('NORMAL');
  const [ccObs, setCcObs] = useState('');
  const [ccReason, setCcReason] = useState('');

  // Auto-computed expected pregnancy follow-up (+21d) & calving preview
  const expectedPdFollowUp = useMemo(
    () => calculateExpectedPregnancyFollowUpDate(bDate),
    [bDate]
  );

  const computedCalvingPreview = useMemo(() => {
    const animal = animalMap.get(pAnimalId);
    const br = breedingRecords.find((b) => b.id === pBreedingId);
    if (!animal || !br) return null;
    return calculateExpectedCalving(br.breedingDate, animal.species, settings);
  }, [pAnimalId, pBreedingId, animalMap, breedingRecords, settings]);

  const handleSaveBreeding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bAnimalId || !semenBullId.trim()) {
      notify('Select a female animal and enter Semen Straw / Bull ID.', 'error');
      return;
    }
    if (bDate < heatDate) {
      notify('Breeding/AI date cannot precede heat observation date.', 'error');
      return;
    }
    const prevAttempts = breedingRecords.filter((b) => b.animalId === bAnimalId).length;
    await logBreedingAttempt(
      {
        animalId: bAnimalId,
        heatDate,
        heatNotes: heatNotes.trim() || undefined,
        breedingDate: bDate,
        breedingTime: bTime || getCurrentTimeHm(),
        expectedPregnancyCheckDate: expectedPdFollowUp,
        method: bMethod,
        semenOrBullId: semenBullId.trim(),
        sireBreed: sireBreed.trim() || undefined,
        semenSource: semenSource.trim() || undefined,
        technician: technician.trim() || undefined,
        attemptNumber: prevAttempts + 1,
        cost: Number(bCost) || 0,
      },
      true
    );
    setSemenBullId('');
    setHeatNotes('');
    setBCost('0');
    notify(`Saved breeding attempt #${prevAttempts + 1}.`);
  };

  const handleSavePregnancy = async (e: React.FormEvent) => {
    e.preventDefault();
    const animal = animalMap.get(pAnimalId);
    const br = breedingRecords.find((b) => b.id === pBreedingId);
    if (!animal || !br) {
      notify('Select an animal and its linked breeding record.', 'error');
      return;
    }
    if (pConfirmDate < br.breedingDate) {
      notify('Pregnancy confirmation date cannot precede breeding date.', 'error');
      return;
    }
    const calc = calculateExpectedCalving(br.breedingDate, animal.species, settings);
    const expectedCalvingDate = pExpectedOverride || calc.expectedCalvingDate;
    if (expectedCalvingDate < br.breedingDate) {
      notify('Expected calving date cannot precede breeding date.', 'error');
      return;
    }

    await logPregnancyCheck(
      {
        animalId: pAnimalId,
        breedingRecordId: pBreedingId,
        confirmationDate: pConfirmDate,
        status: pStatus,
        gestationDaysUsed: calc.gestationDays,
        expectedCalvingDate,
        expectedDryOffDate: calc.expectedDryOffDate,
        notes: pNotes.trim() || undefined,
      },
      true
    );
    setPNotes('');
    setPExpectedOverride('');
    notify(
      pStatus === 'CONFIRMED'
        ? `Confirmed pregnancy! Expected calving: ${formatIndianDate(expectedCalvingDate)}`
        : 'Recorded pregnancy check result.'
    );
  };

  const handleSaveCalving = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cMotherId) {
      notify('Select the mother animal.', 'error');
      return;
    }
    const linkedPreg = pregnancyRecords.find((p) => p.id === cPregnancyId);
    try {
      await logCalvingWithCalves({
        motherId: cMotherId,
        pregnancyRecordId: cPregnancyId || undefined,
        breedingRecordId: linkedPreg?.breedingRecordId,
        calvingDate: cDate,
        calvingTime: cTime || getCurrentTimeHm(),
        deliveryType: cDeliveryType,
        complications:
          cComplications.trim() ||
          (cDeliveryType === 'COMPLICATED' ? 'Complicated / Assisted' : undefined),
        observations: cObservations,
        calves: calvesDraft,
      });
      setCalvesDraft([{ tagNumber: '', name: '', gender: Gender.FEMALE }]);
      setCComplications('');
      setCObservations('');
      setTab('calves');
      notify('Recorded calving, registered calf record(s), and started dam lactation cycle.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Calving transaction failed.', 'error');
    }
  };

  const handleSaveWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    const kg = Number(wKg);
    if (!wAnimalId || !kg || kg <= 0) {
      notify('Select an animal and enter a valid positive weight in kg.', 'error');
      return;
    }
    await logWeightRecord({
      animalId: wAnimalId,
      date: wDate,
      weightKg: kg,
    });
    setWKg('');
    notify(`Logged ${kg} kg weight measurement.`);
  };

  const handleSaveLactation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lAnimalId) {
      notify('Select an animal.', 'error');
      return;
    }
    await upsertLactationCycle({
      animalId: lAnimalId,
      lactationNumber: Math.max(1, Number(lNumber) || 1),
      startDate: lStart,
      dryOffDate: lDryDate || undefined,
      status: lStatus,
    });
    notify('Saved lactation / dry cycle record.');
  };

  const handleSaveBreedingCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctingBreeding) return;
    try {
      await applyAuditedCorrection({
        storeName: 'breeding_records',
        recordId: correctingBreeding.id,
        updates: {
          semenOrBullId: cbStraw.trim() || correctingBreeding.semenOrBullId,
          technician: cbTech.trim() || undefined,
          breedingDate: cbDate || correctingBreeding.breedingDate,
          expectedPregnancyCheckDate: calculateExpectedPregnancyFollowUpDate(
            cbDate || correctingBreeding.breedingDate
          ),
        },
        summary: `Straw ${correctingBreeding.semenOrBullId} → ${cbStraw.trim()}, Date → ${cbDate}`,
        reason: cbReason,
      });
      setCorrectingBreeding(null);
      notify('Saved audited correction to AI / Breeding record.', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Correction failed.', 'error');
    }
  };

  const handleSaveCalvingCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctingCalving) return;
    try {
      await applyAuditedCorrection({
        storeName: 'calving_records',
        recordId: correctingCalving.id,
        updates: {
          deliveryType: ccDeliveryType,
          observations: ccObs.trim() || undefined,
        },
        summary: `Delivery Type → ${ccDeliveryType}`,
        reason: ccReason,
      });
      setCorrectingCalving(null);
      notify('Saved audited correction to Calving record.', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Correction failed.', 'error');
    }
  };

  const calvesList = useMemo(
    () =>
      animals.filter(
        (a) => a.status === AnimalStatus.CALF || a.status === AnimalStatus.HEIFER || !!a.damId
      ),
    [animals]
  );

  const selectedAnimalGrowth = useMemo(() => {
    if (!wAnimalId) return null;
    return calculateWeightGrowth(weightRecords.filter((w) => w.animalId === wAnimalId));
  }, [wAnimalId, weightRecords]);

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate({ name: 'more' })}
            className="flex min-h-[42px] min-w-[42px] items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-extrabold text-stone-900">
              Breeding, Calving, Weight &amp; Lactation
            </h1>
            <p className="text-sm text-stone-600">
              Heat detection, AI attempts, gestation calculator, atomic calf registration, and growth/lactation cycles.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-stone-200 bg-white p-1">
          {(
            [
              { id: 'breeding', label: 'Heat & AI' },
              { id: 'pregnancy', label: 'Pregnancy' },
              { id: 'calving', label: 'Calving' },
              { id: 'calves', label: 'Calves' },
              { id: 'weight-lactation', label: 'Weight & Lactation' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`min-h-[38px] shrink-0 rounded-lg px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
                tab === item.id
                  ? 'bg-[#1B4D3E] text-white'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: HEAT & BREEDING */}
      {tab === 'breeding' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <form
            onSubmit={handleSaveBreeding}
            className="rounded-2xl border border-stone-200/90 bg-white p-5 space-y-4 lg:col-span-5"
          >
            <div className="flex items-center gap-2">
              <Heart className="h-4 w-4 text-[#1B4D3E]" />
              <h2 className="text-base font-bold text-stone-900">Log Heat &amp; AI / Breeding</h2>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">Female Animal *</label>
              <select
                required
                value={bAnimalId}
                onChange={(e) => setBAnimalId(e.target.value)}
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 bg-white px-3.5 text-sm"
              >
                <option value="">— Select Female —</option>
                {femaleAnimals.map((a) => (
                  <option key={a.id} value={a.id}>
                    Tag #{a.tagNumber} {a.name ? `(${a.name})` : ''} · {a.species}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700">Heat Date *</label>
                <input
                  type="date"
                  value={heatDate}
                  onChange={(e) => setHeatDate(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">
                  AI / Breeding Date *
                </label>
                <input
                  type="date"
                  value={bDate}
                  onChange={(e) => setBDate(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">AI Time</label>
                <input
                  type="time"
                  value={bTime}
                  onChange={(e) => setBTime(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Method</label>
                <select
                  value={bMethod}
                  onChange={(e) => setBMethod(e.target.value as 'AI' | 'NATURAL')}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 bg-white px-3 text-sm"
                >
                  <option value="AI">Artificial Insemination (AI)</option>
                  <option value="NATURAL">Natural Service</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">
                  Straw / Bull ID *
                </label>
                <input
                  type="text"
                  required
                  value={semenBullId}
                  onChange={(e) => setSemenBullId(e.target.value)}
                  placeholder="e.g. BAIF-HF-409"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Sire Breed</label>
                <input
                  type="text"
                  value={sireBreed}
                  onChange={(e) => setSireBreed(e.target.value)}
                  placeholder="e.g. Pure HF / Murrah"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Semen Source</label>
                <input
                  type="text"
                  value={semenSource}
                  onChange={(e) => setSemenSource(e.target.value)}
                  placeholder="e.g. NDDB / Sag / BAIF"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">AI Technician</label>
                <input
                  type="text"
                  value={technician}
                  onChange={(e) => setTechnician(e.target.value)}
                  placeholder="Technician name"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-stone-700">Cost (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={bCost}
                  onChange={(e) => setBCost(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
            </div>

            <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs text-stone-700">
              Auto-scheduled Pregnancy Follow-Up Check (+21d):{' '}
              <strong className="font-mono text-[#1B4D3E] tabular-nums">
                {formatIndianDate(expectedPdFollowUp)}
              </strong>
            </div>

            <input
              type="text"
              value={heatNotes}
              onChange={(e) => setHeatNotes(e.target.value)}
              placeholder="Heat signs (mucus discharge, bellowing, standing heat)..."
              className="min-h-[44px] w-full rounded-xl border border-stone-300 px-3.5 text-sm"
            />

            <button
              type="submit"
              className="min-h-[48px] w-full rounded-xl bg-[#1B4D3E] text-sm font-semibold text-white hover:bg-[#153D31]"
            >
              Record Breeding Attempt
            </button>
          </form>

          <div className="rounded-2xl border border-stone-200/90 bg-white p-5 lg:col-span-7">
            <h2 className="text-base font-bold text-stone-900">
              Historical Breeding Attempts ({breedingRecords.length})
            </h2>
            {breedingRecords.length === 0 ? (
              <p className="mt-6 text-sm text-stone-500">
                No heat or breeding attempts logged yet. Every attempt is preserved permanently.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-stone-100">
                {[...breedingRecords]
                  .sort((a, b) => b.breedingDate.localeCompare(a.breedingDate))
                  .map((b) => {
                    const a = animalMap.get(b.animalId);
                    return (
                      <li key={b.id} className="py-3.5 text-sm space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-stone-900">
                            {a ? `Tag #${a.tagNumber}` : 'Animal'} · Attempt #{b.attemptNumber} (
                            {b.method})
                          </span>
                          <span className="font-mono text-xs text-stone-600 tabular-nums">
                            {formatIndianDate(b.breedingDate)}
                            {b.breedingTime ? ` · ${b.breedingTime}` : ''}
                          </span>
                        </div>
                        <p className="text-xs text-stone-500">
                          Straw/Bull: {b.semenOrBullId}
                          {b.sireBreed ? ` (${b.sireBreed})` : ''}
                          {b.technician ? ` · Tech: ${b.technician}` : ''}
                          {b.cost > 0 ? ` · ${formatINR(b.cost)}` : ''}
                          {b.expectedPregnancyCheckDate
                            ? ` · PD Check: ${formatIndianDate(b.expectedPregnancyCheckDate)}`
                            : ''}
                        </p>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="text-stone-500">
                            By {b.createdByEmail || b.createdByName || 'Local'}
                            {b.createdByRole ? ` (${b.createdByRole})` : ''}
                            {b.reviewStatus ? ` · ${b.reviewStatus.replace(/_/g, ' ')}` : ''}
                          </span>
                          {canReviewWorkerEntries && (
                            <div className="flex items-center gap-1.5">
                              {b.reviewStatus === 'PENDING_REVIEW' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    markWorkerEntryVerified('breeding_records', b.id)
                                  }
                                  className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-[#1B4D3E]/30 px-2.5 text-xs font-semibold text-[#1B4D3E] hover:bg-[#1B4D3E]/10"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Verify
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setCorrectingBreeding(b);
                                  setCbStraw(b.semenOrBullId);
                                  setCbTech(b.technician || '');
                                  setCbDate(b.breedingDate);
                                  setCbReason('');
                                }}
                                className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-stone-300 px-2.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                              >
                                <Edit3 className="h-3 w-3" /> Correct
                              </button>
                            </div>
                          )}
                        </div>
                        {b.correctionHistory && b.correctionHistory.length > 0 && (
                          <div className="rounded-lg bg-stone-50 px-3 py-2 text-[11px] text-stone-600 font-mono tabular-nums">
                            {b.correctionHistory.map((ch, idx) => (
                              <div key={idx}>
                                Edited {formatDateTimeIndian(ch.timestamp)} by {ch.byEmail}:{' '}
                                {ch.summary} ({ch.reason})
                              </div>
                            ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: PREGNANCY TRACKING */}
      {tab === 'pregnancy' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <form
            onSubmit={handleSavePregnancy}
            className="rounded-2xl border border-stone-200/90 bg-white p-5 space-y-4 lg:col-span-5"
          >
            <h2 className="text-base font-bold text-stone-900">Record Pregnancy Check (PD)</h2>

            <div>
              <label className="block text-xs font-semibold text-stone-700">Animal *</label>
              <select
                required
                value={pAnimalId}
                onChange={(e) => {
                  const id = e.target.value;
                  setPAnimalId(id);
                  const latestBr = breedingRecords
                    .filter((b) => b.animalId === id)
                    .sort((a, b) => b.breedingDate.localeCompare(a.breedingDate))[0];
                  setPBreedingId(latestBr?.id || '');
                }}
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 bg-white px-3.5 text-sm"
              >
                <option value="">— Select Bred Female —</option>
                {femaleAnimals.map((a) => (
                  <option key={a.id} value={a.id}>
                    Tag #{a.tagNumber} {a.name ? `(${a.name})` : ''} · {a.species}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Linked Breeding Attempt *
              </label>
              <select
                required
                value={pBreedingId}
                onChange={(e) => setPBreedingId(e.target.value)}
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 bg-white px-3.5 text-sm"
              >
                <option value="">— Select Breeding Record —</option>
                {breedingRecords
                  .filter((b) => !pAnimalId || b.animalId === pAnimalId)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      Attempt #{b.attemptNumber} on {formatIndianDate(b.breedingDate)} (
                      {b.semenOrBullId})
                    </option>
                  ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700">PD Check Date *</label>
                <input
                  type="date"
                  value={pConfirmDate}
                  onChange={(e) => setPConfirmDate(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">PD Result</label>
                <select
                  value={pStatus}
                  onChange={(e) =>
                    setPStatus(
                      e.target.value as 'CONFIRMED' | 'SUSPECTED' | 'NEGATIVE' | 'LOST'
                    )
                  }
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 bg-white px-3 text-sm"
                >
                  <option value="CONFIRMED">Confirmed Pregnant</option>
                  <option value="SUSPECTED">Re-check Needed</option>
                  <option value="NEGATIVE">Negative (Empty)</option>
                  <option value="LOST">Pregnancy Lost</option>
                </select>
              </div>
            </div>

            {computedCalvingPreview && (
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-3.5 text-xs space-y-1">
                <p className="font-semibold text-[#1B4D3E]">
                  Auto-Calculated Expected Calving ({computedCalvingPreview.gestationDays} days):{' '}
                  <span className="font-mono font-bold tabular-nums">
                    {formatIndianDate(computedCalvingPreview.expectedCalvingDate)}
                  </span>
                </p>
                <p className="text-stone-600">
                  Recommended Dry-Off Date (60 days prior):{' '}
                  <span className="font-mono tabular-nums">
                    {formatIndianDate(computedCalvingPreview.expectedDryOffDate)}
                  </span>
                </p>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Override Expected Calving Date (Optional)
              </label>
              <input
                type="date"
                value={pExpectedOverride}
                onChange={(e) => setPExpectedOverride(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
              />
            </div>

            <button
              type="submit"
              className="min-h-[48px] w-full rounded-xl bg-[#1B4D3E] text-sm font-semibold text-white hover:bg-[#153D31]"
            >
              Save Pregnancy Record
            </button>
          </form>

          <div className="rounded-2xl border border-stone-200/90 bg-white p-5 lg:col-span-7">
            <h2 className="text-base font-bold text-stone-900">
              Active &amp; Historical Pregnancies ({pregnancyRecords.length})
            </h2>
            {pregnancyRecords.length === 0 ? (
              <p className="mt-6 text-sm text-stone-500">No pregnancy records recorded yet.</p>
            ) : (
              <ul className="mt-4 divide-y divide-stone-100">
                {[...pregnancyRecords]
                  .sort((a, b) => a.expectedCalvingDate.localeCompare(b.expectedCalvingDate))
                  .map((p) => {
                    const a = animalMap.get(p.animalId);
                    return (
                      <li key={p.id} className="flex items-center justify-between py-3 text-sm">
                        <div>
                          <p className="font-semibold text-stone-900">
                            {a ? `Tag #${a.tagNumber}` : 'Animal'} · {p.status}
                          </p>
                          <p className="font-mono text-xs text-stone-500 tabular-nums">
                            Checked {formatIndianDate(p.confirmationDate)} · Dry-off{' '}
                            {formatIndianDate(p.expectedDryOffDate)}
                          </p>
                        </div>
                        <div className="text-right font-mono text-xs tabular-nums">
                          <p className="font-bold text-[#1B4D3E]">
                            Calving {formatIndianDate(p.expectedCalvingDate)}
                          </p>
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: ATOMIC CALVING WIZARD */}
      {tab === 'calving' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <form
            onSubmit={handleSaveCalving}
            className="rounded-2xl border border-stone-200/90 bg-white p-5 space-y-4 lg:col-span-6"
          >
            <h2 className="text-base font-bold text-stone-900">
              Record Calving &amp; Register Newborn Calf
            </h2>
            <p className="text-xs text-stone-500">
              Saves the calving event, creates real Calf animal record(s) linked to the mother, transitions the mother to LACTATING, and starts a new lactation cycle in one database transaction.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-stone-700">Mother (Dam) *</label>
                <select
                  required
                  value={cMotherId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setCMotherId(id);
                    const activePreg = pregnancyRecords.find(
                      (p) => p.animalId === id && p.status === 'CONFIRMED'
                    );
                    setCPregnancyId(activePreg?.id || '');
                  }}
                  className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 bg-white px-3.5 text-sm"
                >
                  <option value="">— Select Mother —</option>
                  {femaleAnimals.map((a) => (
                    <option key={a.id} value={a.id}>
                      Tag #{a.tagNumber} {a.name ? `(${a.name})` : ''} · {a.status}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700">Calving Date *</label>
                <input
                  type="date"
                  value={cDate}
                  onChange={(e) => setCDate(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700">Delivery Time</label>
                <input
                  type="time"
                  value={cTime}
                  onChange={(e) => setCTime(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700">Delivery Type</label>
                <select
                  value={cDeliveryType}
                  onChange={(e) =>
                    setCDeliveryType(e.target.value as 'NORMAL' | 'COMPLICATED')
                  }
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 bg-white px-3 text-sm"
                >
                  <option value="NORMAL">Normal Delivery</option>
                  <option value="COMPLICATED">Complicated / Assisted</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700">Complications</label>
                <input
                  type="text"
                  value={cComplications}
                  onChange={(e) => setCComplications(e.target.value)}
                  placeholder="Optional assistance notes"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 text-sm"
                />
              </div>
            </div>

            <div className="space-y-3 border-t border-stone-100 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-800">
                  Newborn Calf Details ({calvesDraft.length})
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setCalvesDraft((prev) => [
                      ...prev,
                      { tagNumber: '', name: '', gender: Gender.FEMALE },
                    ])
                  }
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#1B4D3E] hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Twin Calf
                </button>
              </div>

              {calvesDraft.map((calf, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-2 gap-2.5 rounded-xl border border-stone-200 bg-stone-50 p-3 sm:grid-cols-4"
                >
                  <div>
                    <label className="block text-[11px] font-semibold text-stone-600">
                      Calf Tag #
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
                      placeholder="Auto if blank"
                      className="mt-1 min-h-[40px] w-full rounded-lg border border-stone-300 bg-white px-2.5 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-stone-600">Gender</label>
                    <select
                      value={calf.gender}
                      onChange={(e) =>
                        setCalvesDraft((prev) =>
                          prev.map((c, i) =>
                            i === idx ? { ...c, gender: e.target.value as Gender } : c
                          )
                        )
                      }
                      className="mt-1 min-h-[40px] w-full rounded-lg border border-stone-300 bg-white px-2 text-xs"
                    >
                      <option value={Gender.FEMALE}>Female</option>
                      <option value={Gender.MALE}>Male</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-stone-600">Name</label>
                    <input
                      type="text"
                      value={calf.name || ''}
                      onChange={(e) =>
                        setCalvesDraft((prev) =>
                          prev.map((c, i) => (i === idx ? { ...c, name: e.target.value } : c))
                        )
                      }
                      placeholder="Optional"
                      className="mt-1 min-h-[40px] w-full rounded-lg border border-stone-300 bg-white px-2.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-stone-600">
                      Birth Wt (kg)
                    </label>
                    <input
                      type="number"
                      step="0.5"
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
                      placeholder="28"
                      className="mt-1 min-h-[40px] w-full rounded-lg border border-stone-300 bg-white px-2.5 font-mono text-xs"
                    />
                  </div>
                </div>
              ))}
            </div>

            <input
              type="text"
              value={cObservations}
              onChange={(e) => setCObservations(e.target.value)}
              placeholder="Colostrum feeding time & calving observations..."
              className="min-h-[44px] w-full rounded-xl border border-stone-300 px-3.5 text-sm"
            />

            <button
              type="submit"
              className="min-h-[48px] w-full rounded-xl bg-[#1B4D3E] text-sm font-semibold text-white hover:bg-[#153D31]"
            >
              Complete Calving &amp; Register Calf
            </button>
          </form>

          <div className="rounded-2xl border border-stone-200/90 bg-white p-5 lg:col-span-6">
            <h2 className="text-base font-bold text-stone-900">
              Calving History ({calvingRecords.length})
            </h2>
            {calvingRecords.length === 0 ? (
              <p className="mt-6 text-sm text-stone-500">No calving events recorded yet.</p>
            ) : (
              <ul className="mt-4 divide-y divide-stone-100">
                {[...calvingRecords]
                  .sort((a, b) => b.calvingDate.localeCompare(a.calvingDate))
                  .map((c) => {
                    const dam = animalMap.get(c.motherId);
                    return (
                      <li key={c.id} className="py-3.5 text-sm space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-stone-900">
                            Mother: {dam ? `Tag #${dam.tagNumber}` : 'Animal'} · {c.calfCount}{' '}
                            calf/calves ({c.deliveryType || 'NORMAL'})
                          </span>
                          <span className="font-mono text-xs text-stone-600 tabular-nums">
                            {formatIndianDate(c.calvingDate)}
                            {c.calvingTime ? ` · ${c.calvingTime}` : ''}
                          </span>
                        </div>
                        {(c.complications || c.observations) && (
                          <p className="text-xs text-stone-600">
                            {c.complications || c.observations}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="text-stone-500">
                            By {c.createdByEmail || c.createdByName || 'Local'}
                            {c.createdByRole ? ` (${c.createdByRole})` : ''}
                            {c.reviewStatus ? ` · ${c.reviewStatus.replace(/_/g, ' ')}` : ''}
                          </span>
                          {canReviewWorkerEntries && (
                            <div className="flex items-center gap-1.5">
                              {c.reviewStatus === 'PENDING_REVIEW' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    markWorkerEntryVerified('calving_records', c.id)
                                  }
                                  className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-[#1B4D3E]/30 px-2.5 text-xs font-semibold text-[#1B4D3E] hover:bg-[#1B4D3E]/10"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Verify
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setCorrectingCalving(c);
                                  setCcDeliveryType(c.deliveryType || 'NORMAL');
                                  setCcObs(c.observations || c.complications || '');
                                  setCcReason('');
                                }}
                                className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-stone-300 px-2.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                              >
                                <Edit3 className="h-3 w-3" /> Correct
                              </button>
                            </div>
                          )}
                        </div>
                        {c.correctionHistory && c.correctionHistory.length > 0 && (
                          <div className="rounded-lg bg-stone-50 px-3 py-2 text-[11px] text-stone-600 font-mono tabular-nums">
                            {c.correctionHistory.map((ch, idx) => (
                              <div key={idx}>
                                Edited {formatDateTimeIndian(ch.timestamp)} by {ch.byEmail}:{' '}
                                {ch.summary} ({ch.reason})
                              </div>
                            ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: CALVES REGISTER */}
      {tab === 'calves' && (
        <div className="rounded-2xl border border-stone-200/90 bg-white p-5">
          <h2 className="text-base font-bold text-stone-900">
            Calves &amp; Youngstock Register ({calvesList.length})
          </h2>
          {calvesList.length === 0 ? (
            <p className="mt-4 text-sm text-stone-500">
              No calves or youngstock registered yet. Calves recorded during calving appear here automatically as full animal records.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-stone-100">
              {calvesList.map((c) => {
                const mother = c.damId ? animalMap.get(c.damId) : undefined;
                return (
                  <li key={c.id} className="flex items-center justify-between py-3.5 text-sm">
                    <div>
                      <p className="font-mono font-bold text-stone-900">
                        Tag #{c.tagNumber} {c.name ? `(${c.name})` : ''}
                      </p>
                      <p className="text-xs text-stone-500">
                        {c.status} · {c.gender} · Age {calculateAge(c.dateOfBirth)}
                        {mother ? ` · Dam #${mother.tagNumber}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate({ name: 'animal-profile', animalId: c.id })}
                      className="min-h-[38px] rounded-xl border border-stone-300 px-3.5 text-xs font-semibold text-stone-800 hover:bg-stone-50"
                    >
                      Review Profile
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* TAB 5: WEIGHT & LACTATION */}
      {tab === 'weight-lactation' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Weight Tracker */}
          <div className="rounded-2xl border border-stone-200/90 bg-white p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-[#1B4D3E]" />
              <h2 className="text-base font-bold text-stone-900">Weight &amp; Growth Tracker</h2>
            </div>

            <form onSubmit={handleSaveWeight} className="grid grid-cols-3 gap-2.5">
              <select
                required
                value={wAnimalId}
                onChange={(e) => setWAnimalId(e.target.value)}
                className="col-span-3 min-h-[44px] rounded-xl border border-stone-300 bg-white px-3 text-sm"
              >
                <option value="">— Select Animal to View/Log Weight —</option>
                {animals.map((a) => (
                  <option key={a.id} value={a.id}>
                    Tag #{a.tagNumber} {a.name ? `(${a.name})` : ''} · {a.status}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={wDate}
                onChange={(e) => setWDate(e.target.value)}
                className="min-h-[44px] rounded-xl border border-stone-300 px-2.5 font-mono text-xs"
              />
              <input
                type="number"
                step="0.5"
                min="1"
                required
                value={wKg}
                onChange={(e) => setWKg(e.target.value)}
                placeholder="Weight kg"
                className="min-h-[44px] rounded-xl border border-stone-300 px-2.5 font-mono text-sm"
              />
              <button
                type="submit"
                className="min-h-[44px] rounded-xl bg-[#1B4D3E] text-xs font-semibold text-white hover:bg-[#153D31]"
              >
                Save kg
              </button>
            </form>

            {selectedAnimalGrowth && selectedAnimalGrowth.sorted.length > 0 ? (
              <div className="space-y-3 border-t border-stone-100 pt-3">
                <p className="font-mono text-xs text-stone-600 tabular-nums">
                  Latest: <strong>{selectedAnimalGrowth.latestKg} kg</strong>
                  {selectedAnimalGrowth.gainKg !== null &&
                    ` · Gain: ${selectedAnimalGrowth.gainKg} kg`}
                  {selectedAnimalGrowth.adgGramsPerDay !== null &&
                    ` (${selectedAnimalGrowth.adgGramsPerDay} g/day)`}
                </p>
                <ul className="divide-y divide-stone-100 font-mono text-xs tabular-nums">
                  {[...selectedAnimalGrowth.sorted].reverse().map((w) => (
                    <li key={w.id} className="flex justify-between py-2">
                      <span>{formatIndianDate(w.date)}</span>
                      <span className="font-bold text-stone-900">{w.weightKg} kg</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-stone-500">
                Select an animal above to inspect its dated weight history and average daily gain.
              </p>
            )}
          </div>

          {/* Lactation & Dry Periods */}
          <div className="rounded-2xl border border-stone-200/90 bg-white p-5 space-y-4">
            <h2 className="text-base font-bold text-stone-900">Lactation &amp; Dry Period Cycles</h2>

            <form onSubmit={handleSaveLactation} className="grid grid-cols-2 gap-3">
              <select
                required
                value={lAnimalId}
                onChange={(e) => setLAnimalId(e.target.value)}
                className="col-span-2 min-h-[44px] rounded-xl border border-stone-300 bg-white px-3 text-sm"
              >
                <option value="">— Select Female Animal —</option>
                {femaleAnimals.map((a) => (
                  <option key={a.id} value={a.id}>
                    Tag #{a.tagNumber} {a.name ? `(${a.name})` : ''}
                  </option>
                ))}
              </select>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Lactation #</label>
                <input
                  type="number"
                  min="1"
                  value={lNumber}
                  onChange={(e) => setLNumber(e.target.value)}
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Stage</label>
                <select
                  value={lStatus}
                  onChange={(e) =>
                    setLStatus(e.target.value as 'ACTIVE' | 'DRY_PERIOD' | 'COMPLETED')
                  }
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-stone-300 bg-white px-3 text-sm"
                >
                  <option value="ACTIVE">Active Milking</option>
                  <option value="DRY_PERIOD">Dry Period</option>
                  <option value="COMPLETED">Completed Cycle</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Start Date</label>
                <input
                  type="date"
                  value={lStart}
                  onChange={(e) => setLStart(e.target.value)}
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-stone-300 px-3 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Dry-Off Date</label>
                <input
                  type="date"
                  value={lDryDate}
                  onChange={(e) => setLDryDate(e.target.value)}
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-stone-300 px-3 font-mono text-xs"
                />
              </div>
              <button
                type="submit"
                className="col-span-2 min-h-[44px] rounded-xl bg-[#1B4D3E] text-xs font-semibold text-white hover:bg-[#153D31]"
              >
                Save Lactation Cycle
              </button>
            </form>

            <ul className="divide-y divide-stone-100 border-t border-stone-100 pt-3">
              {lactationRecords.map((cycle) => {
                const a = animalMap.get(cycle.animalId);
                const m = computeLactationMetrics(
                  cycle,
                  milkRecords.filter((r) => r.animalId === cycle.animalId)
                );
                return (
                  <li key={cycle.id} className="py-2.5 text-xs">
                    <p className="font-semibold text-stone-900">
                      {a ? `Tag #${a.tagNumber}` : 'Animal'} · Lactation #{cycle.lactationNumber} (
                      {cycle.status})
                    </p>
                    <p className="font-mono text-stone-600 tabular-nums">
                      Start {formatIndianDate(cycle.startDate)} · {m.daysInMilk} DIM · Yield{' '}
                      {m.calculatedProductionLitres} L · Peak {m.peakDailyLitres} L/d
                      {m.dryPeriodDays !== null ? ` · Dry ${m.dryPeriodDays}d` : ''}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {/* Audited Breeding Correction Modal */}
      {correctingBreeding && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 p-4"
        >
          <form
            onSubmit={handleSaveBreedingCorrection}
            className="w-full max-w-md space-y-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="text-base font-bold text-stone-900">
                Audited AI / Breeding Correction
              </h3>
              <button
                type="button"
                onClick={() => setCorrectingBreeding(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Semen Straw / Bull ID *
              </label>
              <input
                type="text"
                required
                value={cbStraw}
                onChange={(e) => setCbStraw(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700">Breeding Date</label>
                <input
                  type="date"
                  value={cbDate}
                  onChange={(e) => setCbDate(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Technician</label>
                <input
                  type="text"
                  value={cbTech}
                  onChange={(e) => setCbTech(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Correction Reason (Audit Log) *
              </label>
              <input
                type="text"
                required
                value={cbReason}
                onChange={(e) => setCbReason(e.target.value)}
                placeholder="e.g. Updated straw batch code from vet receipt"
                className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCorrectingBreeding(null)}
                className="min-h-[42px] rounded-xl border border-stone-300 px-4 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="min-h-[42px] rounded-xl bg-[#1B4D3E] px-4 text-xs font-semibold text-white"
              >
                Save Audited Correction
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Audited Calving Correction Modal */}
      {correctingCalving && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 p-4"
        >
          <form
            onSubmit={handleSaveCalvingCorrection}
            className="w-full max-w-md space-y-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="text-base font-bold text-stone-900">Audited Calving Correction</h3>
              <button
                type="button"
                onClick={() => setCorrectingCalving(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700">Delivery Type</label>
              <select
                value={ccDeliveryType}
                onChange={(e) =>
                  setCcDeliveryType(e.target.value as 'NORMAL' | 'COMPLICATED')
                }
                className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 bg-white px-3 text-sm"
              >
                <option value="NORMAL">Normal Delivery</option>
                <option value="COMPLICATED">Complicated / Assisted</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700">Observations</label>
              <input
                type="text"
                value={ccObs}
                onChange={(e) => setCcObs(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Correction Reason (Audit Log) *
              </label>
              <input
                type="text"
                required
                value={ccReason}
                onChange={(e) => setCcReason(e.target.value)}
                placeholder="e.g. Added veterinary delivery notes"
                className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCorrectingCalving(null)}
                className="min-h-[42px] rounded-xl border border-stone-300 px-4 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="min-h-[42px] rounded-xl bg-[#1B4D3E] px-4 text-xs font-semibold text-white"
              >
                Save Audited Correction
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
