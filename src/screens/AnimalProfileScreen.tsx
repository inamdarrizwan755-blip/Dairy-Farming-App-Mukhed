import {
  Archive,
  ArrowLeft,
  Droplets,
  Edit3,
  Heart,
  Plus,
  QrCode,
  Scale,
  Stethoscope,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { AnimalQrModal } from '../components/QrModalAndScanner';
import { useFarm } from '../context/FarmContext';
import {
  calculateAge,
  calculateMilkValue,
  calculateWeightGrowth,
  computeLactationMetrics,
  formatIndianDate,
  formatINR,
  getTodayIso,
  validateMilkEntry,
} from '../domain/calculations';
import { MilkSession } from '../types/models';
import { AnimalFormModal } from './AnimalsScreen';

const PROFILE_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'milk', label: 'Milk' },
  { id: 'feed', label: 'Feed' },
  { id: 'health', label: 'Health & Meds' },
  { id: 'vet', label: 'Vet & Vaccines' },
  { id: 'breeding', label: 'Breeding & Preg' },
  { id: 'calving', label: 'Calving & Calves' },
  { id: 'weight', label: 'Weight & Lactation' },
  { id: 'finance', label: 'Finance' },
  { id: 'history', label: 'Chronology' },
] as const;

type ProfileTabId = (typeof PROFILE_TABS)[number]['id'];

