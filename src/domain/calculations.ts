import {
  Animal,
  ExpenseRecord,
  FARM_COMBINED_ANIMAL_ID,
  FarmSettings,
  IncomeRecord,
  LactationRecord,
  MilkRecord,
  MilkSession,
  Species,
  WeightRecord,
} from '../types/models';

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatINR(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || Number.isNaN(amount)) return '—';
  return inrFormatter.format(amount);
}

export function getTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getCurrentTimeHm(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function makeCombinedMilkId(dateIso: string, session: MilkSession | string): string {
  const cleanDate = dateIso.replace(/[^0-9-]/g, '');
  const cleanSession = String(session).replace(/[^A-Z_]/g, '');
  return `milk_combined_${cleanDate}_${cleanSession}`;
}

export function isCombinedMilkRecord(record: Pick<MilkRecord, 'animalId' | 'entryType'>): boolean {
  return record.animalId === FARM_COMBINED_ANIMAL_ID || record.entryType === 'COMBINED';
}

export function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const ry = dt.getFullYear();
  const rm = String(dt.getMonth() + 1).padStart(2, '0');
  const rd = String(dt.getDate()).padStart(2, '0');
  return `${ry}-${rm}-${rd}`;
}

export function diffDaysIso(startIso: string, endIso: string): number {
  const [sy, sm, sd] = startIso.split('-').map(Number);
  const [ey, em, ed] = endIso.split('-').map(Number);
  const s = Date.UTC(sy, sm - 1, sd);
  const e = Date.UTC(ey, em - 1, ed);
  return Math.round((e - s) / (1000 * 60 * 60 * 24));
}

export function formatIndianDate(isoDate?: string | null): string {
  if (!isoDate) return '—';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function formatDateTimeIndian(epochMs?: number | null): string {
  if (!epochMs) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(epochMs));
}

