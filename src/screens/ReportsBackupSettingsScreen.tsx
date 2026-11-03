import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Cloud,
  Download,
  FileSpreadsheet,
  Fingerprint,
  History,
  Lock,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Upload,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ConflictReviewModal,
  TeamCloudAccessCard,
} from '../components/CloudSyncComponents';
import { useFarm } from '../context/FarmContext';
import { downloadCsvFile } from '../data/db';
import {
  addDaysIso,
  calculateAge,
  calculateProfitSummary,
  calculateWeightGrowth,
  computeLactationMetrics,
  formatDateTimeIndian,
  formatIndianDate,
  formatINR,
  getTodayIso,
} from '../domain/calculations';
import { requestLocalNotificationPermission, usePWAInstall } from '../hooks/usePWA';
import {
  hashPinPBKDF2,
  isPlatformBiometricAvailable,
  registerPlatformBiometric,
  verifyPinPBKDF2,
} from '../services/security';
import { AnimalStatus, FARM_COMBINED_ANIMAL_ID } from '../types/models';

type ReportDomain =
  | 'animals'
  | 'milk_production'
  | 'milk_sales'
  | 'feed_consumption'
  | 'feed_cost'
  | 'health'
  | 'medicines'
  | 'veterinary'
  | 'vaccination'
  | 'breeding'
  | 'pregnancy'
  | 'calving'
  | 'calves'
  | 'weight'
  | 'lactation'
  | 'income'
  | 'expenses'
  | 'profit';

const REPORT_DOMAINS: Array<{ id: ReportDomain; label: string; group: string }> = [
  { id: 'animals', label: 'Animals Register', group: 'Herd' },
  { id: 'calves', label: 'Calves Register', group: 'Herd' },
  { id: 'weight', label: 'Weight & Growth', group: 'Herd' },
  { id: 'lactation', label: 'Lactation Cycles', group: 'Herd' },
  { id: 'milk_production', label: 'Milk Production', group: 'Milk' },
  { id: 'milk_sales', label: 'Milk Sales', group: 'Milk' },
  { id: 'feed_consumption', label: 'Feed Consumption', group: 'Feed' },
  { id: 'feed_cost', label: 'Feed Purchases & Cost', group: 'Feed' },
  { id: 'health', label: 'Health & Treatments', group: 'Health' },
  { id: 'medicines', label: 'Medicines & Stock', group: 'Health' },
  { id: 'veterinary', label: 'Veterinary Visits', group: 'Health' },
  { id: 'vaccination', label: 'Vaccinations', group: 'Health' },
  { id: 'breeding', label: 'Heat & Breeding (AI)', group: 'Breeding' },
  { id: 'pregnancy', label: 'Pregnancy & Due Dates', group: 'Breeding' },
  { id: 'calving', label: 'Calving History', group: 'Breeding' },
  { id: 'income', label: 'Income Ledger', group: 'Finance' },
  { id: 'expenses', label: 'Expense Ledger', group: 'Finance' },
  { id: 'profit', label: 'Profit & Loss Breakdown', group: 'Finance' },
];

interface BuiltReport {
  title: string;
  kpis: Array<{ label: string; value: string }>;
  chartBars: Array<{ label: string; value: number; formatted: string }>;
  headers: string[];
  rows: Array<Array<string | number>>;
}

