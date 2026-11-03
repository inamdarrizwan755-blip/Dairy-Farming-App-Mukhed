import { ArrowLeft, Info, Stethoscope, Syringe } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useFarm } from '../context/FarmContext';
import { addDaysIso, formatIndianDate, formatINR, getTodayIso } from '../domain/calculations';

const COMMON_VACCINES = [
  'FMD (Foot & Mouth Disease)',
  'HS (Haemorrhagic Septicaemia)',
  'BQ (Black Quarter)',
  'Brucellosis',
  'Theileriosis',
  'Lumpy Skin Disease (LSD)',
  'Anthrax',
];

export const HealthVetScreen: React.FC<{
  initialTab?: 'health' | 'medicines' | 'vet' | 'vaccinations';
}> = ({ initialTab = 'health' }) => {
  const {
    animals,
    healthRecords,
    medicines,
    veterinaryVisits,
    vaccinationRecords,
    logHealthEvent,
    updateHealthStatus,
    upsertMedicine,
    logVeterinaryVisit,
    logVaccination,
    navigate,
    notify,
  } = useFarm();

  const [tab, setTab] = useState<'health' | 'medicines' | 'vet' | 'vaccinations'>(initialTab);
  const today = getTodayIso();
  const animalMap = useMemo(() => new Map(animals.map((a) => [a.id, a])), [animals]);

  // Health Form
  const [hAnimalId, setHAnimalId] = useState('');
  const [hDate, setHDate] = useState(today);
  const [symptoms, setSymptoms] = useState('');
  const [tempC, setTempC] = useState('');
  const [observations, setObservations] = useState('');
  const [treatment, setTreatment] = useState('');
  const [medId, setMedId] = useState('');
  const [medQty, setMedQty] = useState('');
  const [dosageText, setDosageText] = useState('');
  const [hCost, setHCost] = useState('0');
  const [hFollowUp, setHFollowUp] = useState('');
  const [hStatus, setHStatus] = useState<'SICK' | 'RECOVERING' | 'RESOLVED'>('SICK');
  const [hLogExpense, setHLogExpense] = useState(true);

  // Medicine Inventory Form
  const [mName, setMName] = useState('');
  const [mUnit, setMUnit] = useState('ml');
  const [mBatch, setMBatch] = useState('');
  const [mExpiry, setMExpiry] = useState('');
  const [mStock, setMStock] = useState('');
  const [mLow, setMLow] = useState('5');
  const [mCostUnit, setMCostUnit] = useState('0');

  // Vet Visit Form
  const [vAnimalId, setVAnimalId] = useState('');
  const [vetName, setVetName] = useState('');
  const [vetPhone, setVetPhone] = useState('');
  const [vDate, setVDate] = useState(today);
  const [vReason, setVReason] = useState('');
  const [vFindings, setVFindings] = useState('');
  const [vTreatment, setVTreatment] = useState('');
  const [vCost, setVCost] = useState('0');
  const [vFollowUp, setVFollowUp] = useState('');

  // Vaccination Form
  const [vacAnimalId, setVacAnimalId] = useState('');
  const [vacName, setVacName] = useState(COMMON_VACCINES[0]);
  const [vacDate, setVacDate] = useState(today);
  const [vacDue, setVacDue] = useState(addDaysIso(today, 180));
  const [vacVet, setVacVet] = useState('');
  const [vacBatch, setVacBatch] = useState('');
  const [vacCost, setVacCost] = useState('0');

  const handleSaveHealth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hAnimalId || !symptoms.trim()) {
      notify('Select an animal and enter observed symptoms.', 'error');
      return;
    }
    const parsedTemp = tempC.trim() ? Number(tempC) : undefined;
    if (parsedTemp !== undefined && (parsedTemp < 34 || parsedTemp > 44)) {
      notify('Body temperature should be between 34.0°C and 44.0°C.', 'error');
      return;
    }
    try {
      await logHealthEvent({
        animalId: hAnimalId,
        date: hDate,
        symptoms: symptoms.trim(),
        temperatureCelsius: parsedTemp,
        observations: observations.trim() || undefined,
        treatmentGiven: treatment.trim() || undefined,
        medicineId: medId || undefined,
        medicineQuantityUsed: medQty ? Number(medQty) : undefined,
        dosageText: dosageText.trim() || undefined,
        cost: Number(hCost) || 0,
        followUpDate: hFollowUp || undefined,
        status: hStatus,
        logExpense: hLogExpense,
      });
      setSymptoms('');
      setTempC('');
      setObservations('');
      setTreatment('');
      setMedId('');
      setMedQty('');
      setDosageText('');
      setHCost('0');
      notify('Recorded health event.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to save health record.', 'error');
    }
  };

  const handleSaveMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mName.trim()) {
      notify('Medicine name is required.', 'error');
      return;
    }
    const stk = Number(mStock) || 0;
    if (stk < 0) {
      notify('Medicine stock cannot be negative.', 'error');
      return;
    }
    await upsertMedicine({
      name: mName.trim(),
      unit: mUnit,
      batchNumber: mBatch.trim() || undefined,
      expiryDate: mExpiry || undefined,
      currentStock: stk,
      lowStockThreshold: Number(mLow) || 2,
      costPerUnit: Number(mCostUnit) || 0,
    });
    setMName('');
    setMBatch('');
    setMExpiry('');
    setMStock('');
    notify('Saved medicine to farm stock.');
  };

  const handleSaveVetVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vetName.trim() || !vReason.trim()) {
      notify('Veterinarian name and reason for visit are required.', 'error');
      return;
    }
    await logVeterinaryVisit(
      {
        animalId: vAnimalId || undefined,
        veterinarianName: vetName.trim(),
        veterinarianPhone: vetPhone.trim() || undefined,
        visitDate: vDate,
        reason: vReason.trim(),
        findings: vFindings.trim() || undefined,
        treatment: vTreatment.trim() || undefined,
        cost: Number(vCost) || 0,
        followUpDate: vFollowUp || undefined,
      },
      true
    );
    setVReason('');
    setVFindings('');
    setVTreatment('');
    setVCost('0');
    setVFollowUp('');
    notify('Logged veterinary visit.');
  };

  const handleSaveVaccination = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vacAnimalId || !vacName.trim()) {
      notify('Select an animal and vaccine.', 'error');
      return;
    }
    await logVaccination(
      {
        animalId: vacAnimalId,
        vaccineName: vacName.trim(),
        administeredDate: vacDate,
        dueDate: vacDue || undefined,
        veterinarian: vacVet.trim() || undefined,
        batchNumber: vacBatch.trim() || undefined,
        cost: Number(vacCost) || 0,
      },
      true
    );
    setVacBatch('');
    setVacCost('0');
    notify('Saved vaccination & scheduled reminder.');
  };

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
              Health, Medicines & Vaccination
            </h1>
            <p className="text-sm text-stone-600">
              Clinical observation logs, medicine stock & expiry tracking, vet visits, and immunization schedules.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-stone-200 bg-white p-1">
          {(
            [
              { id: 'health', label: 'Health Log' },
              { id: 'medicines', label: 'Medicines' },
              { id: 'vet', label: 'Vet Visits' },
              { id: 'vaccinations', label: 'Vaccines' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`min-h-[38px] rounded-lg px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
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

      {/* Mandatory Non-Diagnostic Notice */}
      <div className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-white p-4 text-xs text-stone-600">
        <Info className="h-4 w-4 shrink-0 text-[#1B4D3E] mt-0.5" />
        <p>
          <strong>Veterinary Notice:</strong> DairyTrack records farmer observations, prescribed treatments, and medicine inventory only. It does not diagnose animal diseases—always consult a qualified veterinarian for clinical diagnosis and prescriptions.
        </p>
      </div>

      {tab === 'health' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <form
            onSubmit={handleSaveHealth}
            className="rounded-2xl border border-stone-200/90 bg-white p-5 space-y-4 lg:col-span-5"
          >
            <div className="flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-[#1B4D3E]" />
              <h2 className="text-base font-bold text-stone-900">Log Health Observation</h2>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">Animal *</label>
              <select
                required
                value={hAnimalId}
                onChange={(e) => setHAnimalId(e.target.value)}
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 bg-white px-3.5 text-sm"
              >
                <option value="">— Select Animal —</option>
                {animals.map((a) => (
                  <option key={a.id} value={a.id}>
                    Tag #{a.tagNumber} {a.name ? `(${a.name})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700">Date *</label>
                <input
                  type="date"
                  value={hDate}
                  onChange={(e) => setHDate(e.target.value)}
                  className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Temp (°C)</label>
                <input
                  type="number"
                  step="0.1"
                  value={tempC}
                  onChange={(e) => setTempC(e.target.value)}
                  placeholder="38.6"
                  className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Observed Symptoms *
              </label>
              <input
                type="text"
                required
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
                placeholder="e.g. Reduced appetite, udder swelling, limping"
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Veterinary Findings / Treatment Given
              </label>
              <input
                type="text"
                value={treatment}
                onChange={(e) => setTreatment(e.target.value)}
                placeholder="Prescribed care or treatment notes"
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 text-sm"
              />
            </div>

            {/* Optional Medicine Stock Deduction */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-stone-700">
                  Medicine Used from Farm Stock (Optional)
                </label>
                <select
                  value={medId}
                  onChange={(e) => setMedId(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 bg-white px-3 text-sm"
                >
                  <option value="">— None / External —</option>
                  {medicines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.currentStock} {m.unit} left)
                    </option>
                  ))}
                </select>
              </div>
              {medId && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700">Qty Used</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.1"
                      value={medQty}
                      onChange={(e) => setMedQty(e.target.value)}
                      className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700">Dosage Note</label>
                    <input
                      type="text"
                      value={dosageText}
                      onChange={(e) => setDosageText(e.target.value)}
                      placeholder="15 ml IM"
                      className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 text-sm"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="block text-xs font-semibold text-stone-700">
                  Direct Fee / Cost (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  value={hCost}
                  onChange={(e) => setHCost(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Status</label>
                <select
                  value={hStatus}
                  onChange={(e) =>
                    setHStatus(e.target.value as 'SICK' | 'RECOVERING' | 'RESOLVED')
                  }
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 bg-white px-3 text-sm"
                >
                  <option value="SICK">Sick (Active Alert)</option>
                  <option value="RECOVERING">Recovering</option>
                  <option value="RESOLVED">Resolved</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 items-center">
              <div>
                <label className="block text-xs font-semibold text-stone-700">Follow-up Date</label>
                <input
                  type="date"
                  value={hFollowUp}
                  onChange={(e) => setHFollowUp(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
              <label className="mt-5 flex items-center gap-2 text-xs text-stone-700">
                <input
                  type="checkbox"
                  checked={hLogExpense}
                  onChange={(e) => setHLogExpense(e.target.checked)}
                  className="h-4 w-4 accent-[#1B4D3E]"
                />
                Post cost to Expenses
              </label>
            </div>

            <button
              type="submit"
              className="min-h-[48px] w-full rounded-xl bg-[#1B4D3E] text-sm font-semibold text-white hover:bg-[#153D31]"
            >
              Save Health Record
            </button>
          </form>

          <div className="rounded-2xl border border-stone-200/90 bg-white p-5 lg:col-span-7">
            <h2 className="text-base font-bold text-stone-900">Clinical Health Records</h2>
            {healthRecords.length === 0 ? (
              <p className="mt-6 text-sm text-stone-500">No health incidents recorded.</p>
            ) : (
              <ul className="mt-4 divide-y divide-stone-100">
                {[...healthRecords]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((h) => {
                    const a = animalMap.get(h.animalId);
                    return (
                      <li key={h.id} className="py-3.5 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-stone-900">
                            {a ? `Tag #${a.tagNumber}` : 'Animal'} · {h.symptoms}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-stone-500 tabular-nums">
                              {formatIndianDate(h.date)}
                            </span>
                            <select
                              value={h.status}
                              onChange={(e) =>
                                updateHealthStatus(
                                  h.id,
                                  e.target.value as 'SICK' | 'RECOVERING' | 'RESOLVED'
                                )
                              }
                              className="min-h-[32px] rounded-lg border border-stone-200 bg-stone-50 px-2 text-xs font-semibold"
                            >
                              <option value="SICK">SICK</option>
                              <option value="RECOVERING">RECOVERING</option>
                              <option value="RESOLVED">RESOLVED</option>
                            </select>
                          </div>
                        </div>
                        <p className="mt-1 text-xs text-stone-600">
                          {h.temperatureCelsius ? `Temp ${h.temperatureCelsius}°C · ` : ''}
                          {h.treatmentGiven || 'No treatment text'}
                          {h.medicineName ? ` · Used ${h.medicineName}` : ''}
                          {h.cost > 0 ? ` · Cost ${formatINR(h.cost)}` : ''}
                        </p>
                      </li>
                    );
                  })}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === 'medicines' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <form
            onSubmit={handleSaveMedicine}
            className="rounded-2xl border border-stone-200/90 bg-white p-5 space-y-4 lg:col-span-5"
          >
            <h2 className="text-base font-bold text-stone-900">Add Medicine to Stock</h2>
            <div>
              <label className="block text-xs font-semibold text-stone-700">Medicine Name *</label>
              <input
                type="text"
                required
                value={mName}
                onChange={(e) => setMName(e.target.value)}
                placeholder="e.g. Meloxicam Inj, Calcium Gel, Dewormer Bolus"
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700">Unit</label>
                <select
                  value={mUnit}
                  onChange={(e) => setMUnit(e.target.value)}
                  className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 bg-white px-3 text-sm"
                >
                  <option value="ml">ml</option>
                  <option value="bolus">bolus / tablet</option>
                  <option value="vial">vial / bottle</option>
                  <option value="g">grams (g)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Current Stock *</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  required
                  value={mStock}
                  onChange={(e) => setMStock(e.target.value)}
                  className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Low Stock Alert</label>
                <input
                  type="number"
                  min="0"
                  value={mLow}
                  onChange={(e) => setMLow(e.target.value)}
                  className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Cost / Unit (₹)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={mCostUnit}
                  onChange={(e) => setMCostUnit(e.target.value)}
                  className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Batch #</label>
                <input
                  type="text"
                  value={mBatch}
                  onChange={(e) => setMBatch(e.target.value)}
                  className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Expiry Date</label>
                <input
                  type="date"
                  value={mExpiry}
                  onChange={(e) => setMExpiry(e.target.value)}
                  className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
            </div>
            <button
              type="submit"
              className="min-h-[48px] w-full rounded-xl bg-[#1B4D3E] text-sm font-semibold text-white hover:bg-[#153D31]"
            >
              Save Medicine
            </button>
          </form>

          <div className="rounded-2xl border border-stone-200/90 bg-white p-5 lg:col-span-7">
            <h2 className="text-base font-bold text-stone-900">Medicine Cabinet ({medicines.length})</h2>
            {medicines.length === 0 ? (
              <p className="mt-6 text-sm text-stone-500">No medicines registered in stock.</p>
            ) : (
              <ul className="mt-4 divide-y divide-stone-100">
                {medicines.map((m) => {
                  const expired = m.expiryDate ? m.expiryDate < today : false;
                  const low = m.currentStock <= m.lowStockThreshold;
                  return (
                    <li key={m.id} className="flex items-center justify-between py-3 text-sm">
                      <div>
                        <p className="font-semibold text-stone-900">{m.name}</p>
                        <p className="font-mono text-xs text-stone-500 tabular-nums">
                          {m.batchNumber ? `Batch ${m.batchNumber} · ` : ''}
                          {m.expiryDate ? `Exp ${formatIndianDate(m.expiryDate)}` : 'No expiry set'}
                          {expired ? ' · EXPIRED' : ''}
                        </p>
                      </div>
                      <div className="text-right font-mono text-xs tabular-nums">
                        <p className={`font-bold ${low || expired ? 'text-red-700' : 'text-stone-900'}`}>
                          {m.currentStock} {m.unit}
                        </p>
                        <p className="text-stone-500">{formatINR(m.costPerUnit)}/{m.unit}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === 'vet' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <form
            onSubmit={handleSaveVetVisit}
            className="rounded-2xl border border-stone-200/90 bg-white p-5 space-y-4 lg:col-span-5"
          >
            <h2 className="text-base font-bold text-stone-900">Record Veterinary Visit</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700">
                  Veterinarian Name *
                </label>
                <input
                  type="text"
                  required
                  value={vetName}
                  onChange={(e) => setVetName(e.target.value)}
                  placeholder="Dr. Deshmukh"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Phone</label>
                <input
                  type="tel"
                  value={vetPhone}
                  onChange={(e) => setVetPhone(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Animal (or leave blank for Herd Inspection)
              </label>
              <select
                value={vAnimalId}
                onChange={(e) => setVAnimalId(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 bg-white px-3 text-sm"
              >
                <option value="">— General Herd Visit —</option>
                {animals.map((a) => (
                  <option key={a.id} value={a.id}>
                    Tag #{a.tagNumber} {a.name ? `(${a.name})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700">Visit Date *</label>
                <input
                  type="date"
                  value={vDate}
                  onChange={(e) => setVDate(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Visit Cost (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={vCost}
                  onChange={(e) => setVCost(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
            </div>

            <input
              type="text"
              required
              value={vReason}
              onChange={(e) => setVReason(e.target.value)}
              placeholder="Reason for visit *"
              className="min-h-[44px] w-full rounded-xl border border-stone-300 px-3.5 text-sm"
            />
            <input
              type="text"
              value={vFindings}
              onChange={(e) => setVFindings(e.target.value)}
              placeholder="Findings & treatment prescribed"
              className="min-h-[44px] w-full rounded-xl border border-stone-300 px-3.5 text-sm"
            />
            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Follow-up Reminder Date
              </label>
              <input
                type="date"
                value={vFollowUp}
                onChange={(e) => setVFollowUp(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
              />
            </div>

            <button
              type="submit"
              className="min-h-[48px] w-full rounded-xl bg-[#1B4D3E] text-sm font-semibold text-white hover:bg-[#153D31]"
            >
              Save Veterinary Visit
            </button>
          </form>

          <div className="rounded-2xl border border-stone-200/90 bg-white p-5 lg:col-span-7">
            <h2 className="text-base font-bold text-stone-900">Veterinary Visit History</h2>
            {veterinaryVisits.length === 0 ? (
              <p className="mt-6 text-sm text-stone-500">No veterinary visits recorded yet.</p>
            ) : (
              <ul className="mt-4 divide-y divide-stone-100">
                {[...veterinaryVisits]
                  .sort((a, b) => b.visitDate.localeCompare(a.visitDate))
                  .map((v) => {
                    const a = v.animalId ? animalMap.get(v.animalId) : undefined;
                    return (
                      <li key={v.id} className="py-3 text-sm">
                        <div className="flex justify-between">
                          <span className="font-semibold text-stone-900">
                            {v.reason} · {v.veterinarianName}
                          </span>
                          <span className="font-mono text-xs text-stone-600 tabular-nums">
                            {formatIndianDate(v.visitDate)} · {formatINR(v.cost)}
                          </span>
                        </div>
                        <p className="text-xs text-stone-500">
                          {a ? `Tag #${a.tagNumber}` : 'Herd Inspection'}
                          {v.findings ? ` · ${v.findings}` : ''}
                          {v.followUpDate ? ` · Follow-up ${formatIndianDate(v.followUpDate)}` : ''}
                        </p>
                      </li>
                    );
                  })}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === 'vaccinations' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <form
            onSubmit={handleSaveVaccination}
            className="rounded-2xl border border-stone-200/90 bg-white p-5 space-y-4 lg:col-span-5"
          >
            <div className="flex items-center gap-2">
              <Syringe className="h-4 w-4 text-[#1B4D3E]" />
              <h2 className="text-base font-bold text-stone-900">Record Vaccination</h2>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">Animal *</label>
              <select
                required
                value={vacAnimalId}
                onChange={(e) => setVacAnimalId(e.target.value)}
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 bg-white px-3.5 text-sm"
              >
                <option value="">— Select Animal —</option>
                {animals.map((a) => (
                  <option key={a.id} value={a.id}>
                    Tag #{a.tagNumber} {a.name ? `(${a.name})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">Vaccine *</label>
              <select
                value={vacName}
                onChange={(e) => setVacName(e.target.value)}
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 bg-white px-3.5 text-sm"
              >
                {COMMON_VACCINES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700">Date Given *</label>
                <input
                  type="date"
                  value={vacDate}
                  onChange={(e) => setVacDate(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Next Booster Due</label>
                <input
                  type="date"
                  value={vacDue}
                  onChange={(e) => setVacDue(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Batch #</label>
                <input
                  type="text"
                  value={vacBatch}
                  onChange={(e) => setVacBatch(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Cost (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={vacCost}
                  onChange={(e) => setVacCost(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
            </div>

            <input
              type="text"
              value={vacVet}
              onChange={(e) => setVacVet(e.target.value)}
              placeholder="Administered by (Veterinarian / Livestock Inspector)"
              className="min-h-[44px] w-full rounded-xl border border-stone-300 px-3.5 text-sm"
            />

            <button
              type="submit"
              className="min-h-[48px] w-full rounded-xl bg-[#1B4D3E] text-sm font-semibold text-white hover:bg-[#153D31]"
            >
              Save Vaccination Record
            </button>
          </form>

          <div className="rounded-2xl border border-stone-200/90 bg-white p-5 lg:col-span-7">
            <h2 className="text-base font-bold text-stone-900">Vaccination Register</h2>
            {vaccinationRecords.length === 0 ? (
              <p className="mt-6 text-sm text-stone-500">No vaccinations recorded yet.</p>
            ) : (
              <ul className="mt-4 divide-y divide-stone-100">
                {[...vaccinationRecords]
                  .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
                  .map((v) => {
                    const a = animalMap.get(v.animalId);
                    return (
                      <li key={v.id} className="flex items-center justify-between py-3 text-sm">
                        <div>
                          <p className="font-semibold text-stone-900">
                            {v.vaccineName} · {a ? `Tag #${a.tagNumber}` : 'Animal'}
                          </p>
                          <p className="font-mono text-xs text-stone-500 tabular-nums">
                            Given {formatIndianDate(v.administeredDate)}
                            {v.batchNumber ? ` · Batch ${v.batchNumber}` : ''}
                          </p>
                        </div>
                        <div className="text-right font-mono text-xs tabular-nums">
                          <p className="font-semibold text-[#1B4D3E]">
                            Due {formatIndianDate(v.dueDate)}
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
    </div>
  );
};