export function calculateAge(dobIso?: string | null, referenceIso: string = getTodayIso()): string {
  if (!dobIso) return 'Unknown age';
  if (dobIso > referenceIso) return 'Invalid DOB';

  const [by, bm, bd] = dobIso.split('-').map(Number);
  const [ry, rm, rd] = referenceIso.split('-').map(Number);

  let years = ry - by;
  let months = rm - bm;
  const days = rd - bd;

  if (days < 0) {
    months -= 1;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  if (years > 0 && months > 0) {
    return `${years} yr${years > 1 ? 's' : ''} ${months} mo${months > 1 ? 's' : ''}`;
  }
  if (years > 0) {
    return `${years} yr${years > 1 ? 's' : ''}`;
  }
  if (months > 0) {
    return `${months} mo${months > 1 ? 's' : ''}`;
  }
  const totalDays = Math.max(0, diffDaysIso(dobIso, referenceIso));
  return `${totalDays} day${totalDays !== 1 ? 's' : ''}`;
}

export function calculateExpectedCalving(
  breedingDateIso: string,
  species: Species,
  settings: FarmSettings
): { expectedCalvingDate: string; expectedDryOffDate: string; gestationDays: number } {
  const gestationDays =
    species === Species.BUFFALO ? settings.gestationDaysBuffalo : settings.gestationDaysCow;
  const expectedCalvingDate = addDaysIso(breedingDateIso, gestationDays);
  const expectedDryOffDate = addDaysIso(expectedCalvingDate, -60);
  return { expectedCalvingDate, expectedDryOffDate, gestationDays };
}

export function calculateExpectedPregnancyFollowUpDate(breedingDateIso: string): string {
  // Standard dairy pregnancy check / non-return follow-up at 21 days (heat return) / 45 days PD
  return addDaysIso(breedingDateIso, 21);
}

export function calculateMilkValue(quantityLitres: number, pricePerLitre?: number): number | undefined {
  if (pricePerLitre === undefined || Number.isNaN(pricePerLitre) || pricePerLitre < 0) {
    return undefined;
  }
  return Math.round(quantityLitres * pricePerLitre * 100) / 100;
}

/**
 * Resolves the effective session milk total for a single (date, session):
 * If a combined farm-wide entry exists for (date, session), use it directly so optional
 * individual cow logs on the same date never double-count whole-farm totals.
 * Otherwise, sum any individual cow entries for that (date, session).
 */
function aggregateSessionLitresForDay(dayRecords: MilkRecord[], session: MilkSession): {
  litres: number;
  value: number;
} {
  const sessionRecs = dayRecords.filter((r) => r.session === session);
  const combined = sessionRecs.filter((r) => isCombinedMilkRecord(r));
  const chosen = combined.length > 0 ? combined : sessionRecs;

  let litres = 0;
  let value = 0;
  for (const r of chosen) {
    litres += r.quantityLitres;
    if (r.totalValue) value += r.totalValue;
  }
  return { litres, value };
}

export function calculateDailyMilkSummary(records: MilkRecord[], dateIso: string) {
  const forDate = records.filter((r) => !r.isDeleted && r.date === dateIso);
  const m = aggregateSessionLitresForDay(forDate, MilkSession.MORNING);
  const a = aggregateSessionLitresForDay(forDate, MilkSession.AFTERNOON);
  const e = aggregateSessionLitresForDay(forDate, MilkSession.EVENING);

  const total = m.litres + a.litres + e.litres;
  const totalValue = m.value + a.value + e.value;
  return {
    morning: Math.round(m.litres * 100) / 100,
    afternoon: Math.round(a.litres * 100) / 100,
    evening: Math.round(e.litres * 100) / 100,
    total: Math.round(total * 100) / 100,
    totalValue: Math.round(totalValue * 100) / 100,
    entryCount: forDate.length,
  };
}

export interface DailyMilkTrendPoint {
  date: string;
  morning: number;
  afternoon: number;
  evening: number;
  total: number;
}

export interface ComprehensiveMilkAnalytics {
  todayMorning: number;
  todayAfternoon: number;
  todayEvening: number;
  todayTotal: number;
  weeklyTotal: number;
  monthlyTotal: number;
  yearlyTotal: number;
  averageDaily30d: number;
  activeDays30d: number;
  morningTotal30d: number;
  eveningTotal30d: number;
  morningSharePct: number;
  eveningSharePct: number;
  trend14d: DailyMilkTrendPoint[];
}

export function calculateComprehensiveMilkAnalytics(
  records: MilkRecord[],
  referenceIso: string = getTodayIso()
): ComprehensiveMilkAnalytics {
  const active = records.filter((r) => !r.isDeleted);
  const byDate = new Map<string, MilkRecord[]>();
  for (const r of active) {
    const bucket = byDate.get(r.date);
    if (bucket) bucket.push(r);
    else byDate.set(r.date, [r]);
  }

  const getSummary = (iso: string) => {
    const list = byDate.get(iso) || [];
    const m = aggregateSessionLitresForDay(list, MilkSession.MORNING).litres;
    const a = aggregateSessionLitresForDay(list, MilkSession.AFTERNOON).litres;
    const e = aggregateSessionLitresForDay(list, MilkSession.EVENING).litres;
    return {
      morning: Math.round(m * 100) / 100,
      afternoon: Math.round(a * 100) / 100,
      evening: Math.round(e * 100) / 100,
      total: Math.round((m + a + e) * 100) / 100,
    };
  };

  const todaySum = getSummary(referenceIso);
  const weekStartIso = addDaysIso(referenceIso, -6);
  const thirtyStartIso = addDaysIso(referenceIso, -29);
  const monthPrefix = referenceIso.slice(0, 7); // YYYY-MM
  const yearPrefix = referenceIso.slice(0, 4); // YYYY

  let weeklyTotal = 0;
  let monthlyTotal = 0;
  let yearlyTotal = 0;
  let total30d = 0;
  let activeDays30d = 0;
  let morningTotal30d = 0;
  let eveningTotal30d = 0;

  for (const [dateIso] of byDate.entries()) {
    if (dateIso > referenceIso) continue;
    const sum = getSummary(dateIso);
    if (sum.total <= 0) continue;

    if (dateIso >= weekStartIso) {
      weeklyTotal += sum.total;
    }
    if (dateIso.startsWith(monthPrefix)) {
      monthlyTotal += sum.total;
    }
    if (dateIso.startsWith(yearPrefix)) {
      yearlyTotal += sum.total;
    }
    if (dateIso >= thirtyStartIso) {
      total30d += sum.total;
      activeDays30d += 1;
      morningTotal30d += sum.morning;
      eveningTotal30d += sum.evening;
    }
  }

  const trend14d: DailyMilkTrendPoint[] = [];
  for (let offset = 13; offset >= 0; offset -= 1) {
    const dIso = addDaysIso(referenceIso, -offset);
    const s = getSummary(dIso);
    trend14d.push({
      date: dIso,
      morning: s.morning,
      afternoon: s.afternoon,
      evening: s.evening,
      total: s.total,
    });
  }

  const meSum = morningTotal30d + eveningTotal30d;
  const morningSharePct = meSum > 0 ? Math.round((morningTotal30d / meSum) * 100) : 50;
  const eveningSharePct = meSum > 0 ? 100 - morningSharePct : 50;

  return {
    todayMorning: todaySum.morning,
    todayAfternoon: todaySum.afternoon,
    todayEvening: todaySum.evening,
    todayTotal: todaySum.total,
    weeklyTotal: Math.round(weeklyTotal * 100) / 100,
    monthlyTotal: Math.round(monthlyTotal * 100) / 100,
    yearlyTotal: Math.round(yearlyTotal * 100) / 100,
    averageDaily30d: activeDays30d > 0 ? Math.round((total30d / activeDays30d) * 100) / 100 : 0,
    activeDays30d,
    morningTotal30d: Math.round(morningTotal30d * 100) / 100,
    eveningTotal30d: Math.round(eveningTotal30d * 100) / 100,
    morningSharePct,
    eveningSharePct,
    trend14d,
  };
}

export function calculateProfitSummary(
  incomes: IncomeRecord[],
  expenses: ExpenseRecord[],
  startIso?: string,
  endIso?: string
) {
  const filteredInc = incomes.filter(
    (i) => !i.isDeleted && (!startIso || i.date >= startIso) && (!endIso || i.date <= endIso)
  );
  const filteredExp = expenses.filter(
    (e) => !e.isDeleted && (!startIso || e.date >= startIso) && (!endIso || e.date <= endIso)
  );

  const totalIncome = filteredInc.reduce((sum, item) => sum + item.amount, 0);
  const totalExpenses = filteredExp.reduce((sum, item) => sum + item.amount, 0);
  const netProfit = totalIncome - totalExpenses;

  const incomeByCategory: Record<string, number> = {};
  for (const inc of filteredInc) {
    incomeByCategory[inc.category] = (incomeByCategory[inc.category] || 0) + inc.amount;
  }

  const expenseByCategory: Record<string, number> = {};
  for (const exp of filteredExp) {
    expenseByCategory[exp.category] = (expenseByCategory[exp.category] || 0) + exp.amount;
  }

  return {
    totalIncome: Math.round(totalIncome * 100) / 100,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
    incomeByCategory,
    expenseByCategory,
    incomeCount: filteredInc.length,
    expenseCount: filteredExp.length,
  };
}

export function calculateWeightGrowth(records: WeightRecord[]) {
  const sorted = [...records]
    .filter((w) => !w.isDeleted)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length === 0) {
    return { latestKg: null, initialKg: null, gainKg: null, adgGramsPerDay: null, sorted };
  }
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const gainKg = Math.round((last.weightKg - first.weightKg) * 100) / 100;
  const days = diffDaysIso(first.date, last.date);
  const adgGramsPerDay = days > 0 ? Math.round(((gainKg * 1000) / days) * 10) / 10 : null;

  return {
    latestKg: last.weightKg,
    initialKg: first.weightKg,
    gainKg: sorted.length > 1 ? gainKg : null,
    adgGramsPerDay,
    sorted,
  };
}