export const ReportsScreen: React.FC = () => {
  const {
    animals,
    milkRecords,
    milkSales,
    feedTypes,
    feedRecords,
    feedStockTransactions,
    healthRecords,
    medicines,
    veterinaryVisits,
    vaccinationRecords,
    breedingRecords,
    pregnancyRecords,
    calvingRecords,
    weightRecords,
    lactationRecords,
    incomeRecords,
    expenseRecords,
    navigate,
    notify,
  } = useFarm();

  const today = getTodayIso();
  const [domain, setDomain] = useState<ReportDomain>('milk_production');
  const [startDate, setStartDate] = useState<string>(addDaysIso(today, -29));
  const [endDate, setEndDate] = useState<string>(today);
  const [animalFilter, setAnimalFilter] = useState<string>('ALL');

  const animalMap = useMemo(() => new Map(animals.map((a) => [a.id, a])), [animals]);
  const feedMap = useMemo(() => new Map(feedTypes.map((f) => [f.id, f])), [feedTypes]);

  const applyPreset = (
    preset: number | 'TODAY' | 'THIS_MONTH' | 'THIS_YEAR' | 'ALL'
  ) => {
    if (preset === 'ALL') {
      setStartDate('2000-01-01');
      setEndDate(today);
    } else if (preset === 'TODAY') {
      setStartDate(today);
      setEndDate(today);
    } else if (preset === 'THIS_MONTH') {
      setStartDate(`${today.slice(0, 7)}-01`);
      setEndDate(today);
    } else if (preset === 'THIS_YEAR') {
      setStartDate(`${today.slice(0, 4)}-01-01`);
      setEndDate(today);
    } else {
      setStartDate(addDaysIso(today, -(preset - 1)));
      setEndDate(today);
    }
  };

  const inRange = (isoDate?: string) => {
    if (!isoDate) return true;
    return (!startDate || isoDate >= startDate) && (!endDate || isoDate <= endDate);
  };

  const matchesAnimal = (id?: string) => animalFilter === 'ALL' || id === animalFilter;

  const report: BuiltReport = useMemo(() => {
    const labelAnimal = (id?: string) => {
      if (!id) return 'Herd / Group';
      if (id === FARM_COMBINED_ANIMAL_ID) return 'Combined Herd Session';
      const a = animalMap.get(id);
      return a ? `#${a.tagNumber}${a.name ? ` (${a.name})` : ''}` : id;
    };

    switch (domain) {
      case 'animals': {
        const list = animals.filter((a) => animalFilter === 'ALL' || a.id === animalFilter);
        const byStatus: Record<string, number> = {};
        for (const a of list) {
          byStatus[a.status] = (byStatus[a.status] || 0) + 1;
        }
        return {
          title: 'Herd & Animal Register',
          kpis: [
            { label: 'Animals Listed', value: String(list.length) },
            {
              label: 'Lactating',
              value: String(list.filter((a) => a.status === AnimalStatus.LACTATING).length),
            },
            {
              label: 'Pregnant',
              value: String(list.filter((a) => a.status === AnimalStatus.PREGNANT).length),
            },
          ],
          chartBars: Object.entries(byStatus).map(([k, v]) => ({
            label: k,
            value: v,
            formatted: `${v}`,
          })),
          headers: ['Tag #', 'Name', 'Species', 'Breed', 'Gender', 'Status', 'Age', 'Shed', 'QR ID'],
          rows: list.map((a) => [
            a.tagNumber,
            a.name || '—',
            a.species,
            a.breed,
            a.gender,
            a.status,
            calculateAge(a.dateOfBirth),
            a.shedLocation || '—',
            a.qrIdentifier,
          ]),
        };
      }

      case 'milk_production': {
        const list = milkRecords
          .filter((r) => inRange(r.date) && matchesAnimal(r.animalId))
          .sort((a, b) => b.date.localeCompare(a.date));
        const totalLitres = list.reduce((s, r) => s + r.quantityLitres, 0);
        const totalVal = list.reduce((s, r) => s + (r.totalValue || 0), 0);
        const byAnimal: Record<string, number> = {};
        for (const r of list) {
          const key = labelAnimal(r.animalId);
          byAnimal[key] = (byAnimal[key] || 0) + r.quantityLitres;
        }
        const topBars = Object.entries(byAnimal)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([k, v]) => ({
            label: k,
            value: Math.round(v * 100) / 100,
            formatted: `${v.toFixed(1)} L`,
          }));
        return {
          title: 'Milk Production Report',
          kpis: [
            { label: 'Total Yield', value: `${totalLitres.toFixed(1)} L` },
            { label: 'Entries Logged', value: String(list.length) },
            { label: 'Estimated Value', value: formatINR(totalVal) },
          ],
          chartBars: topBars,
          headers: ['Date', 'Animal', 'Session', 'Quantity (L)', 'Fat %', 'SNF %', 'Rate (₹/L)', 'Value (₹)'],
          rows: list.map((r) => [
            formatIndianDate(r.date),
            labelAnimal(r.animalId),
            r.session,
            r.quantityLitres,
            r.fatPercentage ?? '—',
            r.snfPercentage ?? '—',
            r.pricePerLitre ?? '—',
            r.totalValue ?? '—',
          ]),
        };
      }

      case 'milk_sales': {
        const list = milkSales
          .filter((s) => inRange(s.date))
          .sort((a, b) => b.date.localeCompare(a.date));
        const litres = list.reduce((sum, s) => sum + s.quantityLitres, 0);
        const revenue = list.reduce((sum, s) => sum + s.totalAmount, 0);
        const pendingAmt = list
          .filter((s) => s.paymentStatus !== 'PAID')
          .reduce((sum, s) => sum + s.totalAmount, 0);
        const byCustomer: Record<string, number> = {};
        for (const s of list) {
          byCustomer[s.customerName] = (byCustomer[s.customerName] || 0) + s.totalAmount;
        }
        return {
          title: 'Milk Sales & Customer Revenue',
          kpis: [
            { label: 'Volume Sold', value: `${litres.toFixed(1)} L` },
            { label: 'Gross Sales', value: formatINR(revenue) },
            { label: 'Unpaid / Pending', value: formatINR(pendingAmt) },
          ],
          chartBars: Object.entries(byCustomer)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([k, v]) => ({ label: k, value: v, formatted: formatINR(v) })),
          headers: ['Date', 'Customer', 'Session', 'Litres (L)', 'Rate (₹/L)', 'Total (₹)', 'Payment'],
          rows: list.map((s) => [
            formatIndianDate(s.date),
            s.customerName,
            s.session,
            s.quantityLitres,
            s.pricePerLitre,
            s.totalAmount,
            s.paymentStatus,
          ]),
        };
      }

      case 'feed_consumption': {
        const list = feedRecords
          .filter((f) => inRange(f.date) && (animalFilter === 'ALL' || f.animalId === animalFilter))
          .sort((a, b) => b.date.localeCompare(a.date));
        const totalKg = list.reduce((s, r) => s + r.quantityKg, 0);
        const totalCost = list.reduce((s, r) => s + r.totalCost, 0);
        const byFeed: Record<string, number> = {};
        for (const r of list) {
          const fname = feedMap.get(r.feedTypeId)?.name || 'Feed';
          byFeed[fname] = (byFeed[fname] || 0) + r.quantityKg;
        }
        return {
          title: 'Daily Feed Ration & Consumption',
          kpis: [
            { label: 'Total Fed', value: `${totalKg.toFixed(1)} kg` },
            { label: 'Ration Value', value: formatINR(totalCost) },
            { label: 'Feedings Logged', value: String(list.length) },
          ],
          chartBars: Object.entries(byFeed).map(([k, v]) => ({
            label: k,
            value: v,
            formatted: `${v.toFixed(1)} kg`,
          })),
          headers: ['Date', 'Feed Item', 'Target Animal / Shed', 'Quantity (kg)', 'Cost/kg (₹)', 'Total (₹)'],
          rows: list.map((r) => [
            formatIndianDate(r.date),
            feedMap.get(r.feedTypeId)?.name || 'Unknown',
            r.animalId ? labelAnimal(r.animalId) : r.groupOrShed || 'Whole Herd',
            r.quantityKg,
            r.unitCostPerKg,
            r.totalCost,
          ]),
        };
      }

      case 'feed_cost': {
        const list = feedStockTransactions
          .filter((t) => inRange(t.date))
          .sort((a, b) => b.date.localeCompare(a.date));
        const purchasedKg = list
          .filter((t) => t.transactionType === 'PURCHASE')
          .reduce((s, t) => s + t.quantityKg, 0);
        const spend = list
          .filter((t) => t.transactionType === 'PURCHASE')
          .reduce((s, t) => s + t.totalCost, 0);
        const lowCount = feedTypes.filter((f) => f.currentStockKg <= f.lowStockThresholdKg).length;
        return {
          title: 'Feed Purchases & Stock Ledger',
          kpis: [
            { label: 'Purchased Qty', value: `${purchasedKg.toFixed(1)} kg` },
            { label: 'Purchase Cost', value: formatINR(spend) },
            { label: 'Low-Stock Items', value: String(lowCount) },
          ],
          chartBars: feedTypes.map((f) => ({
            label: f.name,
            value: f.currentStockKg,
            formatted: `${f.currentStockKg} kg`,
          })),
          headers: ['Date', 'Feed Type', 'Transaction', 'Quantity (kg)', 'Rate/kg (₹)', 'Total Cost (₹)', 'Supplier'],
          rows: list.map((t) => [
            formatIndianDate(t.date),
            feedMap.get(t.feedTypeId)?.name || 'Feed',
            t.transactionType,
            t.quantityKg,
            t.unitCostPerKg,
            t.totalCost,
            t.supplier || '—',
          ]),
        };
      }

      case 'health': {
        const list = healthRecords
          .filter((h) => inRange(h.date) && matchesAnimal(h.animalId))
          .sort((a, b) => b.date.localeCompare(a.date));
        const activeCases = list.filter((h) => h.status !== 'RESOLVED').length;
        const totalCost = list.reduce((s, h) => s + h.cost, 0);
        return {
          title: 'Animal Health & Treatment Log',
          kpis: [
            { label: 'Health Records', value: String(list.length) },
            { label: 'Active / Recovering', value: String(activeCases) },
            { label: 'Treatment Cost', value: formatINR(totalCost) },
          ],
          chartBars: ['SICK', 'RECOVERING', 'RESOLVED'].map((st) => {
            const count = list.filter((h) => h.status === st).length;
            return { label: st, value: count, formatted: String(count) };
          }),
          headers: ['Date', 'Animal', 'Symptoms', 'Temp (°C)', 'Medicine', 'Status', 'Cost (₹)', 'Follow-up'],
          rows: list.map((h) => [
            formatIndianDate(h.date),
            labelAnimal(h.animalId),
            h.symptoms,
            h.temperatureCelsius ?? '—',
            h.medicineName || '—',
            h.status,
            h.cost,
            formatIndianDate(h.followUpDate),
          ]),
        };
      }

      case 'medicines': {
        const lowStock = medicines.filter((m) => m.currentStock <= m.lowStockThreshold).length;
        const expiringSoon = medicines.filter(
          (m) => m.expiryDate && m.expiryDate <= addDaysIso(today, 30)
        ).length;
        const stockValue = medicines.reduce((s, m) => s + m.currentStock * m.costPerUnit, 0);
        return {
          title: 'Medicine Stock & Expiry Register',
          kpis: [
            { label: 'Medicines Tracked', value: String(medicines.length) },
            { label: 'Low Stock / Expiring', value: `${lowStock} / ${expiringSoon}` },
            { label: 'Inventory Value', value: formatINR(stockValue) },
          ],
          chartBars: medicines.slice(0, 6).map((m) => ({
            label: m.name,
            value: m.currentStock,
            formatted: `${m.currentStock} ${m.unit}`,
          })),
          headers: ['Medicine', 'Stock', 'Unit', 'Reorder At', 'Batch #', 'Expiry Date', 'Unit Cost (₹)'],
          rows: medicines.map((m) => [
            m.name,
            m.currentStock,
            m.unit,
            m.lowStockThreshold,
            m.batchNumber || '—',
            formatIndianDate(m.expiryDate),
            m.costPerUnit,
          ]),
        };
      }

      case 'veterinary': {
        const list = veterinaryVisits
          .filter((v) => inRange(v.visitDate) && (animalFilter === 'ALL' || v.animalId === animalFilter))
          .sort((a, b) => b.visitDate.localeCompare(a.visitDate));
        const fees = list.reduce((s, v) => s + v.cost, 0);
        return {
          title: 'Veterinary Visits Register',
          kpis: [
            { label: 'Total Visits', value: String(list.length) },
            { label: 'Total Vet Fees', value: formatINR(fees) },
            {
              label: 'Upcoming Follow-ups',
              value: String(list.filter((v) => v.followUpDate && v.followUpDate >= today).length),
            },
          ],
          chartBars: [],
          headers: ['Visit Date', 'Animal', 'Veterinarian', 'Reason', 'Treatment', 'Fee (₹)', 'Follow-up'],
          rows: list.map((v) => [
            formatIndianDate(v.visitDate),
            v.animalId ? labelAnimal(v.animalId) : 'General Herd',
            v.veterinarianName,
            v.reason,
            v.treatment || '—',
            v.cost,
            formatIndianDate(v.followUpDate),
          ]),
        };
      }

      case 'vaccination': {
        const list = vaccinationRecords
          .filter((v) => inRange(v.administeredDate) && matchesAnimal(v.animalId))
          .sort((a, b) => b.administeredDate.localeCompare(a.administeredDate));
        const cost = list.reduce((s, v) => s + v.cost, 0);
        const dueSoon = vaccinationRecords.filter(
          (v) => v.dueDate && v.dueDate <= addDaysIso(today, 14)
        ).length;
        return {
          title: 'Vaccination Compliance Register',
          kpis: [
            { label: 'Doses Recorded', value: String(list.length) },
            { label: 'Due Within 14d', value: String(dueSoon) },
            { label: 'Vaccine Spend', value: formatINR(cost) },
          ],
          chartBars: [],
          headers: ['Given Date', 'Animal', 'Vaccine', 'Next Due Date', 'Batch #', 'Veterinarian', 'Cost (₹)'],
          rows: list.map((v) => [
            formatIndianDate(v.administeredDate),
            labelAnimal(v.animalId),
            v.vaccineName,
            formatIndianDate(v.dueDate),
            v.batchNumber || '—',
            v.veterinarian || '—',
            v.cost,
          ]),
        };
      }

      case 'breeding': {
        const list = breedingRecords
          .filter((b) => inRange(b.breedingDate) && matchesAnimal(b.animalId))
          .sort((a, b) => b.breedingDate.localeCompare(a.breedingDate));
        const aiCount = list.filter((b) => b.method === 'AI').length;
        const spend = list.reduce((s, b) => s + b.cost, 0);
        return {
          title: 'Heat & Artificial Insemination Register',
          kpis: [
            { label: 'Breeding Attempts', value: String(list.length) },
            { label: 'AI vs Natural', value: `${aiCount} AI / ${list.length - aiCount} Nat` },
            { label: 'Breeding Cost', value: formatINR(spend) },
          ],
          chartBars: [],
          headers: ['Breeding Date', 'Animal', 'Heat Date', 'Method', 'Straw / Bull ID', 'Attempt #', 'Technician', 'Cost (₹)'],
          rows: list.map((b) => [
            formatIndianDate(b.breedingDate),
            labelAnimal(b.animalId),
            formatIndianDate(b.heatDate),
            b.method,
            b.semenOrBullId,
            b.attemptNumber,
            b.technician || '—',
            b.cost,
          ]),
        };
      }

      case 'pregnancy': {
        const list = pregnancyRecords
          .filter((p) => matchesAnimal(p.animalId))
          .sort((a, b) => a.expectedCalvingDate.localeCompare(b.expectedCalvingDate));
        const confirmed = list.filter((p) => p.status === 'CONFIRMED').length;
        return {
          title: 'Pregnancy & Expected Calving Schedule',
          kpis: [
            { label: 'Confirmed Pregnant', value: String(confirmed) },
            { label: 'Total Checks', value: String(list.length) },
            {
              label: 'Due Within 30d',
              value: String(
                list.filter(
                  (p) =>
                    p.status === 'CONFIRMED' &&
                    p.expectedCalvingDate >= today &&
                    p.expectedCalvingDate <= addDaysIso(today, 30)
                ).length
              ),
            },
          ],
          chartBars: [],
          headers: ['Animal', 'Check Date', 'Status', 'Gestation Days', 'Expected Dry-Off', 'Expected Calving'],
          rows: list.map((p) => [
            labelAnimal(p.animalId),
            formatIndianDate(p.confirmationDate),
            p.status,
            p.gestationDaysUsed,
            formatIndianDate(p.expectedDryOffDate),
            formatIndianDate(p.expectedCalvingDate),
          ]),
        };
      }

      case 'calving': {
        const list = calvingRecords
          .filter((c) => inRange(c.calvingDate) && matchesAnimal(c.motherId))
          .sort((a, b) => b.calvingDate.localeCompare(a.calvingDate));
        const totalCalves = list.reduce((s, c) => s + c.calfCount, 0);
        return {
          title: 'Calving Events Register',
          kpis: [
            { label: 'Calving Events', value: String(list.length) },
            { label: 'Calves Born', value: String(totalCalves) },
            {
              label: 'With Complications',
              value: String(list.filter((c) => !!c.complications).length),
            },
          ],
          chartBars: [],
          headers: ['Calving Date', 'Mother (Dam)', 'Calves Born', 'Complications', 'Observations'],
          rows: list.map((c) => [
            formatIndianDate(c.calvingDate),
            labelAnimal(c.motherId),
            c.calfCount,
            c.complications || 'None',
            c.observations || '—',
          ]),
        };
      }

      case 'calves': {
        const calves = animals.filter(
          (a) =>
            (a.status === AnimalStatus.CALF || !!a.damId) &&
            (animalFilter === 'ALL' || a.id === animalFilter || a.damId === animalFilter)
        );
        return {
          title: 'Calves & Lineage Register',
          kpis: [
            { label: 'Registered Calves', value: String(calves.length) },
            {
              label: 'Female Calves',
              value: String(calves.filter((c) => c.gender === 'FEMALE').length),
            },
            {
              label: 'Male Calves',
              value: String(calves.filter((c) => c.gender === 'MALE').length),
            },
          ],
          chartBars: [],
          headers: ['Tag #', 'Name', 'Gender', 'DOB', 'Age', 'Mother (Dam)', 'Latest Weight (kg)'],
          rows: calves.map((c) => {
            const growth = calculateWeightGrowth(
              weightRecords.filter((w) => w.animalId === c.id)
            );
            return [
              c.tagNumber,
              c.name || '—',
              c.gender,
              formatIndianDate(c.dateOfBirth),
              calculateAge(c.dateOfBirth),
              c.damId ? labelAnimal(c.damId) : '—',
              growth.latestKg ?? '—',
            ];
          }),
        };
      }

      case 'weight': {
        const list = weightRecords
          .filter((w) => inRange(w.date) && matchesAnimal(w.animalId))
          .sort((a, b) => b.date.localeCompare(a.date));
        const avgWeight =
          list.length > 0
            ? Math.round((list.reduce((s, w) => s + w.weightKg, 0) / list.length) * 10) / 10
            : 0;
        return {
          title: 'Body Weight & Growth Log',
          kpis: [
            { label: 'Weighings', value: String(list.length) },
            { label: 'Mean Weight', value: list.length > 0 ? `${avgWeight} kg` : '—' },
            {
              label: 'Animals Weighed',
              value: String(new Set(list.map((w) => w.animalId)).size),
            },
          ],
          chartBars: list.slice(0, 6).map((w) => ({
            label: `${labelAnimal(w.animalId)} (${formatIndianDate(w.date)})`,
            value: w.weightKg,
            formatted: `${w.weightKg} kg`,
          })),
          headers: ['Date', 'Animal', 'Weight (kg)', 'Notes'],
          rows: list.map((w) => [
            formatIndianDate(w.date),
            labelAnimal(w.animalId),
            w.weightKg,
            w.notes || '—',
          ]),
        };
      }

      case 'lactation': {
        const list = lactationRecords.filter((l) => matchesAnimal(l.animalId));
        return {
          title: 'Lactation Performance & Dry Periods',
          kpis: [
            { label: 'Cycles Tracked', value: String(list.length) },
            {
              label: 'Active Cycles',
              value: String(list.filter((l) => l.status === 'ACTIVE').length),
            },
            {
              label: 'In Dry Period',
              value: String(list.filter((l) => l.status === 'DRY_PERIOD').length),
            },
          ],
          chartBars: list.slice(0, 6).map((l) => {
            const m = computeLactationMetrics(
              l,
              milkRecords.filter((r) => r.animalId === l.animalId)
            );
            return {
              label: `${labelAnimal(l.animalId)} L#${l.lactationNumber}`,
              value: m.calculatedProductionLitres,
              formatted: `${m.calculatedProductionLitres} L`,
            };
          }),
          headers: ['Animal', 'Lactation #', 'Start Date', 'Days in Milk', 'Yield (L)', 'Peak (L/d)', 'Dry Days', 'Status'],
          rows: list.map((l) => {
            const m = computeLactationMetrics(
              l,
              milkRecords.filter((r) => r.animalId === l.animalId)
            );
            return [
              labelAnimal(l.animalId),
              l.lactationNumber,
              formatIndianDate(l.startDate),
              m.daysInMilk,
              m.calculatedProductionLitres,
              m.peakDailyLitres,
              m.dryPeriodDays ?? '—',
              l.status,
            ];
          }),
        };
      }

      case 'income': {
        const list = incomeRecords
          .filter((i) => inRange(i.date) && (animalFilter === 'ALL' || i.animalId === animalFilter))
          .sort((a, b) => b.date.localeCompare(a.date));
        const sum = list.reduce((s, i) => s + i.amount, 0);
        const byCat: Record<string, number> = {};
        for (const i of list) byCat[i.category] = (byCat[i.category] || 0) + i.amount;
        return {
          title: 'Farm Income Report',
          kpis: [
            { label: 'Total Income', value: formatINR(sum) },
            { label: 'Entries', value: String(list.length) },
            {
              label: 'Milk Share',
              value: formatINR(byCat['MILK_SALES'] || 0),
            },
          ],
          chartBars: Object.entries(byCat).map(([k, v]) => ({
            label: k,
            value: v,
            formatted: formatINR(v),
          })),
          headers: ['Date', 'Category', 'Description', 'Linked Animal', 'Amount (₹)'],
          rows: list.map((i) => [
            formatIndianDate(i.date),
            i.category,
            i.description,
            i.animalId ? labelAnimal(i.animalId) : '—',
            i.amount,
          ]),
        };
      }

      case 'expenses': {
        const list = expenseRecords
          .filter((e) => inRange(e.date) && (animalFilter === 'ALL' || e.animalId === animalFilter))
          .sort((a, b) => b.date.localeCompare(a.date));
        const sum = list.reduce((s, e) => s + e.amount, 0);
        const byCat: Record<string, number> = {};
        for (const e of list) byCat[e.category] = (byCat[e.category] || 0) + e.amount;
        return {
          title: 'Farm Expenses Report',
          kpis: [
            { label: 'Total Expenses', value: formatINR(sum) },
            { label: 'Entries', value: String(list.length) },
            { label: 'Feed Spend', value: formatINR(byCat['FEED'] || 0) },
          ],
          chartBars: Object.entries(byCat)
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => ({ label: k, value: v, formatted: formatINR(v) })),
          headers: ['Date', 'Category', 'Description', 'Linked Animal', 'Amount (₹)'],
          rows: list.map((e) => [
            formatIndianDate(e.date),
            e.category,
            e.description,
            e.animalId ? labelAnimal(e.animalId) : '—',
            e.amount,
          ]),
        };
      }

      case 'profit': {
        const p = calculateProfitSummary(incomeRecords, expenseRecords, startDate, endDate);
        const catRows: Array<Array<string | number>> = [
          ...Object.entries(p.incomeByCategory).map(([cat, amt]) => ['INCOME', cat, amt]),
          ...Object.entries(p.expenseByCategory).map(([cat, amt]) => ['EXPENSE', cat, amt]),
        ];
        return {
          title: 'Profit & Loss Analytics',
          kpis: [
            { label: 'Total Income', value: formatINR(p.totalIncome) },
            { label: 'Total Expenses', value: formatINR(p.totalExpenses) },
            { label: 'Net Profit / Loss', value: formatINR(p.netProfit) },
          ],
          chartBars: [
            { label: 'Total Income', value: p.totalIncome, formatted: formatINR(p.totalIncome) },
            {
              label: 'Total Expenses',
              value: p.totalExpenses,
              formatted: formatINR(p.totalExpenses),
            },
          ],
          headers: ['Type', 'Category', 'Amount (₹)'],
          rows: catRows,
        };
      }
    }
  }, [
    domain,
    animals,
    animalFilter,
    animalMap,
    feedMap,
    milkRecords,
    milkSales,
    feedRecords,
    feedStockTransactions,
    feedTypes,
    healthRecords,
    medicines,
    veterinaryVisits,
    vaccinationRecords,
    breedingRecords,
    pregnancyRecords,
    calvingRecords,
    weightRecords,
    lactationRecords,
    incomeRecords,
    expenseRecords,
    startDate,
    endDate,
    today,
  ]);

  const maxBar = useMemo(
    () => Math.max(1, ...report.chartBars.map((b) => b.value)),
    [report.chartBars]
  );

  const handleExportCsv = () => {
    if (report.rows.length === 0) {
      notify('No records in the current filter range to export.', 'info');
      return;
    }
    const filename = `DairyTrack_${domain}_${startDate}_to_${endDate}.csv`;
    downloadCsvFile(filename, report.headers, report.rows);
    notify(`Exported ${report.rows.length} rows to CSV`, 'success');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate({ name: 'more' })}
            aria-label="Back to More"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-stone-900">Reports & Analytics</h1>
            <p className="text-xs text-stone-600">
              18 real-time farm registers computed directly from offline storage · CSV export ready
            </p>
          </div>
        </div>

        <button
          onClick={handleExportCsv}
          className="flex min-h-[46px] items-center gap-2 rounded-xl bg-[#1B4D3E] px-4 text-sm font-semibold text-white hover:bg-[#153D31] whitespace-nowrap"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {/* Filters Card */}
      <div className="rounded-2xl border border-stone-200/90 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-xs font-semibold text-stone-700">Report Register</label>
            <select
              value={domain}
              onChange={(e) => setDomain(e.target.value as ReportDomain)}
              className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 bg-white px-3 text-sm font-medium focus:border-[#1B4D3E] focus:outline-none"
            >
              {REPORT_DOMAINS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.group}: {d.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700">From Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3 text-sm font-mono tabular-nums focus:border-[#1B4D3E] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700">To Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3 text-sm font-mono tabular-nums focus:border-[#1B4D3E] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700">Filter by Animal</label>
            <select
              value={animalFilter}
              onChange={(e) => setAnimalFilter(e.target.value)}
              className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 bg-white px-3 text-sm focus:border-[#1B4D3E] focus:outline-none"
            >
              <option value="ALL">All Farm Animals</option>
              {animals.map((a) => (
                <option key={a.id} value={a.id}>
                  Tag #{a.tagNumber} {a.name ? `(${a.name})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 border-t border-stone-100 pt-3">
          {[
            { label: 'Today', preset: 'TODAY' as const },
            { label: 'Last 7 Days', preset: 7 as const },
            { label: 'This Month', preset: 'THIS_MONTH' as const },
            { label: 'Last 30 Days', preset: 30 as const },
            { label: 'This Year', preset: 'THIS_YEAR' as const },
            { label: 'All Time', preset: 'ALL' as const },
          ].map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => applyPreset(p.preset)}
              className="min-h-[38px] rounded-lg border border-stone-200 px-3 text-xs font-semibold text-stone-700 hover:bg-stone-100"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {report.kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-2xl border border-stone-200/90 bg-white p-4"
          >
            <p className="text-xs font-medium text-stone-500">{kpi.label}</p>
            <p className="mt-1 font-mono text-2xl font-bold text-stone-900 tabular-nums">
              {kpi.value}
            </p>
          </div>
        ))}
      </div>

      {/* Visual Breakdown Bars (only rendered when real records exist) */}
      {report.chartBars.length > 0 && report.rows.length > 0 && (
        <div className="rounded-2xl border border-stone-200/90 bg-white p-5">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-[#1B4D3E]" />
            <h2 className="text-sm font-bold text-stone-900">Breakdown — {report.title}</h2>
          </div>
          <div className="mt-4 space-y-3">
            {report.chartBars.map((bar) => {
              const pct = Math.max(4, Math.round((bar.value / maxBar) * 100));
              return (
                <div key={bar.label}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-stone-800">{bar.label}</span>
                    <span className="font-mono font-semibold text-stone-900 tabular-nums">
                      {bar.formatted}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-md bg-stone-100">
                    <div
                      className="h-full rounded-md bg-[#1B4D3E]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Register Data Table */}
      <div className="overflow-hidden rounded-2xl border border-stone-200/90 bg-white">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3.5">
          <h2 className="text-sm font-bold text-stone-900">{report.title}</h2>
          <span className="font-mono text-xs text-stone-500 tabular-nums">
            {report.rows.length} record{report.rows.length === 1 ? '' : 's'}
          </span>
        </div>

        {report.rows.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-semibold text-stone-800">
              No records found for this filter range
            </p>
            <p className="mt-1 text-xs text-stone-500">
              DairyTrack never displays synthetic statistics. Log real farm entries or widen the date range above.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50 text-xs font-semibold text-stone-600">
                  {report.headers.map((h) => (
                    <th key={h} className="px-4 py-3 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {report.rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-stone-50/70">
                    {row.map((cell, cIdx) => (
                      <td
                        key={cIdx}
                        className={`px-4 py-3 text-stone-800 whitespace-nowrap ${
                          typeof cell === 'number' ? 'font-mono tabular-nums' : ''
                        }`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export const BackupRestoreScreen: React.FC = () => {
  const {
    preferences,
    animals,
    milkRecords,
    milkSales,
    feedTypes,
    feedRecords,
    healthRecords,
    medicines,
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
    safetyBackups,
    cloudBackups,
    syncState,
    canAdministerFarm,
    exportBackup,
    importBackup,
    rollbackSafetyBackup,
    refreshCloudBackups,
    createCloudBackup,
    restoreFromCloudBackup,
    navigate,
    notify,
  } = useFarm();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [rawBackupText, setRawBackupText] = useState<string | null>(null);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [cloudLabel, setCloudLabel] = useState('');
  const [confirmSafetyId, setConfirmSafetyId] = useState<string | null>(null);
  const [confirmCloudRestoreId, setConfirmCloudRestoreId] = useState<string | null>(null);

  const totalLocalRecords =
    animals.length +
    milkRecords.length +
    milkSales.length +
    feedTypes.length +
    feedRecords.length +
    healthRecords.length +
    medicines.length +
    veterinaryVisits.length +
    vaccinationRecords.length +
    breedingRecords.length +
    pregnancyRecords.length +
    calvingRecords.length +
    weightRecords.length +
    lactationRecords.length +
    incomeRecords.length +
    expenseRecords.length +
    employees.length +
    farmTasks.length;

  const handleDownloadJsonBackup = async () => {
    try {
      setBusy(true);
      const json = await exportBackup();
      const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `DairyTrack_Backup_${getTodayIso()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      notify('Full SHA-256 verified JSON backup downloaded to your phone.', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Backup export failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setSelectedFileName(file.name);
    setRawBackupText(text);
    setConfirmOverwrite(false);
  };

  const handleRunRestore = async () => {
    if (!rawBackupText || !confirmOverwrite) return;
    try {
      setBusy(true);
      const res = await importBackup(rawBackupText);
      setRawBackupText(null);
      setSelectedFileName(null);
      setConfirmOverwrite(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      notify(`Restored ${res.restoredRecords} records after SHA-256 verification.`, 'success');
    } catch (err) {
      notify(
        err instanceof Error ? err.message : 'Backup file failed validation; existing data preserved.',
        'error'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate({ name: 'more' })}
          aria-label="Back to More"
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-stone-900">Backup, Restore & Data Portability</h1>
          <p className="text-xs text-stone-600">
            100% offline JSON vault snapshots with SHA-256 checksum protection + spreadsheet CSV exports
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Local JSON Backup */}
        <div className="rounded-2xl border border-stone-200/90 bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-stone-900">Create Local JSON Backup</h2>
              <p className="mt-1 text-xs text-stone-600">
                Exports all 24 local database tables (including animal photos, milk, breeding, health, and finance) into a single checksum-verified JSON file on your phone.
              </p>
            </div>
            <ShieldCheck className="h-6 w-6 shrink-0 text-[#1B4D3E]" />
          </div>

          <div className="mt-4 border-y border-stone-100 py-3 text-xs text-stone-700 space-y-1">
            <p>
              Active records in local database:{' '}
              <span className="font-mono font-bold text-stone-900 tabular-nums">
                {totalLocalRecords}
              </span>
            </p>
            <p>
              Last local backup:{' '}
              <span className="font-mono font-semibold text-stone-900 tabular-nums">
                {preferences.lastLocalBackupAt
                  ? formatDateTimeIndian(preferences.lastLocalBackupAt)
                  : 'Never backed up yet'}
              </span>
            </p>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={handleDownloadJsonBackup}
            className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#1B4D3E] px-4 text-sm font-semibold text-white hover:bg-[#153D31] disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Download Full JSON Backup
          </button>
        </div>

        {/* Restore from Local JSON (Administrator Only) */}
        <div className="rounded-2xl border border-stone-200/90 bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-stone-900">Restore from JSON Backup</h2>
              <p className="mt-1 text-xs text-stone-600">
                Validates schema version and SHA-256 integrity hash before touching your current local database. Corrupted files are safely rejected.
              </p>
            </div>
            <Upload className="h-6 w-6 shrink-0 text-amber-700" />
          </div>

          {!canAdministerFarm ? (
            <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-3.5 text-xs text-stone-700">
              <p className="font-semibold text-stone-900">Administrator Permission Required</p>
              <p className="mt-0.5">
                Restore operations are restricted to the Farm Administrator to protect shared three-user farm history. You can still download local JSON and CSV backups at any time.
              </p>
            </div>
          ) : (
            <>
              <div className="mt-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileSelected}
                  className="block w-full text-xs text-stone-600 file:mr-3 file:min-h-[44px] file:rounded-xl file:border file:border-stone-300 file:bg-stone-50 file:px-4 file:text-xs file:font-semibold file:text-stone-800 hover:file:bg-stone-100"
                />
              </div>

              {selectedFileName && (
                <div className="mt-4 space-y-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5">
                  <p className="text-xs font-semibold text-amber-950">
                    Selected file: <span className="font-mono">{selectedFileName}</span>
                  </p>
                  <label className="flex items-start gap-2.5 text-xs text-amber-950">
                    <input
                      type="checkbox"
                      checked={confirmOverwrite}
                      onChange={(e) => setConfirmOverwrite(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-[#1B4D3E]"
                    />
                    <span>
                      I confirm replacing current farm records with this verified DairyTrack backup and syncing it to the shared farm.
                    </span>
                  </label>
                  <button
                    type="button"
                    disabled={!confirmOverwrite || busy}
                    onClick={handleRunRestore}
                    className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-amber-800 px-4 text-sm font-semibold text-white hover:bg-amber-900 disabled:opacity-40"
                  >
                    Verify Checksum & Restore Now
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Quick CSV Exports */}
      <div className="rounded-2xl border border-stone-200/90 bg-white p-5">
        <h2 className="text-base font-bold text-stone-900">One-Tap Spreadsheet (CSV) Exports</h2>
        <p className="mt-1 text-xs text-stone-600">
          Open directly in Excel, Google Sheets, or share with your accountant or veterinarian.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <button
            type="button"
            onClick={() => {
              downloadCsvFile(
                `DairyTrack_Animals_${getTodayIso()}.csv`,
                ['Tag', 'Name', 'Species', 'Breed', 'Gender', 'Status', 'DOB', 'QR_ID'],
                animals.map((a) => [
                  a.tagNumber,
                  a.name || '',
                  a.species,
                  a.breed,
                  a.gender,
                  a.status,
                  a.dateOfBirth || '',
                  a.qrIdentifier,
                ])
              );
              notify('Animals CSV downloaded', 'success');
            }}
            className="flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-stone-300 px-3.5 text-xs font-semibold text-stone-800 hover:bg-stone-50"
          >
            <FileSpreadsheet className="h-4 w-4 text-[#1B4D3E]" />
            Animals CSV ({animals.length})
          </button>

          <button
            type="button"
            onClick={() => {
              downloadCsvFile(
                `DairyTrack_Milk_${getTodayIso()}.csv`,
                ['Date', 'Source', 'Session', 'Litres', 'Fat%', 'SNF%', 'Rate', 'Value'],
                milkRecords.map((m) => [
                  m.date,
                  m.animalId === FARM_COMBINED_ANIMAL_ID ? 'Combined Herd Session' : m.animalId,
                  m.session,
                  m.quantityLitres,
                  m.fatPercentage ?? '',
                  m.snfPercentage ?? '',
                  m.pricePerLitre ?? '',
                  m.totalValue ?? '',
                ])
              );
              notify('Milk Production CSV downloaded', 'success');
            }}
            className="flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-stone-300 px-3.5 text-xs font-semibold text-stone-800 hover:bg-stone-50"
          >
            <FileSpreadsheet className="h-4 w-4 text-[#1B4D3E]" />
            Milk Yield CSV ({milkRecords.length})
          </button>

          <button
            type="button"
            onClick={() => {
              downloadCsvFile(
                `DairyTrack_Sales_${getTodayIso()}.csv`,
                ['Date', 'Customer', 'Session', 'Litres', 'Rate', 'Total', 'PaymentStatus'],
                milkSales.map((s) => [
                  s.date,
                  s.customerName,
                  s.session,
                  s.quantityLitres,
                  s.pricePerLitre,
                  s.totalAmount,
                  s.paymentStatus,
                ])
              );
              notify('Milk Sales CSV downloaded', 'success');
            }}
            className="flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-stone-300 px-3.5 text-xs font-semibold text-stone-800 hover:bg-stone-50"
          >
            <FileSpreadsheet className="h-4 w-4 text-[#1B4D3E]" />
            Milk Sales CSV ({milkSales.length})
          </button>

          <button
            type="button"
            onClick={() => {
              downloadCsvFile(
                `DairyTrack_Finance_${getTodayIso()}.csv`,
                ['Type', 'Date', 'Category', 'Description', 'Amount_INR'],
                [
                  ...incomeRecords.map((i) => ['INCOME', i.date, i.category, i.description, i.amount]),
                  ...expenseRecords.map((e) => ['EXPENSE', e.date, e.category, e.description, e.amount]),
                ]
              );
              notify('Finance Ledger CSV downloaded', 'success');
            }}
            className="flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-stone-300 px-3.5 text-xs font-semibold text-stone-800 hover:bg-stone-50"
          >
            <FileSpreadsheet className="h-4 w-4 text-[#1B4D3E]" />
            Finance CSV ({incomeRecords.length + expenseRecords.length})
          </button>
        </div>
      </div>

      {/* Pre-Restore Automatic Safety Backups */}
      <div className="rounded-2xl border border-stone-200/90 bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-[#1B4D3E]" />
              <h2 className="text-base font-bold text-stone-900">
                Pre-Restore Automatic Safety Backups
              </h2>
            </div>
            <p className="mt-1 text-xs text-stone-600">
              Before any local JSON or cloud snapshot restore runs, DairyTrack automatically saves a full local safety snapshot on this phone so no farm data can be accidentally lost.
            </p>
          </div>
          <span className="font-mono text-xs text-stone-500 tabular-nums">
            {safetyBackups.length} saved
          </span>
        </div>

        {safetyBackups.length === 0 ? (
          <p className="mt-3 text-xs text-stone-500">
            No restore operations have been run on this device yet. A safety backup will be created automatically before your first restore.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-stone-100">
            {safetyBackups.map((sb) => (
              <li
                key={sb.id}
                className="flex flex-col gap-2.5 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-semibold text-stone-900">{sb.reason}</p>
                  <p className="mt-0.5 font-mono text-xs text-stone-500 tabular-nums">
                    {formatDateTimeIndian(sb.createdAt)} · {sb.recordCount} records preserved
                  </p>
                </div>

                {canAdministerFarm && (
                  <div className="flex flex-wrap items-center gap-2">
                    {confirmSafetyId === sb.id ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={async () => {
                            try {
                              setBusy(true);
                              const res = await rollbackSafetyBackup(sb.id);
                              setConfirmSafetyId(null);
                              notify(
                                `Rolled back ${res.restoredRecords} records from safety snapshot.`,
                                'success'
                              );
                            } catch (err) {
                              notify(
                                err instanceof Error ? err.message : 'Safety rollback failed.',
                                'error'
                              );
                            } finally {
                              setBusy(false);
                            }
                          }}
                          className="min-h-[40px] rounded-xl bg-amber-800 px-3.5 text-xs font-semibold text-white hover:bg-amber-900 disabled:opacity-50"
                        >
                          Confirm Rollback
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmSafetyId(null)}
                          className="min-h-[40px] rounded-xl border border-stone-300 px-3 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmSafetyId(sb.id)}
                        className="flex min-h-[40px] items-center gap-1.5 rounded-xl border border-stone-300 px-3.5 text-xs font-semibold text-stone-800 hover:bg-stone-50"
                      >
                        <RotateCcw className="h-3.5 w-3.5 text-[#1B4D3E]" />
                        Rollback
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Optional Cloud Backup Vault (Administrator Only, Separate from Live Sync) */}
      {syncState.role === 'ADMIN' && (
        <div className="rounded-2xl border border-stone-200/90 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Cloud className="h-4 w-4 text-[#1B4D3E]" />
                <h2 className="text-base font-bold text-stone-900">
                  Optional Cloud Backup Vault (Administrator Only)
                </h2>
              </div>
              <p className="mt-1 text-xs text-stone-600">
                Point-in-time SHA-256 cloud snapshots stored separately from live two-way Firestore synchronization for disaster recovery.
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => refreshCloudBackups()}
              className="flex min-h-[40px] items-center gap-1.5 rounded-xl border border-stone-300 px-3 text-xs font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh Vault
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
            <input
              type="text"
              value={cloudLabel}
              onChange={(e) => setCloudLabel(e.target.value)}
              placeholder={`Snapshot label (e.g. Month-end ${getTodayIso()})`}
              className="min-h-[46px] flex-1 rounded-xl border border-stone-300 px-3.5 text-sm focus:border-[#1B4D3E] focus:outline-none"
            />
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                try {
                  setBusy(true);
                  const label = cloudLabel.trim() || `Snapshot ${getTodayIso()}`;
                  await createCloudBackup(label);
                  setCloudLabel('');
                  notify('Verified cloud backup snapshot saved to vault.', 'success');
                } catch (err) {
                  notify(
                    err instanceof Error ? err.message : 'Cloud backup snapshot failed.',
                    'error'
                  );
                } finally {
                  setBusy(false);
                }
              }}
              className="min-h-[46px] shrink-0 rounded-xl bg-[#1B4D3E] px-5 text-sm font-semibold text-white hover:bg-[#153D31] disabled:opacity-50 whitespace-nowrap"
            >
              Create Cloud Snapshot
            </button>
          </div>

          {cloudBackups.length === 0 ? (
            <p className="mt-4 text-xs text-stone-500">
              No optional cloud snapshots created yet. Live two-way synchronization continues automatically in the background.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-stone-100">
              {cloudBackups.map((cb) => (
                <li
                  key={cb.backupId}
                  className="flex flex-col gap-2.5 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold text-stone-900">{cb.label}</p>
                    <p className="mt-0.5 font-mono text-xs text-stone-500 tabular-nums">
                      {formatDateTimeIndian(cb.createdAtMs)} · {cb.recordCount} records · SHA-256{' '}
                      {cb.checksumSha256.slice(0, 10)}…
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {confirmCloudRestoreId === cb.backupId ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={async () => {
                            try {
                              setBusy(true);
                              const res = await restoreFromCloudBackup(cb.backupId);
                              setConfirmCloudRestoreId(null);
                              notify(
                                `Restored ${res.restoredRecords} records from cloud snapshot (pre-restore safety backup saved locally).`,
                                'success'
                              );
                            } catch (err) {
                              notify(
                                err instanceof Error
                                  ? err.message
                                  : 'Cloud snapshot restore failed.',
                                'error'
                              );
                            } finally {
                              setBusy(false);
                            }
                          }}
                          className="min-h-[40px] rounded-xl bg-amber-800 px-3.5 text-xs font-semibold text-white hover:bg-amber-900 disabled:opacity-50"
                        >
                          Confirm Cloud Restore
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmCloudRestoreId(null)}
                          className="min-h-[40px] rounded-xl border border-stone-300 px-3 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmCloudRestoreId(cb.backupId)}
                        className="min-h-[40px] rounded-xl border border-stone-300 px-3.5 text-xs font-semibold text-stone-800 hover:bg-stone-50"
                      >
                        Restore Snapshot
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Three-User Cloud Synchronization & Team Access */}
      <TeamCloudAccessCard onOpenConflicts={() => setConflictsOpen(true)} />

      <ConflictReviewModal
        open={conflictsOpen}
        onClose={() => setConflictsOpen(false)}
      />
    </div>
  );
};

export const SettingsScreen: React.FC = () => {
  const {
    settings,
    preferences,
    canAdministerFarm,
    saveSettings,
    savePreferences,
    lockAppNow,
    navigate,
    notify,
  } = useFarm();

  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [conflictsOpen, setConflictsOpen] = useState(false);

  // Farm Settings Form State
  const [farmName, setFarmName] = useState(settings.farmName);
  const [ownerName, setOwnerName] = useState(settings.ownerName);
  const [phone, setPhone] = useState(settings.phone);
  const [address, setAddress] = useState(settings.address);
  const [defaultRate, setDefaultRate] = useState(String(settings.defaultMilkRatePerLitre));
  const [enableAfternoon, setEnableAfternoon] = useState(settings.enableAfternoonSession);
  const [gestationCow, setGestationCow] = useState(String(settings.gestationDaysCow));
  const [gestationBuffalo, setGestationBuffalo] = useState(String(settings.gestationDaysBuffalo));
  const [notificationsEnabled, setNotificationsEnabled] = useState(settings.notificationsEnabled);

  useEffect(() => {
    setFarmName(settings.farmName);
    setOwnerName(settings.ownerName);
    setPhone(settings.phone);
    setAddress(settings.address);
    setDefaultRate(String(settings.defaultMilkRatePerLitre));
    setEnableAfternoon(settings.enableAfternoonSession);
    setGestationCow(String(settings.gestationDaysCow));
    setGestationBuffalo(String(settings.gestationDaysBuffalo));
    setNotificationsEnabled(settings.notificationsEnabled);
  }, [settings]);

  // PIN Security State
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [biometricSupported, setBiometricSupported] = useState(false);

  useEffect(() => {
    isPlatformBiometricAvailable().then(setBiometricSupported);
  }, []);

  const handleSaveFarmSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!farmName.trim()) {
      notify('Farm name is required.', 'error');
      return;
    }
    const rate = Number(defaultRate);
    const cowDays = Number(gestationCow);
    const bufDays = Number(gestationBuffalo);
    if (Number.isNaN(rate) || rate < 0) {
      notify('Default milk rate must be 0 or higher.', 'error');
      return;
    }
    if (cowDays < 250 || cowDays > 320 || bufDays < 280 || bufDays > 340) {
      notify('Enter realistic gestation days (Cow ~283d, Buffalo ~310d).', 'error');
      return;
    }

    let finalNotif = notificationsEnabled;
    if (notificationsEnabled) {
      const perm = await requestLocalNotificationPermission();
      if (perm === 'denied') {
        finalNotif = false;
        notify('Browser notification permission is blocked in device settings.', 'info');
      }
    }

    await saveSettings({
      farmName: farmName.trim(),
      ownerName: ownerName.trim(),
      phone: phone.trim(),
      address: address.trim(),
      defaultMilkRatePerLitre: rate,
      enableAfternoonSession: enableAfternoon,
      gestationDaysCow: cowDays,
      gestationDaysBuffalo: bufDays,
      notificationsEnabled: finalNotif,
    });
    notify('Farm settings saved offline', 'success');
  };

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (preferences.pinEnabled && preferences.pinHash && preferences.pinSalt) {
      const validOld = await verifyPinPBKDF2(currentPin, preferences.pinHash, preferences.pinSalt);
      if (!validOld) {
        notify('Current PIN is incorrect.', 'error');
        return;
      }
    }
    if (!/^\d{4,6}$/.test(newPin)) {
      notify('New PIN must be 4 to 6 digits.', 'error');
      return;
    }
    if (newPin !== confirmPin) {
      notify('New PIN and confirmation do not match.', 'error');
      return;
    }
    const { hashHex, saltHex } = await hashPinPBKDF2(newPin);
    await savePreferences({
      pinEnabled: true,
      pinHash: hashHex,
      pinSalt: saltHex,
    });
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    notify('Offline App PIN enabled', 'success');
  };

  const handleDisablePin = async () => {
    if (!preferences.pinHash || !preferences.pinSalt) return;
    const validOld = await verifyPinPBKDF2(currentPin, preferences.pinHash, preferences.pinSalt);
    if (!validOld) {
      notify('Enter your current PIN first to disable App Lock.', 'error');
      return;
    }
    await savePreferences({
      pinEnabled: false,
      pinHash: null,
      pinSalt: null,
      biometricEnabled: false,
      biometricCredentialId: null,
    });
    setCurrentPin('');
    notify('App PIN lock disabled', 'info');
  };

  const handleToggleBiometric = async () => {
    if (!preferences.pinEnabled) {
      notify('Set up an offline PIN first before enabling fingerprint/biometric unlock.', 'info');
      return;
    }
    if (preferences.biometricEnabled) {
      await savePreferences({ biometricEnabled: false, biometricCredentialId: null });
      notify('Biometric unlock disabled', 'info');
      return;
    }
    const credId = await registerPlatformBiometric(settings.ownerName || settings.farmName);
    if (credId) {
      await savePreferences({ biometricEnabled: true, biometricCredentialId: credId });
      notify('Device biometric unlock linked', 'success');
    } else {
      notify('Could not register device biometric in this browser context.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate({ name: 'more' })}
          aria-label="Back to More"
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-stone-900">Farm Setup & Settings</h1>
          <p className="text-xs text-stone-600">
            Configure three-user cloud access, dairy identity, gestation defaults, Marathi/English UI, and offline PIN lock
          </p>
        </div>
      </div>

      {/* Three-User Shared Farm & Cloud Access */}
      <TeamCloudAccessCard onOpenConflicts={() => setConflictsOpen(true)} />

      {/* Standalone Phone Installation Card */}
      <div className="rounded-2xl border border-stone-200/90 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-[#1B4D3E]" />
            <div>
              <h2 className="text-base font-bold text-stone-900">
                Install DairyTrack on Your Android Phone
              </h2>
              <p className="mt-1 text-xs text-stone-600">
                {isInstalled
                  ? 'Installed in standalone full-screen mode. Opens directly from your home screen with zero internet.'
                  : isIOS
                  ? 'Tap Share in Safari and choose "Add to Home Screen" for full-screen offline access.'
                  : 'Install directly to your phone launcher for instant offline startup, camera QR scanning, and local reminders.'}
              </p>
            </div>
          </div>

          {isInstalled ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1B4D3E]">
              <CheckCircle2 className="h-4 w-4" />
              Installed
            </span>
          ) : isInstallable ? (
            <button
              type="button"
              onClick={async () => {
                const ok = await install();
                if (ok) notify('DairyTrack installed to your device!', 'success');
              }}
              className="min-h-[46px] rounded-xl bg-[#1B4D3E] px-4 text-sm font-semibold text-white hover:bg-[#153D31] whitespace-nowrap"
            >
              Install to Phone
            </button>
          ) : (
            <span className="text-xs text-stone-500">
              In Chrome Android menu (⋮), tap &ldquo;Install app&rdquo; or &ldquo;Add to Home screen&rdquo;
            </span>
          )}
        </div>
      </div>

      {/* Language Switcher */}
      <div className="rounded-2xl border border-stone-200/90 bg-white p-5">
        <h2 className="text-base font-bold text-stone-900">App Language / भाषा</h2>
        <p className="mt-1 text-xs text-stone-600">
          Switch navigation and dashboard labels between English and Marathi (मराठी).
        </p>
        <div className="mt-3 flex gap-3">
          <button
            type="button"
            onClick={() => {
              savePreferences({ language: 'en' });
              notify('Language set to English', 'success');
            }}
            className={`min-h-[46px] rounded-xl border px-5 text-sm font-semibold ${
              preferences.language === 'en'
                ? 'border-[#1B4D3E] bg-[#1B4D3E] text-white'
                : 'border-stone-300 bg-white text-stone-800 hover:bg-stone-50'
            }`}
          >
            English
          </button>
          <button
            type="button"
            onClick={() => {
              savePreferences({ language: 'mr' });
              notify('भाषा मराठी निवडली', 'success');
            }}
            className={`min-h-[46px] rounded-xl border px-5 text-sm font-semibold ${
              preferences.language === 'mr'
                ? 'border-[#1B4D3E] bg-[#1B4D3E] text-white'
                : 'border-stone-300 bg-white text-stone-800 hover:bg-stone-50'
            }`}
          >
            मराठी (Marathi)
          </button>
        </div>
      </div>

      {/* Farm Profile & Operational Defaults */}
      <form
        onSubmit={handleSaveFarmSetup}
        className="space-y-4 rounded-2xl border border-stone-200/90 bg-white p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-3">
          <h2 className="text-base font-bold text-stone-900">Farm Profile & Dairy Parameters</h2>
          <span className="text-xs text-stone-500">
            Units: INR ₹ · Litres (L) · Kilograms (kg) · dd/MM/yyyy
          </span>
        </div>

        {!canAdministerFarm && (
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-3.5 text-xs text-stone-700">
            <p className="font-semibold text-stone-900">Read-Only for Farm Member</p>
            <p className="mt-0.5">
              Shared farm profile, default milk rate, and gestation settings are managed by the Farm Administrator and sync automatically to your phone.
            </p>
          </div>
        )}

        <fieldset disabled={!canAdministerFarm} className="space-y-4 disabled:opacity-75">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-stone-700">Farm Name *</label>
              <input
                type="text"
                required
                value={farmName}
                onChange={(e) => setFarmName(e.target.value)}
                placeholder="e.g. Green Pastures Dairy Farm"
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 text-sm focus:border-[#1B4D3E] focus:outline-none disabled:bg-stone-50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">Owner Name</label>
              <input
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Farmer / Owner full name"
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 text-sm focus:border-[#1B4D3E] focus:outline-none disabled:bg-stone-50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="10-digit mobile number"
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 font-mono text-sm tabular-nums focus:border-[#1B4D3E] focus:outline-none disabled:bg-stone-50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Default Milk Rate (₹ / Litre)
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={defaultRate}
                onChange={(e) => setDefaultRate(e.target.value)}
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 font-mono text-sm tabular-nums focus:border-[#1B4D3E] focus:outline-none disabled:bg-stone-50"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-stone-700">
                Village / Farm Address
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Village, Taluka, District, State"
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 text-sm focus:border-[#1B4D3E] focus:outline-none disabled:bg-stone-50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Cow Gestation Period (Days)
              </label>
              <input
                type="number"
                min="250"
                max="320"
                value={gestationCow}
                onChange={(e) => setGestationCow(e.target.value)}
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 font-mono text-sm tabular-nums focus:border-[#1B4D3E] focus:outline-none disabled:bg-stone-50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Buffalo Gestation Period (Days)
              </label>
              <input
                type="number"
                min="280"
                max="340"
                value={gestationBuffalo}
                onChange={(e) => setGestationBuffalo(e.target.value)}
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 font-mono text-sm tabular-nums focus:border-[#1B4D3E] focus:outline-none disabled:bg-stone-50"
              />
            </div>
          </div>

          <div className="space-y-3 border-t border-stone-100 pt-3">
            <label className="flex min-h-[44px] items-center gap-3 text-sm text-stone-800">
              <input
                type="checkbox"
                checked={enableAfternoon}
                onChange={(e) => setEnableAfternoon(e.target.checked)}
                className="h-4 w-4 accent-[#1B4D3E]"
              />
              <span>Enable optional Afternoon milking session (in addition to Morning & Evening)</span>
            </label>

            <label className="flex min-h-[44px] items-center gap-3 text-sm text-stone-800">
              <input
                type="checkbox"
                checked={notificationsEnabled}
                onChange={(e) => setNotificationsEnabled(e.target.checked)}
                className="h-4 w-4 accent-[#1B4D3E]"
              />
              <span>
                Enable local device notifications for calving dates, vaccinations, vet follow-ups, and tasks
              </span>
            </label>
          </div>
        </fieldset>

        {canAdministerFarm && (
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="min-h-[48px] rounded-xl bg-[#1B4D3E] px-6 text-sm font-semibold text-white hover:bg-[#153D31]"
            >
              Save Farm Settings
            </button>
          </div>
        )}
      </form>

      {/* Offline PIN & Biometric Security */}
      <div className="rounded-2xl border border-stone-200/90 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Lock className="h-5 w-5 text-[#1B4D3E]" />
            <div>
              <h2 className="text-base font-bold text-stone-900">Offline PIN & Biometric App Lock</h2>
              <p className="text-xs text-stone-600">
                Status: {preferences.pinEnabled ? 'Protected with PBKDF2-SHA256 PIN' : 'Unlocked (No PIN required)'}
              </p>
            </div>
          </div>

          {preferences.pinEnabled && (
            <button
              type="button"
              onClick={lockAppNow}
              className="min-h-[44px] rounded-xl border border-stone-300 px-4 text-xs font-semibold text-stone-800 hover:bg-stone-50"
            >
              Lock App Now
            </button>
          )}
        </div>

        <form onSubmit={handleSavePin} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {preferences.pinEnabled && (
            <div>
              <label className="block text-xs font-semibold text-stone-700">Current PIN</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                placeholder="Current PIN"
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 font-mono text-sm focus:border-[#1B4D3E] focus:outline-none"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-stone-700">
              {preferences.pinEnabled ? 'New PIN (4–6 digits)' : 'Set PIN (4–6 digits)'}
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
              placeholder="e.g. 2580"
              className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 font-mono text-sm focus:border-[#1B4D3E] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700">Confirm PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
              placeholder="Repeat PIN"
              className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 font-mono text-sm focus:border-[#1B4D3E] focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap gap-3 pt-1 sm:col-span-3">
            <button
              type="submit"
              className="min-h-[46px] rounded-xl bg-[#1B4D3E] px-5 text-sm font-semibold text-white hover:bg-[#153D31]"
            >
              {preferences.pinEnabled ? 'Update PIN' : 'Enable Offline PIN'}
            </button>

            {preferences.pinEnabled && (
              <button
                type="button"
                onClick={handleDisablePin}
                className="min-h-[46px] rounded-xl border border-red-200 px-4 text-sm font-semibold text-red-700 hover:bg-red-50"
              >
                Disable PIN Lock
              </button>
            )}

            {biometricSupported && preferences.pinEnabled && (
              <button
                type="button"
                onClick={handleToggleBiometric}
                className="flex min-h-[46px] items-center gap-2 rounded-xl border border-stone-300 px-4 text-sm font-semibold text-stone-800 hover:bg-stone-50"
              >
                <Fingerprint className="h-4 w-4 text-[#1B4D3E]" />
                {preferences.biometricEnabled
                  ? 'Disable Fingerprint Unlock'
                  : 'Enable Fingerprint Unlock'}
              </button>
            )}
          </div>
        </form>
      </div>

      <ConflictReviewModal
        open={conflictsOpen}
        onClose={() => setConflictsOpen(false)}
      />
    </div>
  );
};