export const AnimalProfileScreen: React.FC<{
  animalId: string;
  initialTab?: string;
}> = ({ animalId, initialTab }) => {
  const {
    animals,
    settings,
    milkRecords,
    feedRecords,
    feedTypes,
    healthRecords,
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
    upsertMilkRecord,
    logWeightRecord,
    archiveAnimal,
    navigate,
    notify,
  } = useFarm();

  const [activeTab, setActiveTab] = useState<ProfileTabId>(
    (PROFILE_TABS.find((t) => t.id === initialTab)?.id as ProfileTabId) || 'overview'
  );
  const [showEdit, setShowEdit] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  // Quick inline modals for direct profile logging
  const [quickMilkOpen, setQuickMilkOpen] = useState(false);
  const [milkDate, setMilkDate] = useState(getTodayIso());
  const [milkSession, setMilkSession] = useState<MilkSession>(MilkSession.MORNING);
  const [milkLitres, setMilkLitres] = useState('');
  const [milkFat, setMilkFat] = useState('');
  const [milkSnf, setMilkSnf] = useState('');
  const [milkRate, setMilkRate] = useState(String(settings.defaultMilkRatePerLitre));

  const [quickWeightOpen, setQuickWeightOpen] = useState(false);
  const [weightDate, setWeightDate] = useState(getTodayIso());
  const [weightKg, setWeightKg] = useState('');
  const [weightNotes, setWeightNotes] = useState('');

  const animal = useMemo(() => animals.find((a) => a.id === animalId), [animals, animalId]);

  const dam = useMemo(
    () => (animal?.damId ? animals.find((a) => a.id === animal.damId) : undefined),
    [animals, animal?.damId]
  );
  const sire = useMemo(
    () => (animal?.sireId ? animals.find((a) => a.id === animal.sireId) : undefined),
    [animals, animal?.sireId]
  );

  // Relational slices
  const myMilks = useMemo(
    () =>
      milkRecords
        .filter((m) => m.animalId === animalId)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [milkRecords, animalId]
  );

  const myFeeds = useMemo(
    () =>
      feedRecords
        .filter((f) => f.animalId === animalId || (animal?.shedLocation && f.groupOrShed === animal.shedLocation))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [feedRecords, animalId, animal?.shedLocation]
  );

  const myHealth = useMemo(
    () =>
      healthRecords
        .filter((h) => h.animalId === animalId)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [healthRecords, animalId]
  );

  const myMedUsages = useMemo(
    () =>
      medicineUsages
        .filter((u) => u.animalId === animalId)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [medicineUsages, animalId]
  );

  const myVetVisits = useMemo(
    () =>
      veterinaryVisits
        .filter((v) => v.animalId === animalId)
        .sort((a, b) => b.visitDate.localeCompare(a.visitDate)),
    [veterinaryVisits, animalId]
  );

  const myVaccinations = useMemo(
    () =>
      vaccinationRecords
        .filter((v) => v.animalId === animalId)
        .sort((a, b) => b.administeredDate.localeCompare(a.administeredDate)),
    [vaccinationRecords, animalId]
  );

  const myBreeding = useMemo(
    () =>
      breedingRecords
        .filter((b) => b.animalId === animalId)
        .sort((a, b) => b.breedingDate.localeCompare(a.breedingDate)),
    [breedingRecords, animalId]
  );

  const myPregnancies = useMemo(
    () =>
      pregnancyRecords
        .filter((p) => p.animalId === animalId)
        .sort((a, b) => b.confirmationDate.localeCompare(a.confirmationDate)),
    [pregnancyRecords, animalId]
  );

  const myCalvings = useMemo(
    () =>
      calvingRecords
        .filter((c) => c.motherId === animalId)
        .sort((a, b) => b.calvingDate.localeCompare(a.calvingDate)),
    [calvingRecords, animalId]
  );

  const myOffspring = useMemo(
    () => animals.filter((a) => a.damId === animalId || a.sireId === animalId),
    [animals, animalId]
  );

  const myWeights = useMemo(
    () => weightRecords.filter((w) => w.animalId === animalId),
    [weightRecords, animalId]
  );
  const growthSummary = useMemo(() => calculateWeightGrowth(myWeights), [myWeights]);

  const myLactations = useMemo(
    () =>
      lactationRecords
        .filter((l) => l.animalId === animalId)
        .sort((a, b) => b.lactationNumber - a.lactationNumber),
    [lactationRecords, animalId]
  );

  const myIncomes = useMemo(
    () =>
      incomeRecords
        .filter((i) => i.animalId === animalId)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [incomeRecords, animalId]
  );
  const myExpenses = useMemo(
    () =>
      expenseRecords
        .filter((e) => e.animalId === animalId)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [expenseRecords, animalId]
  );

  const totalMilkLitres = useMemo(
    () => Math.round(myMilks.reduce((s, m) => s + m.quantityLitres, 0) * 100) / 100,
    [myMilks]
  );
  const distinctMilkDays = useMemo(
    () => new Set(myMilks.map((m) => m.date)).size,
    [myMilks]
  );
  const avgDailyMilk = distinctMilkDays > 0 ? totalMilkLitres / distinctMilkDays : 0;

  // Unified Chronological History
  const timelineEvents = useMemo(() => {
    const items: Array<{ id: string; date: string; category: string; summary: string }> = [];
    if (animal?.dateOfBirth) {
      items.push({
        id: 'dob',
        date: animal.dateOfBirth,
        category: 'Birth',
        summary: `Born (${animal.species} · ${animal.breed})`,
      });
    }
    if (animal?.purchaseDate) {
      items.push({
        id: 'purchase',
        date: animal.purchaseDate,
        category: 'Purchased',
        summary: `Acquired${animal.purchasePrice ? ` for ${formatINR(animal.purchasePrice)}` : ''}`,
      });
    }
    for (const m of myMilks) {
      items.push({
        id: m.id,
        date: m.date,
        category: 'Milk',
        summary: `${m.session}: ${m.quantityLitres.toFixed(1)} L${m.fatPercentage ? ` · Fat ${m.fatPercentage}%` : ''}`,
      });
    }
    for (const h of myHealth) {
      items.push({
        id: h.id,
        date: h.date,
        category: 'Health',
        summary: `${h.symptoms} (${h.status})${h.treatmentGiven ? ` · ${h.treatmentGiven}` : ''}`,
      });
    }
    for (const v of myVaccinations) {
      items.push({
        id: v.id,
        date: v.administeredDate,
        category: 'Vaccine',
        summary: `Vaccinated: ${v.vaccineName}`,
      });
    }
    for (const b of myBreeding) {
      items.push({
        id: b.id,
        date: b.breedingDate,
        category: 'Breeding',
        summary: `Attempt #${b.attemptNumber} (${b.method}) · Sire/Straw ${b.semenOrBullId}`,
      });
    }
    for (const p of myPregnancies) {
      items.push({
        id: p.id,
        date: p.confirmationDate,
        category: 'Pregnancy',
        summary: `${p.status} · Expected calving ${formatIndianDate(p.expectedCalvingDate)}`,
      });
    }
    for (const c of myCalvings) {
      items.push({
        id: c.id,
        date: c.calvingDate,
        category: 'Calving',
        summary: `Calved (${c.calfCount} calf/calves)${c.complications ? ` · ${c.complications}` : ''}`,
      });
    }
    for (const w of growthSummary.sorted) {
      items.push({
        id: w.id,
        date: w.date,
        category: 'Weight',
        summary: `Recorded weight: ${w.weightKg} kg`,
      });
    }
    return items.sort((a, b) => b.date.localeCompare(a.date));
  }, [
    animal,
    myMilks,
    myHealth,
    myVaccinations,
    myBreeding,
    myPregnancies,
    myCalvings,
    growthSummary.sorted,
  ]);

  if (!animal) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center">
        <p className="text-base font-bold text-stone-900">Animal Record Not Found</p>
        <button
          type="button"
          onClick={() => navigate({ name: 'animals' })}
          className="mt-4 min-h-[44px] rounded-xl bg-[#1B4D3E] px-4 text-sm font-semibold text-white"
        >
          Back to Herd List
        </button>
      </div>
    );
  }

  const handleQuickMilkSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(milkLitres);
    const fat = milkFat ? Number(milkFat) : undefined;
    const snf = milkSnf ? Number(milkSnf) : undefined;
    const rate = milkRate ? Number(milkRate) : undefined;

    const err = validateMilkEntry({
      animalId: animal.id,
      date: milkDate,
      quantityLitres: qty,
      fatPercentage: fat,
      snfPercentage: snf,
      pricePerLitre: rate,
    });
    if (err) {
      notify(err, 'error');
      return;
    }

    await upsertMilkRecord({
      animalId: animal.id,
      date: milkDate,
      session: milkSession,
      quantityLitres: qty,
      fatPercentage: fat,
      snfPercentage: snf,
      pricePerLitre: rate,
      totalValue: calculateMilkValue(qty, rate),
    });
    setMilkLitres('');
    setQuickMilkOpen(false);
    setActiveTab('milk');
    notify(`Logged ${qty} L (${milkSession}) for Tag #${animal.tagNumber}`);
  };

  const handleQuickWeightSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const kg = Number(weightKg);
    if (!kg || kg <= 0 || kg > 1500) {
      notify('Enter a valid weight between 1 kg and 1,500 kg.', 'error');
      return;
    }
    await logWeightRecord({
      animalId: animal.id,
      date: weightDate,
      weightKg: kg,
      notes: weightNotes.trim() || undefined,
    });
    setWeightKg('');
    setWeightNotes('');
    setQuickWeightOpen(false);
    setActiveTab('weight');
    notify(`Recorded ${kg} kg for Tag #${animal.tagNumber}`);
  };

  const feedTypeMap = new Map(feedTypes.map((f) => [f.id, f]));

  return (
    <div className="space-y-5 pb-8">
      {/* Top Bar Back + Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate({ name: 'animals' })}
          className="flex min-h-[44px] items-center gap-2 rounded-xl border border-stone-200 bg-white px-3.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Herd List
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowQr(true)}
            className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3.5 text-xs font-semibold text-stone-800 hover:bg-stone-50 whitespace-nowrap"
          >
            <QrCode className="h-4 w-4 text-[#1B4D3E]" />
            QR Tag
          </button>
          <button
            type="button"
            onClick={() => setShowEdit(true)}
            className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3.5 text-xs font-semibold text-stone-800 hover:bg-stone-50 whitespace-nowrap"
          >
            <Edit3 className="h-4 w-4" />
            Edit
          </button>
          <button
            type="button"
            onClick={() => setConfirmArchive(true)}
            className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3.5 text-xs font-semibold text-red-700 hover:bg-red-50 whitespace-nowrap"
          >
            <Archive className="h-4 w-4" />
            Archive
          </button>
        </div>
      </div>

      {/* Animal Identity Banner + Quick Record Bar */}
      <section className="rounded-2xl border border-stone-200/90 bg-white p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-stone-200 bg-[#1B4D3E]/10 font-mono text-xl font-bold text-[#1B4D3E]">
              {animal.photoDataUrl ? (
                <img
                  src={animal.photoDataUrl}
                  alt={`Tag ${animal.tagNumber}`}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              ) : (
                animal.species.slice(0, 1)
              )}
            </div>
            <div>
              <h1 className="font-mono text-2xl font-extrabold text-stone-900 tabular-nums">
                Tag #{animal.tagNumber}
                {animal.name && (
                  <span className="ml-2 font-sans text-xl font-bold text-stone-700">
                    ({animal.name})
                  </span>
                )}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-stone-600">
                <span className="font-semibold text-[#1B4D3E]">{animal.status}</span>
                <span aria-hidden="true">·</span>
                <span>{animal.species}</span>
                <span aria-hidden="true">·</span>
                <span>{animal.breed}</span>
                <span aria-hidden="true">·</span>
                <span>{animal.gender}</span>
                <span aria-hidden="true">·</span>
                <span>Age {calculateAge(animal.dateOfBirth)}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setQuickMilkOpen(true)}
              className="flex min-h-[42px] items-center gap-1.5 rounded-xl bg-[#1B4D3E] px-3.5 text-xs font-semibold text-white hover:bg-[#153D31] whitespace-nowrap"
            >
              <Droplets className="h-3.5 w-3.5" />
              + Milk
            </button>
            <button
              type="button"
              onClick={() => navigate({ name: 'health', initialTab: 'health' })}
              className="flex min-h-[42px] items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3.5 text-xs font-semibold text-stone-800 hover:bg-stone-50 whitespace-nowrap"
            >
              <Stethoscope className="h-3.5 w-3.5 text-[#1B4D3E]" />
              + Health
            </button>
            <button
              type="button"
              onClick={() => navigate({ name: 'breeding', initialTab: 'breeding' })}
              className="flex min-h-[42px] items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3.5 text-xs font-semibold text-stone-800 hover:bg-stone-50 whitespace-nowrap"
            >
              <Heart className="h-3.5 w-3.5 text-[#1B4D3E]" />
              + Breeding
            </button>
            <button
              type="button"
              onClick={() => setQuickWeightOpen(true)}
              className="flex min-h-[42px] items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3.5 text-xs font-semibold text-stone-800 hover:bg-stone-50 whitespace-nowrap"
            >
              <Scale className="h-3.5 w-3.5 text-[#1B4D3E]" />
              + Weight
            </button>
          </div>
        </div>

        {/* Scrollable Profile Section Tabs */}
        <div className="mt-5 flex gap-1 overflow-x-auto border-t border-stone-100 pt-4">
          {PROFILE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-[38px] shrink-0 rounded-xl px-3.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-[#1B4D3E] text-white'
                  : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {/* Tab Contents */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-stone-200/90 bg-white p-5 space-y-3">
            <h2 className="text-base font-bold text-stone-900">Identity & Barn Details</h2>
            <dl className="divide-y divide-stone-100 text-sm">
              <div className="flex justify-between py-2">
                <dt className="text-stone-500">QR Identifier</dt>
                <dd className="font-mono text-xs font-semibold text-stone-900">{animal.qrIdentifier}</dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-stone-500">RFID Tag</dt>
                <dd className="font-mono text-xs text-stone-800">{animal.rfidTag || '—'}</dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-stone-500">Date of Birth</dt>
                <dd className="font-mono text-stone-800 tabular-nums">
                  {formatIndianDate(animal.dateOfBirth)} ({calculateAge(animal.dateOfBirth)})
                </dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-stone-500">Coat Colour</dt>
                <dd className="text-stone-800">{animal.color || '—'}</dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-stone-500">Shed / Location</dt>
                <dd className="text-stone-800">{animal.shedLocation || '—'}</dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-stone-500">Purchase Info</dt>
                <dd className="font-mono text-stone-800 tabular-nums">
                  {animal.purchasePrice ? formatINR(animal.purchasePrice) : '—'}{' '}
                  {animal.purchaseDate ? `on ${formatIndianDate(animal.purchaseDate)}` : ''}
                </dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-stone-500">Seller / Source</dt>
                <dd className="text-stone-800">{animal.sellerInfo || '—'}</dd>
              </div>
            </dl>
            {animal.notes && (
              <div className="border-t border-stone-100 pt-3">
                <p className="text-xs font-semibold text-stone-500">Notes</p>
                <p className="mt-1 text-sm text-stone-800">{animal.notes}</p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-stone-200/90 bg-white p-5 space-y-4">
            <h2 className="text-base font-bold text-stone-900">Lineage & Lifetime Summary</h2>
            <div className="divide-y divide-stone-100 text-sm">
              <div className="flex items-center justify-between py-2.5">
                <span className="text-stone-500">Mother (Dam)</span>
                {dam ? (
                  <button
                    type="button"
                    onClick={() => navigate({ name: 'animal-profile', animalId: dam.id })}
                    className="font-mono font-semibold text-[#1B4D3E] hover:underline"
                  >
                    Tag #{dam.tagNumber} {dam.name ? `(${dam.name})` : ''}
                  </button>
                ) : (
                  <span className="text-stone-500">Not linked</span>
                )}
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-stone-500">Father (Sire)</span>
                {sire ? (
                  <button
                    type="button"
                    onClick={() => navigate({ name: 'animal-profile', animalId: sire.id })}
                    className="font-mono font-semibold text-[#1B4D3E] hover:underline"
                  >
                    Tag #{sire.tagNumber} {sire.name ? `(${sire.name})` : ''}
                  </button>
                ) : (
                  <span className="text-stone-500">AI Semen / External Sire</span>
                )}
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-stone-500">Lifetime Milk Logged</span>
                <span className="font-mono font-bold text-stone-900 tabular-nums">
                  {totalMilkLitres.toFixed(1)} L ({avgDailyMilk.toFixed(1)} L/day avg)
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-stone-500">Latest Weight</span>
                <span className="font-mono font-bold text-stone-900 tabular-nums">
                  {growthSummary.latestKg ? `${growthSummary.latestKg} kg` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-stone-500">Registered Calves</span>
                <span className="font-mono font-bold text-stone-900 tabular-nums">
                  {myOffspring.length}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'milk' && (
        <div className="rounded-2xl border border-stone-200/90 bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-stone-900">Milk Production Records</h2>
              <p className="text-xs text-stone-500">
                Total: <span className="font-mono font-semibold tabular-nums">{totalMilkLitres.toFixed(1)} L</span> across {distinctMilkDays} milking days
              </p>
            </div>
            <button
              type="button"
              onClick={() => setQuickMilkOpen(true)}
              className="flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#1B4D3E] px-3.5 text-xs font-semibold text-white"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Entry
            </button>
          </div>
          {myMilks.length === 0 ? (
            <p className="mt-6 text-sm text-stone-500">No milk production entries recorded for this animal yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-stone-200 text-xs text-stone-500">
                  <tr>
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Session</th>
                    <th className="py-2 pr-4 text-right">Quantity</th>
                    <th className="py-2 pr-4 text-right">Fat / SNF</th>
                    <th className="py-2 text-right">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 font-mono text-xs tabular-nums">
                  {myMilks.map((m) => (
                    <tr key={m.id}>
                      <td className="py-2.5 pr-4">{formatIndianDate(m.date)}</td>
                      <td className="py-2.5 pr-4 font-sans font-medium">{m.session}</td>
                      <td className="py-2.5 pr-4 text-right font-bold text-[#1B4D3E]">
                        {m.quantityLitres.toFixed(1)} L
                      </td>
                      <td className="py-2.5 pr-4 text-right text-stone-600">
                        {m.fatPercentage ? `${m.fatPercentage}%` : '—'} /{' '}
                        {m.snfPercentage ? `${m.snfPercentage}%` : '—'}
                      </td>
                      <td className="py-2.5 text-right">{formatINR(m.totalValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'feed' && (
        <div className="rounded-2xl border border-stone-200/90 bg-white p-5">
          <h2 className="text-base font-bold text-stone-900">Feed Rations & Shed Consumption</h2>
          {myFeeds.length === 0 ? (
            <p className="mt-4 text-sm text-stone-500">
              No individual or matching shed feed records logged yet.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-stone-100">
              {myFeeds.map((f) => {
                const ft = feedTypeMap.get(f.feedTypeId);
                return (
                  <li key={f.id} className="flex items-center justify-between py-3 text-sm">
                    <div>
                      <p className="font-semibold text-stone-900">{ft?.name || 'Feed Ration'}</p>
                      <p className="text-xs text-stone-500">
                        {formatIndianDate(f.date)} ·{' '}
                        {f.animalId ? 'Individual Ration' : `Group (${f.groupOrShed})`}
                      </p>
                    </div>
                    <div className="text-right font-mono text-xs tabular-nums">
                      <p className="font-bold text-stone-900">{f.quantityKg} kg</p>
                      <p className="text-stone-500">{formatINR(f.totalCost)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {activeTab === 'health' && (
        <div className="rounded-2xl border border-stone-200/90 bg-white p-5 space-y-4">
          <h2 className="text-base font-bold text-stone-900">Health & Medicine Usage</h2>
          {myHealth.length === 0 && myMedUsages.length === 0 ? (
            <p className="text-sm text-stone-500">No clinical observations or medicine usage recorded.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {myHealth.map((h) => (
                <li key={h.id} className="py-3 text-sm">
                  <div className="flex justify-between">
                    <span className="font-semibold text-stone-900">{h.symptoms}</span>
                    <span className="font-mono text-xs text-stone-600 tabular-nums">
                      {formatIndianDate(h.date)} · {h.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-stone-600">
                    {h.temperatureCelsius ? `Temp ${h.temperatureCelsius}°C · ` : ''}
                    {h.treatmentGiven || 'Observation logged'}
                    {h.medicineName ? ` · Medicine: ${h.medicineName} (${h.dosageText || ''})` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {activeTab === 'vet' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-stone-200/90 bg-white p-5">
            <h2 className="text-base font-bold text-stone-900">Veterinary Visits</h2>
            {myVetVisits.length === 0 ? (
              <p className="mt-3 text-sm text-stone-500">No veterinary visits recorded for this animal.</p>
            ) : (
              <ul className="mt-3 divide-y divide-stone-100">
                {myVetVisits.map((v) => (
                  <li key={v.id} className="py-3 text-sm">
                    <p className="font-semibold text-stone-900">
                      {v.reason} · Dr. {v.veterinarianName}
                    </p>
                    <p className="text-xs text-stone-500">
                      {formatIndianDate(v.visitDate)} · Cost {formatINR(v.cost)}
                    </p>
                    {v.findings && <p className="mt-1 text-xs text-stone-700">{v.findings}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-stone-200/90 bg-white p-5">
            <h2 className="text-base font-bold text-stone-900">Vaccinations</h2>
            {myVaccinations.length === 0 ? (
              <p className="mt-3 text-sm text-stone-500">No vaccinations recorded yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-stone-100">
                {myVaccinations.map((v) => (
                  <li key={v.id} className="py-3 text-sm">
                    <p className="font-semibold text-stone-900">{v.vaccineName}</p>
                    <p className="font-mono text-xs text-stone-500 tabular-nums">
                      Given {formatIndianDate(v.administeredDate)}
                      {v.dueDate ? ` · Next due ${formatIndianDate(v.dueDate)}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {activeTab === 'breeding' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-stone-200/90 bg-white p-5">
            <h2 className="text-base font-bold text-stone-900">Heat & Breeding Attempts</h2>
            {myBreeding.length === 0 ? (
              <p className="mt-3 text-sm text-stone-500">No heat or AI/natural breeding attempts logged.</p>
            ) : (
              <ul className="mt-3 divide-y divide-stone-100">
                {myBreeding.map((b) => (
                  <li key={b.id} className="py-3 text-sm">
                    <p className="font-semibold text-stone-900">
                      Attempt #{b.attemptNumber} ({b.method}) · Straw/Bull {b.semenOrBullId}
                    </p>
                    <p className="font-mono text-xs text-stone-500 tabular-nums">
                      Heat {formatIndianDate(b.heatDate)} · Bred {formatIndianDate(b.breedingDate)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-stone-200/90 bg-white p-5">
            <h2 className="text-base font-bold text-stone-900">Pregnancy Checks</h2>
            {myPregnancies.length === 0 ? (
              <p className="mt-3 text-sm text-stone-500">No pregnancy records linked to this animal.</p>
            ) : (
              <ul className="mt-3 divide-y divide-stone-100">
                {myPregnancies.map((p) => (
                  <li key={p.id} className="py-3 text-sm">
                    <p className="font-semibold text-stone-900">Status: {p.status}</p>
                    <p className="font-mono text-xs text-stone-600 tabular-nums">
                      Checked {formatIndianDate(p.confirmationDate)} · Expected calving{' '}
                      {formatIndianDate(p.expectedCalvingDate)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {activeTab === 'calving' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-stone-200/90 bg-white p-5">
            <h2 className="text-base font-bold text-stone-900">Calving Events</h2>
            {myCalvings.length === 0 ? (
              <p className="mt-3 text-sm text-stone-500">No calving events recorded as mother.</p>
            ) : (
              <ul className="mt-3 divide-y divide-stone-100">
                {myCalvings.map((c) => (
                  <li key={c.id} className="py-3 text-sm">
                    <p className="font-semibold text-stone-900">
                      Calved on {formatIndianDate(c.calvingDate)} ({c.calfCount} calf/calves)
                    </p>
                    {c.observations && (
                      <p className="text-xs text-stone-600">{c.observations}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-stone-200/90 bg-white p-5">
            <h2 className="text-base font-bold text-stone-900">Linked Calves / Offspring</h2>
            {myOffspring.length === 0 ? (
              <p className="mt-3 text-sm text-stone-500">No calves linked to this animal yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-stone-100">
                {myOffspring.map((calf) => (
                  <li key={calf.id} className="flex items-center justify-between py-2.5 text-sm">
                    <div>
                      <p className="font-mono font-bold text-stone-900">Tag #{calf.tagNumber}</p>
                      <p className="text-xs text-stone-500">
                        {calf.gender} · Born {formatIndianDate(calf.dateOfBirth)} · {calf.status}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate({ name: 'animal-profile', animalId: calf.id })}
                      className="text-xs font-semibold text-[#1B4D3E] hover:underline"
                    >
                      Open Profile
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {activeTab === 'weight' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-stone-200/90 bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-stone-900">Weight & Growth</h2>
                {growthSummary.adgGramsPerDay !== null && (
                  <p className="font-mono text-xs text-stone-500 tabular-nums">
                    Total gain: {growthSummary.gainKg} kg · Avg {growthSummary.adgGramsPerDay} g/day
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setQuickWeightOpen(true)}
                className="min-h-[38px] rounded-xl bg-[#1B4D3E] px-3 text-xs font-semibold text-white"
              >
                + Log Weight
              </button>
            </div>
            {growthSummary.sorted.length === 0 ? (
              <p className="mt-4 text-sm text-stone-500">No weight measurements recorded yet.</p>
            ) : (
              <ul className="mt-4 divide-y divide-stone-100 font-mono text-xs tabular-nums">
                {[...growthSummary.sorted].reverse().map((w) => (
                  <li key={w.id} className="flex justify-between py-2.5">
                    <span>{formatIndianDate(w.date)}</span>
                    <span className="font-bold text-stone-900">{w.weightKg} kg</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-stone-200/90 bg-white p-5">
            <h2 className="text-base font-bold text-stone-900">Lactation & Dry Cycles</h2>
            {myLactations.length === 0 ? (
              <p className="mt-4 text-sm text-stone-500">
                No lactation cycles tracked yet. Recording a calving automatically starts a cycle.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-stone-100">
                {myLactations.map((cycle) => {
                  const m = computeLactationMetrics(cycle, myMilks);
                  return (
                    <li key={cycle.id} className="py-3 text-sm">
                      <p className="font-semibold text-stone-900">
                        Lactation #{cycle.lactationNumber} · {cycle.status}
                      </p>
                      <p className="font-mono text-xs text-stone-600 tabular-nums">
                        Started {formatIndianDate(cycle.startDate)} · {m.daysInMilk} DIM · Yield{' '}
                        {m.calculatedProductionLitres} L (Peak {m.peakDailyLitres} L)
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {activeTab === 'finance' && (
        <div className="rounded-2xl border border-stone-200/90 bg-white p-5 space-y-4">
          <h2 className="text-base font-bold text-stone-900">Animal-Attributed Economics</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 border-b border-stone-100 pb-4 font-mono tabular-nums">
            <div>
              <p className="font-sans text-xs text-stone-500">Purchase Price</p>
              <p className="text-lg font-bold text-stone-900">
                {formatINR(animal.purchasePrice || 0)}
              </p>
            </div>
            <div>
              <p className="font-sans text-xs text-stone-500">Direct Income + Valued Milk</p>
              <p className="text-lg font-bold text-emerald-700">
                {formatINR(
                  myIncomes.reduce((s, i) => s + i.amount, 0) +
                    myMilks.reduce((s, m) => s + (m.totalValue || 0), 0)
                )}
              </p>
            </div>
            <div>
              <p className="font-sans text-xs text-stone-500">Direct Expenses Logged</p>
              <p className="text-lg font-bold text-red-700">
                {formatINR(myExpenses.reduce((s, e) => s + e.amount, 0))}
              </p>
            </div>
          </div>

          {myIncomes.length === 0 && myExpenses.length === 0 ? (
            <p className="text-sm text-stone-500">
              No direct animal-specific income or expense ledger rows linked yet.
            </p>
          ) : (
            <ul className="divide-y divide-stone-100 text-xs">
              {myIncomes.map((i) => (
                <li key={i.id} className="flex justify-between py-2">
                  <span>
                    {formatIndianDate(i.date)} · {i.description}
                  </span>
                  <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                    +{formatINR(i.amount)}
                  </span>
                </li>
              ))}
              {myExpenses.map((e) => (
                <li key={e.id} className="flex justify-between py-2">
                  <span>
                    {formatIndianDate(e.date)} · {e.description}
                  </span>
                  <span className="font-mono font-semibold text-red-700 tabular-nums">
                    −{formatINR(e.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="rounded-2xl border border-stone-200/90 bg-white p-5">
          <h2 className="text-base font-bold text-stone-900">Complete Chronological History</h2>
          {timelineEvents.length === 0 ? (
            <p className="mt-4 text-sm text-stone-500">No historical events recorded yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-stone-100">
              {timelineEvents.map((ev) => (
                <li key={`${ev.category}_${ev.id}`} className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
                  <div>
                    <span className="font-semibold text-[#1B4D3E]">{ev.category}</span>
                    <span className="mx-1.5 text-stone-400">·</span>
                    <span className="text-stone-800">{ev.summary}</span>
                  </div>
                  <span className="shrink-0 font-mono text-xs text-stone-500 tabular-nums">
                    {formatIndianDate(ev.date)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Quick Milk Entry Modal */}
      {quickMilkOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <form
            onSubmit={handleQuickMilkSave}
            className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-6 space-y-4"
          >
            <h3 className="text-lg font-bold text-stone-900">
              Log Milk · Tag #{animal.tagNumber}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700">Date</label>
                <input
                  type="date"
                  value={milkDate}
                  onChange={(e) => setMilkDate(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Session</label>
                <select
                  value={milkSession}
                  onChange={(e) => setMilkSession(e.target.value as MilkSession)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 bg-white px-3 text-sm"
                >
                  <option value={MilkSession.MORNING}>Morning</option>
                  {settings.enableAfternoonSession && (
                    <option value={MilkSession.AFTERNOON}>Afternoon</option>
                  )}
                  <option value={MilkSession.EVENING}>Evening</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Litres *</label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={milkLitres}
                  onChange={(e) => setMilkLitres(e.target.value)}
                  placeholder="e.g. 6.5"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Rate (₹/L)</label>
                <input
                  type="number"
                  step="0.5"
                  value={milkRate}
                  onChange={(e) => setMilkRate(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Fat %</label>
                <input
                  type="number"
                  step="0.1"
                  value={milkFat}
                  onChange={(e) => setMilkFat(e.target.value)}
                  placeholder="Optional"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">SNF %</label>
                <input
                  type="number"
                  step="0.1"
                  value={milkSnf}
                  onChange={(e) => setMilkSnf(e.target.value)}
                  placeholder="Optional"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setQuickMilkOpen(false)}
                className="min-h-[44px] rounded-xl border border-stone-300 px-4 text-sm font-semibold text-stone-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="min-h-[44px] rounded-xl bg-[#1B4D3E] px-5 text-sm font-semibold text-white"
              >
                Save Milk
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Quick Weight Modal */}
      {quickWeightOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <form
            onSubmit={handleQuickWeightSave}
            className="w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-6 space-y-4"
          >
            <h3 className="text-lg font-bold text-stone-900">
              Record Weight · Tag #{animal.tagNumber}
            </h3>
            <div>
              <label className="block text-xs font-semibold text-stone-700">Date</label>
              <input
                type="date"
                value={weightDate}
                onChange={(e) => setWeightDate(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700">Weight (kg) *</label>
              <input
                type="number"
                step="0.5"
                required
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                placeholder="e.g. 420"
                className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700">Notes</label>
              <input
                type="text"
                value={weightNotes}
                onChange={(e) => setWeightNotes(e.target.value)}
                placeholder="Weighbridge or heart-girth tape"
                className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setQuickWeightOpen(false)}
                className="min-h-[44px] rounded-xl border border-stone-300 px-4 text-sm font-semibold text-stone-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="min-h-[44px] rounded-xl bg-[#1B4D3E] px-5 text-sm font-semibold text-white"
              >
                Save Weight
              </button>
            </div>
          </form>
        </div>
      )}

      {showEdit && (
        <AnimalFormModal initialAnimal={animal} onClose={() => setShowEdit(false)} />
      )}

      {showQr && (
        <AnimalQrModal
          animal={animal}
          farmName={settings.farmName}
          onClose={() => setShowQr(false)}
        />
      )}

      {confirmArchive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-6">
            <h3 className="text-lg font-bold text-stone-900">Archive Tag #{animal.tagNumber}?</h3>
            <p className="mt-2 text-sm text-stone-600">
              Archiving removes this animal from active lists while preserving all historical milk, health, breeding, and financial records.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmArchive(false)}
                className="min-h-[44px] rounded-xl border border-stone-300 px-4 text-sm font-semibold text-stone-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await archiveAnimal(animal.id);
                  notify(`Archived Tag #${animal.tagNumber}`, 'info');
                  navigate({ name: 'animals' });
                }}
                className="min-h-[44px] rounded-xl bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800"
              >
                Archive Animal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