export function computeLactationMetrics(
  cycle: LactationRecord,
  animalMilkRecords: MilkRecord[]
): {
  daysInMilk: number;
  calculatedProductionLitres: number;
  peakDailyLitres: number;
  dryPeriodDays: number | null;
} {
  const endBound = cycle.dryOffDate || cycle.endDate || getTodayIso();
  const daysInMilk = Math.max(0, diffDaysIso(cycle.startDate, endBound));

  const cycleMilks = animalMilkRecords.filter(
    (m) =>
      !m.isDeleted &&
      !isCombinedMilkRecord(m) &&
      m.date >= cycle.startDate &&
      m.date <= endBound
  );

  const byDay: Record<string, number> = {};
  let total = 0;
  for (const m of cycleMilks) {
    total += m.quantityLitres;
    byDay[m.date] = (byDay[m.date] || 0) + m.quantityLitres;
  }

  const dailyPeaks = Object.values(byDay);
  const computedPeak = dailyPeaks.length > 0 ? Math.max(...dailyPeaks) : 0;
  const peakDailyLitres = Math.max(computedPeak, cycle.peakDailyLitres || 0);

  let dryPeriodDays: number | null = null;
  if (cycle.dryOffDate && cycle.endDate && cycle.endDate >= cycle.dryOffDate) {
    dryPeriodDays = diffDaysIso(cycle.dryOffDate, cycle.endDate);
  } else if (cycle.dryOffDate && cycle.status === 'DRY_PERIOD') {
    dryPeriodDays = Math.max(0, diffDaysIso(cycle.dryOffDate, getTodayIso()));
  }

  return {
    daysInMilk,
    calculatedProductionLitres:
      cycleMilks.length > 0
        ? Math.round(total * 100) / 100
        : Math.round((cycle.manualTotalLitres || 0) * 100) / 100,
    peakDailyLitres: Math.round(peakDailyLitres * 100) / 100,
    dryPeriodDays,
  };
}

// Strict Domain Validation Helpers
export function validateAnimalForm(
  input: {
    id?: string;
    tagNumber: string;
    qrIdentifier: string;
    dateOfBirth?: string;
    purchasePrice?: number;
    damId?: string;
    sireId?: string;
  },
  existingAnimals: Animal[]
): string | null {
  const tag = input.tagNumber.trim();
  if (!tag) return 'Ear tag number is required.';
  const duplicateTag = existingAnimals.find(
    (a) => !a.isDeleted && a.id !== input.id && a.tagNumber.toLowerCase() === tag.toLowerCase()
  );
  if (duplicateTag) {
    return `Ear tag "${tag}" is already assigned to another active animal.`;
  }

  const qr = input.qrIdentifier.trim();
  if (!qr) return 'QR identifier is required.';
  const duplicateQr = existingAnimals.find(
    (a) => !a.isDeleted && a.id !== input.id && a.qrIdentifier.toLowerCase() === qr.toLowerCase()
  );
  if (duplicateQr) {
    return `QR identifier "${qr}" is already in use.`;
  }

  if (input.dateOfBirth && input.dateOfBirth > getTodayIso()) {
    return 'Date of birth cannot be in the future.';
  }
  if (input.purchasePrice !== undefined && input.purchasePrice < 0) {
    return 'Purchase price cannot be negative.';
  }
  if (input.id && (input.damId === input.id || input.sireId === input.id)) {
    return 'An animal cannot be listed as its own mother or father.';
  }
  return null;
}

export function validateMilkEntry(input: {
  animalId: string;
  date: string;
  quantityLitres: number;
  fatPercentage?: number;
  snfPercentage?: number;
  pricePerLitre?: number;
  isCombined?: boolean;
}): string | null {
  if (!input.animalId) return 'Please select an animal.';
  if (!input.date) return 'Date is required.';
  const isCombined = input.isCombined || input.animalId === FARM_COMBINED_ANIMAL_ID;
  const maxAllowed = isCombined ? 5000 : 80;
  if (
    Number.isNaN(input.quantityLitres) ||
    input.quantityLitres <= 0 ||
    input.quantityLitres > maxAllowed
  ) {
    return `Milk quantity must be between 0.1 L and ${maxAllowed} L.`;
  }
  if (
    input.fatPercentage !== undefined &&
    (input.fatPercentage < 0.5 || input.fatPercentage > 16)
  ) {
    return 'Fat percentage must be between 0.5% and 16.0%.';
  }
  if (
    input.snfPercentage !== undefined &&
    (input.snfPercentage < 3.0 || input.snfPercentage > 15.0)
  ) {
    return 'SNF percentage must be between 3.0% and 15.0%.';
  }
  if (input.pricePerLitre !== undefined && input.pricePerLitre < 0) {
    return 'Price per litre cannot be negative.';
  }
  return null;
}

export const COW_BREEDS = [
  'Holstein Friesian (HF)',
  'HF Crossbred',
  'Jersey',
  'Jersey Crossbred',
  'Gir',
  'Sahiwal',
  'Red Sindhi',
  'Tharparkar',
  'Kankrej',
  'Rathi',
  'Khillar',
  'Deoni',
  'Desi / Indigenous',
];

export const BUFFALO_BREEDS = [
  'Murrah',
  'Graded Murrah',
  'Jaffarabadi',
  'Mehsana',
  'Pandharpuri',
  'Surti',
  'Nili-Ravi',
  'Nagpuri',
  'Marathwadi',
  'Bhadawari',
  'Indigenous Buffalo',
];

export function generateQrIdentifier(tagNumber: string, uuid: string): string {
  const cleanTag = tagNumber.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  const shortUuid = uuid.replace(/-/g, '').slice(0, 6).toUpperCase();
  return `DT-${cleanTag || 'HERD'}-${shortUuid}`;
}
