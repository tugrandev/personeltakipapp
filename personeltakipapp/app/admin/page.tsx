'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getSessionUser, clearSessionUser, AppUser } from '@/lib/session';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowLeft,
  RefreshCw,
  Download,
  UserPlus,
  Users,
  ClipboardList,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Trash2,
  LogOut,
  MapPin,
  Clock,
  Calendar,
  Building2,
  LogOut as ForceOutIcon,
  Save,
  Plus,
  QrCode,
  Printer,
  X,
  FileCheck2,
  Coffee,
  Check,
  XCircle,
  MessageSquareWarning,
  History,
} from 'lucide-react';

interface ActiveWorker {
  userId: string;
  fullName: string;
  username: string;
  checkInTime: string;
  locationId: string;
  isOnBreak: boolean;
}

interface LocationBox {
  id: string;
  name: string;
  activeWorkers: ActiveWorker[];
}

interface ShiftSummary {
  id: string;
  userId: string;
  date: string;
  staffName: string;
  locationName: string;
  expectedShift: string;
  inTime: string;
  outTime: string | null;
  durationText: string;
  durationMinutes: number;
  breakMinutes: number;
  breakExcessMinutes: number;
  lateMinutes: number;
  overtimeMinutes: number;
  statusBadge: 'normal' | 'late' | 'overtime' | 'open' | 'missing';
}

interface MonthlyUserSummary {
  userId: string;
  staffName: string;
  daysWorked: number;
  totalMinutes: number;
  totalBreakMinutes: number;
  totalLateMinutes: number;
  totalOvertimeMinutes: number;
  leaveDays: number;
}

const QUICK_REJECTION_REASONS = [
  'Operasyonel yoğunluk nedeniyle bu tarihlerde izin uygun değildir.',
  'Aynı tarihlerde departmanda başka personel izinlidir.',
  'Tarih aralığını güncelleyerek tekrar talep oluşturunuz.',
  'Eksik bilgi veya rapor belgesi nedeniyle onaylanamadı.',
];

export default function AdminPage() {
  const [adminUser, setAdminUser] = useState<AppUser | null>(null);
  const [activeTab, setActiveTab] = useState<'live' | 'report' | 'leaves' | 'locations' | 'staff'>('live');
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const router = useRouter();

  // Canlı durum
  const [locationBoxes, setLocationBoxes] = useState<LocationBox[]>([]);
  const [loadingLive, setLoadingLive] = useState(true);

  // Puantaj & Rapor
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedLocFilter, setSelectedLocFilter] = useState('ALL');
  const [shifts, setShifts] = useState<ShiftSummary[]>([]);
  const [monthlySummaries, setMonthlySummaries] = useState<MonthlyUserSummary[]>([]);
  const [loadingReport, setLoadingReport] = useState(false);

  // İzin yönetimi & Personel Talepleri
  const [leavesList, setLeavesList] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [reviewedRequests, setReviewedRequests] = useState<any[]>([]);
  const [leaveUserId, setLeaveUserId] = useState('');
  const [leaveDate, setLeaveDate] = useState('');
  const [leaveType, setLeaveType] = useState('Yıllık İzin');
  const [leaveNote, setLeaveNote] = useState('');

  // Talep Karar Modalı (Onay / Gerekçeli Red)
  const [decisionModal, setDecisionModal] = useState<{
    req: any;
    decision: 'approved' | 'rejected';
  } | null>(null);
  const [decisionReason, setDecisionReason] = useState('');
  const [submittingDecision, setSubmittingDecision] = useState(false);

  // Şube yönetimi & QR Modal
  const [locationsList, setLocationsList] = useState<any[]>([]);
  const [qrModalLoc, setQrModalLoc] = useState<any | null>(null);
  const [newLocName, setNewLocName] = useState('');
  const [newLocSecret, setNewLocSecret] = useState('');
  const [newLocLat, setNewLocLat] = useState('');
  const [newLocLng, setNewLocLng] = useState('');
  const [newLocRadius, setNewLocRadius] = useState('75');
  const [newLocStart, setNewLocStart] = useState('09:00');
  const [newLocEnd, setNewLocEnd] = useState('18:00');
  const [newLocBreak, setNewLocBreak] = useState('45');

  // Personel yönetimi
  const [staffList, setStaffList] = useState<any[]>([]);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'staff' | 'admin'>('staff');
  const [staffShiftStart, setStaffShiftStart] = useState('');
  const [staffShiftEnd, setStaffShiftEnd] = useState('');
  const [creating, setCreating] = useState(false);
  const [formMessage, setFormMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const user = getSessionUser();
    if (!user || user.role !== 'admin') {
      window.location.href = '/login';
      return;
    }

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const firstDayStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    setStartDate(firstDayStr);
    setEndDate(todayStr);
    setLeaveDate(todayStr);

    setAdminUser(user);
    fetchLiveLocations();
    fetchLocationsList();
    fetchStaff();
    fetchLeaves();
    fetchLeaveRequests();
  }, []);

  useEffect(() => {
    if (activeTab === 'report' && startDate && endDate) {
      fetchPuantajReport();
    }
  }, [activeTab, startDate, endDate, selectedLocFilter]);

  // Bulunulan aktif sekmeye göre tüm verileri yenileyen merkezi fonksiyon
  const handleRefreshActiveTab = async () => {
    setIsRefreshingAll(true);
    try {
      if (activeTab === 'live') {
        await fetchLiveLocations();
      } else if (activeTab === 'report') {
        await fetchPuantajReport();
      } else if (activeTab === 'leaves') {
        await Promise.all([fetchLeaveRequests(), fetchLeaves()]);
      } else if (activeTab === 'locations') {
        await fetchLocationsList();
      } else if (activeTab === 'staff') {
        await fetchStaff();
      }
    } finally {
      setTimeout(() => setIsRefreshingAll(false), 300);
    }
  };

  const timeToMinutes = (hhmm?: string | null): number | null => {
    if (!hhmm || !hhmm.includes(':')) return null;
    const [h, m] = hhmm.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  };

  const formatDuration = (totalMinutes: number): string => {
    const mins = Math.max(0, Math.round(totalMinutes));
    if (mins === 0) return '0 dk';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m} dk`;
    if (m === 0) return `${h} sa`;
    return `${h} sa ${m} dk`;
  };

  // 1. CANLI DURUM
  const fetchLiveLocations = async () => {
    setLoadingLive(true);
    const { data: locations } = await supabase.from('locations').select('id, name').order('name');
    const sixteenHoursAgo = new Date(Date.now() - 16 * 60 * 60 * 1000).toISOString();

    const { data: recentLogs } = await supabase
      .from('attendance_logs')
      .select('user_id, location_id, action_type, created_at, profiles(full_name, username)')
      .gte('created_at', sixteenHoursAgo)
      .order('created_at', { ascending: false });

    const latestUserStatus = new Map<string, any>();
    const firstInTimeMap = new Map<string, string>();

    (recentLogs || []).forEach((log) => {
      if (!latestUserStatus.has(log.user_id)) {
        latestUserStatus.set(log.user_id, log);
      }
      if (log.action_type === 'IN' && !firstInTimeMap.has(log.user_id)) {
        firstInTimeMap.set(log.user_id, log.created_at);
      }
    });

    const boxes: LocationBox[] = (locations || []).map((loc) => {
      const workers: ActiveWorker[] = [];
      latestUserStatus.forEach((log) => {
        if (log.action_type !== 'OUT' && log.location_id === loc.id) {
          const prof = Array.isArray(log.profiles) ? log.profiles[0] : log.profiles;
          workers.push({
            userId: log.user_id,
            fullName: prof?.full_name || 'İsimsiz',
            username: prof?.username || '',
            checkInTime: firstInTimeMap.get(log.user_id) || log.created_at,
            locationId: loc.id,
            isOnBreak: log.action_type === 'BREAK_START',
          });
        }
      });
      return { id: loc.id, name: loc.name, activeWorkers: workers };
    });

    setLocationBoxes(boxes);
    setLoadingLive(false);
  };

  const forceCheckOut = async (worker: ActiveWorker) => {
    if (!confirm(`${worker.fullName} için manuel çıkış kaydı oluşturulsun mu?`)) return;

    if (worker.isOnBreak) {
      await supabase.from('attendance_logs').insert({
        user_id: worker.userId,
        location_id: worker.locationId,
        action_type: 'BREAK_END',
        scanned_lat: 0,
        scanned_lng: 0,
        distance_meters: 0,
      });
    }

    await supabase.from('attendance_logs').insert({
      user_id: worker.userId,
      location_id: worker.locationId,
      action_type: 'OUT',
      scanned_lat: 0,
      scanned_lng: 0,
      distance_meters: 0,
    });
    fetchLiveLocations();
  };

  // 2. PUANTAJ & RAPOR
  const fetchPuantajReport = async () => {
    setLoadingReport(true);
    const startISO = new Date(`${startDate}T00:00:00`).toISOString();
    const endISO = new Date(`${endDate}T23:59:59`).toISOString();

    let query = supabase
      .from('attendance_logs')
      .select(
        'id, user_id, location_id, action_type, created_at, profiles(full_name, shift_start, shift_end), locations(name, shift_start, shift_end, grace_minutes, daily_break_minutes)'
      )
      .gte('created_at', startISO)
      .lte('created_at', endISO)
      .order('created_at', { ascending: true });

    if (selectedLocFilter !== 'ALL') {
      query = query.eq('location_id', selectedLocFilter);
    }

    const { data: rawLogs } = await query;

    const { data: periodLeaves } = await supabase
      .from('leaves')
      .select('user_id, leave_date, leave_type, profiles(full_name)')
      .gte('leave_date', startDate)
      .lte('leave_date', endDate);

    const openShifts = new Map<string, any>();
    const completedShifts: ShiftSummary[] = [];

    (rawLogs || []).forEach((log: any) => {
      const prof = Array.isArray(log.profiles) ? log.profiles[0] : log.profiles;
      const loc = Array.isArray(log.locations) ? log.locations[0] : log.locations;
      const staffName = prof?.full_name || 'Bilinmiyor';
      const locationName = loc?.name || '';

      const effStart = prof?.shift_start || loc?.shift_start || '09:00';
      const effEnd = prof?.shift_end || loc?.shift_end || '18:00';
      const grace = loc?.grace_minutes ?? 10;
      const allowedBreak = loc?.daily_break_minutes ?? 45;

      if (log.action_type === 'IN') {
        if (openShifts.has(log.user_id)) {
          const prev = openShifts.get(log.user_id);
          completedShifts.push({
            id: prev.id,
            userId: prev.user_id,
            date: new Date(prev.created_at).toLocaleDateString('tr-TR'),
            staffName: prev.staffName,
            locationName: prev.locationName,
            expectedShift: prev.expectedShift,
            inTime: new Date(prev.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
            outTime: null,
            durationText: 'Çıkış Eksik',
            durationMinutes: 0,
            breakMinutes: prev.accumulatedBreakMins || 0,
            breakExcessMinutes: 0,
            lateMinutes: prev.lateMinutes,
            overtimeMinutes: 0,
            statusBadge: 'missing',
          });
        }

        const inDate = new Date(log.created_at);
        const actualInMins = inDate.getHours() * 60 + inDate.getMinutes();
        const expectedInMins = timeToMinutes(effStart);
        let lateMins = 0;
        if (expectedInMins !== null && actualInMins > expectedInMins + grace) {
          lateMins = actualInMins - expectedInMins;
        }

        openShifts.set(log.user_id, {
          ...log,
          staffName,
          locationName,
          expectedShift: `${effStart}-${effEnd}`,
          effStart,
          effEnd,
          allowedBreak,
          lateMinutes: lateMins,
          accumulatedBreakMins: 0,
          activeBreakStart: null,
        });
      } else if (log.action_type === 'BREAK_START') {
        const currentShift = openShifts.get(log.user_id);
        if (currentShift && !currentShift.activeBreakStart) {
          currentShift.activeBreakStart = new Date(log.created_at).getTime();
        }
      } else if (log.action_type === 'BREAK_END') {
        const currentShift = openShifts.get(log.user_id);
        if (currentShift && currentShift.activeBreakStart) {
          const bDiff = Math.max(
            0,
            Math.round((new Date(log.created_at).getTime() - currentShift.activeBreakStart) / 60000)
          );
          currentShift.accumulatedBreakMins += bDiff;
          currentShift.activeBreakStart = null;
        }
      } else if (log.action_type === 'OUT') {
        const matchingIn = openShifts.get(log.user_id);
        if (matchingIn) {
          if (matchingIn.activeBreakStart) {
            const bDiff = Math.max(
              0,
              Math.round((new Date(log.created_at).getTime() - matchingIn.activeBreakStart) / 60000)
            );
            matchingIn.accumulatedBreakMins += bDiff;
            matchingIn.activeBreakStart = null;
          }

          const diffMs = new Date(log.created_at).getTime() - new Date(matchingIn.created_at).getTime();
          const grossMins = Math.max(0, Math.floor(diffMs / 60000));
          const breakMins = matchingIn.accumulatedBreakMins || 0;
          const netMins = Math.max(0, grossMins - breakMins);
          const breakExcess = Math.max(0, breakMins - (matchingIn.allowedBreak ?? 45));

          const sMins = timeToMinutes(matchingIn.effStart);
          const eMins = timeToMinutes(matchingIn.effEnd);
          let overtimeMins = 0;
          if (sMins !== null && eMins !== null) {
            const expectedDuration = eMins >= sMins ? eMins - sMins : 24 * 60 - sMins + eMins;
            if (netMins > expectedDuration + 15) {
              overtimeMins = netMins - expectedDuration;
            }
          }

          let badge: ShiftSummary['statusBadge'] = 'normal';
          if (matchingIn.lateMinutes > 0 || breakExcess > 0) badge = 'late';
          else if (overtimeMins > 0) badge = 'overtime';

          completedShifts.push({
            id: matchingIn.id,
            userId: log.user_id,
            date: new Date(matchingIn.created_at).toLocaleDateString('tr-TR'),
            staffName,
            locationName: matchingIn.locationName,
            expectedShift: matchingIn.expectedShift,
            inTime: new Date(matchingIn.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
            outTime: new Date(log.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
            durationText: formatDuration(netMins),
            durationMinutes: netMins,
            breakMinutes: breakMins,
            breakExcessMinutes: breakExcess,
            lateMinutes: matchingIn.lateMinutes,
            overtimeMinutes: overtimeMins,
            statusBadge: badge,
          });
          openShifts.delete(log.user_id);
        }
      }
    });

    const nowMs = Date.now();
    const sixteenHoursMs = 16 * 60 * 60 * 1000;

    openShifts.forEach((openLog) => {
      const checkInMs = new Date(openLog.created_at).getTime();
      const elapsedMs = Math.max(0, nowMs - checkInMs);
      const isStillActive = elapsedMs <= sixteenHoursMs;
      let ongoingBreak = openLog.accumulatedBreakMins || 0;
      if (openLog.activeBreakStart && isStillActive) {
        ongoingBreak += Math.max(0, Math.round((nowMs - openLog.activeBreakStart) / 60000));
      }
      const activeMinutes = isStillActive ? Math.max(0, Math.floor(elapsedMs / 60000) - ongoingBreak) : 0;

      completedShifts.push({
        id: openLog.id,
        userId: openLog.user_id,
        date: new Date(openLog.created_at).toLocaleDateString('tr-TR'),
        staffName: openLog.staffName,
        locationName: openLog.locationName,
        expectedShift: openLog.expectedShift,
        inTime: new Date(openLog.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
        outTime: isStillActive ? 'İçeride' : null,
        durationText: isStillActive ? `${formatDuration(activeMinutes)} (Aktif)` : 'Çıkış Eksik',
        durationMinutes: activeMinutes,
        breakMinutes: ongoingBreak,
        breakExcessMinutes: Math.max(0, ongoingBreak - (openLog.allowedBreak ?? 45)),
        lateMinutes: openLog.lateMinutes,
        overtimeMinutes: 0,
        statusBadge: isStillActive ? 'open' : 'missing',
      });
    });

    setShifts(completedShifts.reverse());

    const summaryMap = new Map<string, MonthlyUserSummary & { uniqueDates: Set<string> }>();

    completedShifts.forEach((s) => {
      if (!summaryMap.has(s.userId)) {
        summaryMap.set(s.userId, {
          userId: s.userId,
          staffName: s.staffName,
          daysWorked: 0,
          totalMinutes: 0,
          totalBreakMinutes: 0,
          totalLateMinutes: 0,
          totalOvertimeMinutes: 0,
          leaveDays: 0,
          uniqueDates: new Set(),
        });
      }
      const entry = summaryMap.get(s.userId)!;
      entry.uniqueDates.add(s.date);
      entry.daysWorked = entry.uniqueDates.size;
      entry.totalMinutes += s.durationMinutes;
      entry.totalBreakMinutes += s.breakMinutes;
      entry.totalLateMinutes += s.lateMinutes;
      entry.totalOvertimeMinutes += s.overtimeMinutes;
    });

    (periodLeaves || []).forEach((lv: any) => {
      const prof = Array.isArray(lv.profiles) ? lv.profiles[0] : lv.profiles;
      if (!summaryMap.has(lv.user_id)) {
        summaryMap.set(lv.user_id, {
          userId: lv.user_id,
          staffName: prof?.full_name || 'Personel',
          daysWorked: 0,
          totalMinutes: 0,
          totalBreakMinutes: 0,
          totalLateMinutes: 0,
          totalOvertimeMinutes: 0,
          leaveDays: 0,
          uniqueDates: new Set(),
        });
      }
      summaryMap.get(lv.user_id)!.leaveDays += 1;
    });

    setMonthlySummaries(Array.from(summaryMap.values()));
    setLoadingReport(false);
  };

  const exportPuantajCSV = () => {
    const headers = [
      'Tarih',
      'Personel',
      'Sube',
      'Vardiya',
      'Giris',
      'Cikis',
      'Mola',
      'Net_Sure',
      'Gec_Kalma',
      'Fazla_Mesai',
    ];
    const rows = shifts.map((s) => [
      s.date,
      s.staffName,
      s.locationName,
      s.expectedShift,
      s.inTime,
      s.outTime || 'Çıkış Yok',
      formatDuration(s.breakMinutes),
      s.durationText,
      s.lateMinutes > 0 ? formatDuration(s.lateMinutes) : '0 dk',
      s.overtimeMinutes > 0 ? formatDuration(s.overtimeMinutes) : '0 dk',
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(';'), ...rows.map((e) => e.join(';'))].join('\n');

    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `puantaj_${startDate}_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 3. İZİN YÖNETİMİ & PERSONEL TALEPLERİ
  const fetchLeaves = async () => {
    const { data } = await supabase
      .from('leaves')
      .select('*, profiles(full_name)')
      .order('leave_date', { ascending: false })
      .limit(50);
    if (data) setLeavesList(data);
  };

  const fetchLeaveRequests = async () => {
    const { data } = await supabase
      .from('leave_requests')
      .select('*, profiles(full_name, username)')
      .order('created_at', { ascending: false })
      .limit(50);

    if (data) {
      setPendingRequests(data.filter((r: any) => r.status === 'pending'));
      setReviewedRequests(data.filter((r: any) => r.status !== 'pending'));
    }
  };

  const openDecisionModal = (req: any, decision: 'approved' | 'rejected') => {
    setDecisionReason('');
    setDecisionModal({ req, decision });
  };

  const submitLeaveDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!decisionModal || submittingDecision) return;

    const { req, decision } = decisionModal;
    const trimmedNote = decisionReason.trim();

    if (decision === 'rejected' && trimmedNote.length < 3) {
      alert('Reddetme işlemi için lütfen personele iletilecek geçerli bir gerekçe yazın.');
      return;
    }

    setSubmittingDecision(true);

    try {
      const { error } = await supabase
        .from('leave_requests')
        .update({
          status: decision,
          admin_note: trimmedNote || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', req.id);

      if (error) throw error;

      // Onaylandıysa başlangıç-bitiş günlerini otomatik puantaj izin tablosuna işle
      if (decision === 'approved') {
        const start = new Date(req.start_date);
        const end = new Date(req.end_date);
        const rowsToInsert: any[] = [];

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          rowsToInsert.push({
            user_id: req.user_id,
            leave_date: d.toISOString().slice(0, 10),
            leave_type: req.leave_type,
            note: trimmedNote || req.reason || 'Personel talebiyle onaylandı',
          });
        }

        if (rowsToInsert.length > 0) {
          await supabase.from('leaves').insert(rowsToInsert);
        }
      }

      setDecisionModal(null);
      setDecisionReason('');
      await Promise.all([fetchLeaveRequests(), fetchLeaves()]);
    } catch (err: any) {
      alert('İşlem sırasında hata oluştu: ' + (err.message || 'Bilinmeyen hata'));
    } finally {
      setSubmittingDecision(false);
    }
  };

  const handleAddLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveUserId || !leaveDate) return;

    const { error } = await supabase.from('leaves').insert({
      user_id: leaveUserId,
      leave_date: leaveDate,
      leave_type: leaveType,
      note: leaveNote.trim(),
    });

    if (!error) {
      setLeaveNote('');
      fetchLeaves();
    }
  };

  const deleteLeave = async (id: string) => {
    await supabase.from('leaves').delete().eq('id', id);
    fetchLeaves();
  };

  // 4. ŞUBE YÖNETİMİ
  const fetchLocationsList = async () => {
    const { data } = await supabase.from('locations').select('*').order('name');
    if (data) setLocationsList(data);
  };

  const updateLocationField = (id: string, field: string, value: any) => {
    setLocationsList((prev) => prev.map((loc) => (loc.id === id ? { ...loc, [field]: value } : loc)));
  };

  const saveLocationRow = async (loc: any) => {
    const { error } = await supabase
      .from('locations')
      .update({
        name: loc.name,
        latitude: parseFloat(loc.latitude),
        longitude: parseFloat(loc.longitude),
        radius_meters: parseInt(loc.radius_meters, 10),
        shift_start: loc.shift_start || '09:00',
        shift_end: loc.shift_end || '18:00',
        grace_minutes: parseInt(loc.grace_minutes ?? 10, 10),
        daily_break_minutes: parseInt(loc.daily_break_minutes ?? 45, 10),
      })
      .eq('id', loc.id);

    if (!error) alert(`${loc.name} şube, mesai ve mola ayarları kaydedildi.`);
  };

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('locations').insert({
      name: newLocName.trim(),
      qr_secret: newLocSecret.trim(),
      latitude: parseFloat(newLocLat),
      longitude: parseFloat(newLocLng),
      radius_meters: parseInt(newLocRadius, 10),
      shift_start: newLocStart,
      shift_end: newLocEnd,
      grace_minutes: 10,
      daily_break_minutes: parseInt(newLocBreak || '45', 10),
    });

    if (!error) {
      setNewLocName('');
      setNewLocSecret('');
      setNewLocLat('');
      setNewLocLng('');
      setNewLocRadius('75');
      setNewLocBreak('45');
      fetchLocationsList();
      fetchLiveLocations();
    } else {
      alert('Şube eklenemedi: ' + error.message);
    }
  };

  // 5. PERSONEL YÖNETİMİ
  const fetchStaff = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, username, role, device_id, shift_start, shift_end')
      .order('full_name', { ascending: true });

    if (data) setStaffList(data);
  };

  const updateStaffShiftField = (id: string, field: 'shift_start' | 'shift_end', value: string) => {
    setStaffList((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  };

  const saveStaffShift = async (person: any) => {
    const { error } = await supabase
      .from('profiles')
      .update({
        shift_start: person.shift_start?.trim() || null,
        shift_end: person.shift_end?.trim() || null,
      })
      .eq('id', person.id);

    if (!error) {
      alert(`${person.full_name} için çalışma saatleri güncellendi.`);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminUser) return;
    setCreating(true);
    setFormMessage(null);

    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
    if (cleanUsername.length < 3) {
      setFormMessage({ type: 'error', text: 'Kullanıcı adı en az 3 karakter olmalıdır.' });
      setCreating(false);
      return;
    }

    const { error } = await supabase.rpc('admin_create_user', {
      p_admin_id: adminUser.id,
      p_full_name: fullName,
      p_username: cleanUsername,
      p_password: password,
      p_role: role,
      p_shift_start: staffShiftStart || null,
      p_shift_end: staffShiftEnd || null,
    });

    if (error) {
      setFormMessage({
        type: 'error',
        text: error.message.includes('duplicate') ? 'Bu kullanıcı adı zaten kayıtlı.' : error.message,
      });
    } else {
      setFormMessage({
        type: 'success',
        text: `${fullName.trim()} (${cleanUsername}) başarıyla oluşturuldu.`,
      });
      setFullName('');
      setUsername('');
      setPassword('');
      setStaffShiftStart('');
      setStaffShiftEnd('');
      setRole('staff');
      fetchStaff();
    }

    setCreating(false);
  };

  const resetDeviceLock = async (userId: string, name: string) => {
    const { error } = await supabase.from('profiles').update({ device_id: null }).eq('id', userId);
    if (!error) {
      alert(`${name} için telefon kilidi sıfırlandı.`);
      fetchStaff();
    }
  };

  const deleteUser = async (userId: string, name: string) => {
    if (!confirm(`${name} kullanıcısını silmek istediğinize emin misiniz?`)) return;
    await supabase.from('profiles').delete().eq('id', userId);
    fetchStaff();
  };

  const totalActiveCount = locationBoxes.reduce((sum, box) => sum + box.activeWorkers.length, 0);
  const originUrl = typeof window !== 'undefined' ? window.location.origin : 'https://personeltakipapp.vercel.app';

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Üst Başlık & Sekmeler */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/')}
              className="p-2 bg-slate-900 border border-slate-800 rounded-lg hover:bg-slate-800"
              title="Ana Sayfa"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold">Yönetici Paneli</h1>
              <p className="text-xs text-slate-400">Canlı takip, vardiya, mola, izin ve şube yönetimi</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setActiveTab('live')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition ${
                  activeTab === 'live' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <ClipboardList className="w-4 h-4" /> Canlı Durum
              </button>
              <button
                onClick={() => setActiveTab('report')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition ${
                  activeTab === 'report' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Calendar className="w-4 h-4" /> Puantaj & Rapor
              </button>
              <button
                onClick={() => setActiveTab('leaves')}
                className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition ${
                  activeTab === 'leaves' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileCheck2 className="w-4 h-4" /> İzin & Talepler
                {pendingRequests.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 bg-white text-rose-600 text-[10px] font-extrabold rounded-full">
                    {pendingRequests.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('locations')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition ${
                  activeTab === 'locations' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Building2 className="w-4 h-4" /> Şubeler & QR
              </button>
              <button
                onClick={() => setActiveTab('staff')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition ${
                  activeTab === 'staff' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Users className="w-4 h-4" /> Personeller
              </button>
            </div>

            {/* Merkezi Sekme Yenileme Butonu */}
            <button
              onClick={handleRefreshActiveTab}
              disabled={isRefreshingAll}
              className="flex items-center gap-1.5 px-3 py-2.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-xl text-xs font-medium text-emerald-400 transition"
              title="Aktif Sayfayı Yenile"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshingAll ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Yenile</span>
            </button>

            <button
              onClick={() => {
                clearSessionUser();
                window.location.href = '/login';
              }}
              className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 hover:text-red-400 transition"
              title="Çıkış Yap"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* SEKME 1: CANLI DURUM */}
        {activeTab === 'live' && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div className="text-sm text-slate-300">
                Şu an işyerlerinde aktif toplam personel:{' '}
                <span className="font-bold text-emerald-400">{totalActiveCount} kişi</span>
              </div>
              <button
                onClick={fetchLiveLocations}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm hover:bg-slate-800"
              >
                <RefreshCw className={`w-4 h-4 ${loadingLive ? 'animate-spin' : ''}`} /> Canlı Durumu Yenile
              </button>
            </div>

            {loadingLive ? (
              <div className="text-center py-12 text-slate-400">Şube verileri yükleniyor...</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {locationBoxes.map((box) => (
                  <div key={box.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
                    <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400">
                          <MapPin className="w-5 h-5" />
                        </div>
                        <h2 className="font-bold text-base text-white">{box.name}</h2>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                          box.activeWorkers.length > 0
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {box.activeWorkers.length} Çalışan
                      </span>
                    </div>

                    {box.activeWorkers.length === 0 ? (
                      <div className="py-8 text-center text-sm text-slate-500 bg-slate-950/40 rounded-xl border border-slate-800/50">
                        Şu an bu lokasyonda aktif çalışan bulunmuyor.
                      </div>
                    ) : (
                      <ul className="space-y-2.5">
                        {box.activeWorkers.map((worker) => (
                          <li
                            key={worker.userId}
                            className="flex items-center justify-between bg-slate-800/50 border border-slate-700/60 px-3.5 py-2.5 rounded-xl"
                          >
                            <div className="flex items-center gap-2.5">
                              <span
                                className={`w-2.5 h-2.5 rounded-full animate-pulse ${
                                  worker.isOnBreak ? 'bg-amber-400' : 'bg-emerald-400'
                                }`}
                              />
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-semibold text-white">{worker.fullName}</p>
                                  {worker.isOnBreak && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                      <Coffee className="w-2.5 h-2.5" /> Molada
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-400 font-mono">@{worker.username}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-300 bg-emerald-500/10 px-2 py-1 rounded-md">
                                <Clock className="w-3 h-3" />
                                {new Date(worker.checkInTime).toLocaleTimeString('tr-TR', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                              <button
                                onClick={() => forceCheckOut(worker)}
                                className="text-xs px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 rounded-md flex items-center gap-1"
                              >
                                <ForceOutIcon className="w-3 h-3" /> Çıkış Ver
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* SEKME 2: PUANTAJ & GEÇ KALMA / MOLA / FAZLA MESAİ RAPORU */}
        {activeTab === 'report' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Başlangıç Tarihi</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Bitiş Tarihi</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Şube Filtresi</label>
                  <select
                    value={selectedLocFilter}
                    onChange={(e) => setSelectedLocFilter(e.target.value)}
                    className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm"
                  >
                    <option value="ALL">Tüm Şubeler</option>
                    {locationsList.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={fetchPuantajReport}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 border border-slate-700 hover:bg-slate-700 rounded-lg text-sm"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingReport ? 'animate-spin' : ''}`} /> Yenile
                </button>
                <button
                  onClick={exportPuantajCSV}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium"
                >
                  <Download className="w-4 h-4" /> Puantajı Excel İndir
                </button>
              </div>
            </div>

            {monthlySummaries.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <h2 className="text-sm font-bold text-slate-200 mb-3">
                  Seçili Dönem Personel Bazlı Toplam Özet
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {monthlySummaries.map((m) => (
                    <div
                      key={m.userId}
                      className="bg-slate-800/60 border border-slate-700/70 rounded-xl p-3.5 flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-sm text-white">{m.staffName}</span>
                        <span className="text-xs px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded font-semibold">
                          {m.daysWorked} Gün Çalıştı
                        </span>
                      </div>
                      <div className="text-xs text-slate-300 space-y-1">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Net Çalışma Süresi:</span>
                          <span className="font-bold text-emerald-400">
                            {formatDuration(m.totalMinutes)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Toplam Mola:</span>
                          <span className="text-amber-300 font-medium">
                            {formatDuration(m.totalBreakMinutes)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Toplam Geç Kalma:</span>
                          <span className={m.totalLateMinutes > 0 ? 'text-red-400 font-semibold' : 'text-slate-400'}>
                            {formatDuration(m.totalLateMinutes)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Fazla Mesai:</span>
                          <span className={m.totalOvertimeMinutes > 0 ? 'text-cyan-400 font-semibold' : 'text-slate-400'}>
                            {formatDuration(m.totalOvertimeMinutes)}
                          </span>
                        </div>
                        {m.leaveDays > 0 && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">İzinli / Raporlu:</span>
                            <span className="text-rose-300 font-semibold">{m.leaveDays} Gün</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-800/60 text-slate-400 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3">Tarih</th>
                      <th className="px-4 py-3">Personel</th>
                      <th className="px-4 py-3">Şube</th>
                      <th className="px-4 py-3">Vardiya</th>
                      <th className="px-4 py-3">Giriş</th>
                      <th className="px-4 py-3">Çıkış</th>
                      <th className="px-4 py-3">Mola</th>
                      <th className="px-4 py-3">Net Süre</th>
                      <th className="px-4 py-3">Durum Analizi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {loadingReport ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                          Hesaplanıyor...
                        </td>
                      </tr>
                    ) : shifts.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                          Seçilen tarih aralığında vardiya kaydı bulunamadı.
                        </td>
                      </tr>
                    ) : (
                      shifts.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-800/30">
                          <td className="px-4 py-3 text-slate-300">{s.date}</td>
                          <td className="px-4 py-3 font-medium">{s.staffName}</td>
                          <td className="px-4 py-3 text-slate-300">{s.locationName}</td>
                          <td className="px-4 py-3 text-xs font-mono text-slate-400">{s.expectedShift}</td>
                          <td className="px-4 py-3 text-emerald-400 font-mono">{s.inTime}</td>
                          <td className="px-4 py-3 text-amber-400 font-mono">{s.outTime || '-'}</td>
                          <td className="px-4 py-3 text-xs text-slate-300">{formatDuration(s.breakMinutes)}</td>
                          <td className="px-4 py-3 font-semibold text-white">{s.durationText}</td>
                          <td className="px-4 py-3 text-xs">
                            <div className="flex flex-wrap gap-1">
                              {s.lateMinutes > 0 && (
                                <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-300 font-semibold">
                                  {formatDuration(s.lateMinutes)} Geç
                                </span>
                              )}
                              {s.breakExcessMinutes > 0 && (
                                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold">
                                  +{formatDuration(s.breakExcessMinutes)} Mola Aşımı
                                </span>
                              )}
                              {s.overtimeMinutes > 0 && (
                                <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-semibold">
                                  {formatDuration(s.overtimeMinutes)} Mesai
                                </span>
                              )}
                              {s.lateMinutes === 0 &&
                                s.breakExcessMinutes === 0 &&
                                s.overtimeMinutes === 0 &&
                                s.statusBadge === 'normal' && (
                                  <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
                                    Zamanında
                                  </span>
                                )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* SEKME 3: İZİN & TALEPLER YÖNETİMİ */}
        {activeTab === 'leaves' && (
          <div className="space-y-6">
            {/* Üst Bilgi & Yenileme Barı */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-300">
                Personel izin taleplerini gerekçeli olarak onaylayın veya reddedin.
              </p>
              <button
                onClick={() => {
                  fetchLeaveRequests();
                  fetchLeaves();
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-lg text-xs font-medium"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Talepleri Yenile
              </button>
            </div>

            {/* Personellerden Gelen Bekleyen İzin Talepleri */}
            {pendingRequests.length > 0 && (
              <div className="bg-rose-950/20 border border-rose-500/40 rounded-2xl p-5">
                <h2 className="text-sm font-bold text-rose-300 mb-3 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> Onay Bekleyen İzin Talepleri ({pendingRequests.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {pendingRequests.map((req) => {
                    const prof = Array.isArray(req.profiles) ? req.profiles[0] : req.profiles;
                    return (
                      <div
                        key={req.id}
                        className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sm text-white">{prof?.full_name || 'Personel'}</span>
                            <span className="px-2 py-0.5 rounded text-[11px] bg-amber-500/20 text-amber-300 font-semibold">
                              {req.leave_type}
                            </span>
                          </div>
                          <p className="text-xs text-slate-300 mt-1.5">
                            Tarih:{' '}
                            <span className="font-semibold">
                              {new Date(req.start_date).toLocaleDateString('tr-TR')} –{' '}
                              {new Date(req.end_date).toLocaleDateString('tr-TR')}
                            </span>
                          </p>
                          {req.reason && (
                            <p className="text-xs text-slate-400 mt-1.5 bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
                              <span className="text-slate-500">Personel Notu:</span> "{req.reason}"
                            </p>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
                          <button
                            onClick={() => openDecisionModal(req, 'approved')}
                            className="py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition"
                          >
                            <Check className="w-3.5 h-3.5" /> Onayla
                          </button>
                          <button
                            onClick={() => openDecisionModal(req, 'rejected')}
                            className="py-2 bg-red-600/20 hover:bg-red-600/35 text-red-300 border border-red-500/30 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Reddet
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Manuel İzin Ekleme Formu */}
              <form
                onSubmit={handleAddLeave}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 h-fit"
              >
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <FileCheck2 className="w-5 h-5 text-rose-400" /> Manuel İzin / Rapor İşle
                </h2>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Personel Seçin</label>
                  <select
                    required
                    value={leaveUserId}
                    onChange={(e) => setLeaveUserId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm"
                  >
                    <option value="">-- Personel Seç --</option>
                    {staffList.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name} (@{p.username})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">İzin Tarihi</label>
                  <input
                    type="date"
                    required
                    value={leaveDate}
                    onChange={(e) => setLeaveDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">İzin Türü</label>
                  <select
                    value={leaveType}
                    onChange={(e) => setLeaveType(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm"
                  >
                    <option value="Yıllık İzin">Yıllık İzin</option>
                    <option value="Raporlu">Raporlu (Sağlık)</option>
                    <option value="Ücretsiz İzin">Ücretsiz İzin</option>
                    <option value="İdari İzin">İdari İzin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Açıklama (Opsiyonel)</label>
                  <input
                    type="text"
                    value={leaveNote}
                    onChange={(e) => setLeaveNote(e.target.value)}
                    placeholder="Örn: Doktor raporu teslim edildi"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 rounded-lg text-sm font-semibold"
                >
                  İzin Kaydını Ekle
                </button>
              </form>

              {/* Sağ Kolon: Karara Bağlanan Talepler Geçmişi & Puantaj İzinleri */}
              <div className="lg:col-span-2 space-y-6">
                {/* Sonuçlandırılmış Talepler (Onay/Red Gerekçeleri) */}
                {reviewedRequests.length > 0 && (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                    <div className="p-4 border-b border-slate-800 flex items-center gap-2">
                      <History className="w-4 h-4 text-slate-400" />
                      <h2 className="font-semibold text-sm">Sonuçlandırılan İzin Talepleri</h2>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-800/60 text-slate-400 text-xs uppercase">
                          <tr>
                            <th className="px-4 py-3">Personel</th>
                            <th className="px-4 py-3">Tarih Aralığı</th>
                            <th className="px-4 py-3">Durum</th>
                            <th className="px-4 py-3">Yönetici Açıklaması / Gerekçe</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {reviewedRequests.slice(0, 15).map((r) => {
                            const prof = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
                            return (
                              <tr key={r.id}>
                                <td className="px-4 py-3 font-medium">{prof?.full_name || 'Personel'}</td>
                                <td className="px-4 py-3 text-xs text-slate-300">
                                  {new Date(r.start_date).toLocaleDateString('tr-TR')} –{' '}
                                  {new Date(r.end_date).toLocaleDateString('tr-TR')}
                                </td>
                                <td className="px-4 py-3">
                                  {r.status === 'approved' ? (
                                    <span className="px-2 py-0.5 rounded text-xs bg-emerald-500/20 text-emerald-300 font-semibold">
                                      Onaylandı
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded text-xs bg-red-500/20 text-red-300 font-semibold">
                                      Reddedildi
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-xs text-slate-300">
                                  {r.admin_note || <span className="text-slate-500">-</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Puantaja İşlenen İzin Günleri */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                  <div className="p-4 border-b border-slate-800">
                    <h2 className="font-semibold text-sm">Puantaja İşlenen İzin Günleri</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-800/60 text-slate-400 text-xs uppercase">
                        <tr>
                          <th className="px-4 py-3">Tarih</th>
                          <th className="px-4 py-3">Personel</th>
                          <th className="px-4 py-3">İzin Türü</th>
                          <th className="px-4 py-3">Not</th>
                          <th className="px-4 py-3 text-right">Sil</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {leavesList.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                              Henüz izin kaydı girilmemiş.
                            </td>
                          </tr>
                        ) : (
                          leavesList.map((lv) => (
                            <tr key={lv.id}>
                              <td className="px-4 py-3">{new Date(lv.leave_date).toLocaleDateString('tr-TR')}</td>
                              <td className="px-4 py-3 font-medium">{lv.profiles?.full_name}</td>
                              <td className="px-4 py-3">
                                <span className="px-2 py-0.5 rounded text-xs bg-rose-500/20 text-rose-300 font-semibold">
                                  {lv.leave_type}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-slate-400 text-xs">{lv.note || '-'}</td>
                              <td className="px-4 py-3 text-right">
                                <button
                                  onClick={() => deleteLeave(lv.id)}
                                  className="text-slate-400 hover:text-red-400"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SEKME 4: ŞUBELER, MESAİ, MOLA HAKKI & QR YAZDIRMA */}
        {activeTab === 'locations' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <h2 className="font-semibold text-sm">Şube Koordinatları, Mesai / Mola Hakları ve QR Kodları</h2>
                <button
                  onClick={fetchLocationsList}
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Yenile
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-800/60 text-slate-400 text-xs uppercase">
                    <tr>
                      <th className="px-3 py-3">Şube Adı</th>
                      <th className="px-3 py-3">Enlem</th>
                      <th className="px-3 py-3">Boylam</th>
                      <th className="px-3 py-3">Yarıçap(m)</th>
                      <th className="px-3 py-3">Başlangıç</th>
                      <th className="px-3 py-3">Bitiş</th>
                      <th className="px-3 py-3">Esneme(dk)</th>
                      <th className="px-3 py-3">Mola Hakkı(dk)</th>
                      <th className="px-3 py-3 text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {locationsList.map((loc) => (
                      <tr key={loc.id}>
                        <td className="px-3 py-2.5">
                          <input
                            type="text"
                            value={loc.name}
                            onChange={(e) => updateLocationField(loc.id, 'name', e.target.value)}
                            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm w-36"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <input
                            type="text"
                            value={loc.latitude}
                            onChange={(e) => updateLocationField(loc.id, 'latitude', e.target.value)}
                            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs font-mono w-24"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <input
                            type="text"
                            value={loc.longitude}
                            onChange={(e) => updateLocationField(loc.id, 'longitude', e.target.value)}
                            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs font-mono w-24"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <input
                            type="number"
                            value={loc.radius_meters}
                            onChange={(e) => updateLocationField(loc.id, 'radius_meters', e.target.value)}
                            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm w-16"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <input
                            type="time"
                            value={loc.shift_start || '09:00'}
                            onChange={(e) => updateLocationField(loc.id, 'shift_start', e.target.value)}
                            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <input
                            type="time"
                            value={loc.shift_end || '18:00'}
                            onChange={(e) => updateLocationField(loc.id, 'shift_end', e.target.value)}
                            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <input
                            type="number"
                            value={loc.grace_minutes ?? 10}
                            onChange={(e) => updateLocationField(loc.id, 'grace_minutes', e.target.value)}
                            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm w-14"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <input
                            type="number"
                            value={loc.daily_break_minutes ?? 45}
                            onChange={(e) => updateLocationField(loc.id, 'daily_break_minutes', e.target.value)}
                            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm w-16 text-amber-300 font-semibold"
                            title="Günlük izin verilen toplam mola süresi (dakika)"
                          />
                        </td>
                        <td className="px-3 py-2.5 text-right flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setQrModalLoc(loc)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 rounded-lg text-xs font-semibold"
                            title="QR Kodu Göster ve Yazdır"
                          >
                            <QrCode className="w-3.5 h-3.5" /> QR
                          </button>
                          <button
                            onClick={() => saveLocationRow(loc)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-xs font-semibold"
                          >
                            <Save className="w-3.5 h-3.5" /> Kaydet
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Yeni Şube Ekleme Formu */}
            <form
              onSubmit={handleAddLocation}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5 grid grid-cols-1 md:grid-cols-9 gap-3 items-end"
            >
              <div className="md:col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Yeni Şube Adı</label>
                <input
                  type="text"
                  required
                  value={newLocName}
                  onChange={(e) => setNewLocName(e.target.value)}
                  placeholder="Örn: Merkez Ofis"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">QR Anahtarı</label>
                <input
                  type="text"
                  required
                  value={newLocSecret}
                  onChange={(e) => setNewLocSecret(e.target.value)}
                  placeholder="merkez_QR"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Enlem</label>
                <input
                  type="text"
                  required
                  value={newLocLat}
                  onChange={(e) => setNewLocLat(e.target.value)}
                  placeholder="35.2227"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Boylam</label>
                <input
                  type="text"
                  required
                  value={newLocLng}
                  onChange={(e) => setNewLocLng(e.target.value)}
                  placeholder="33.4817"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Başlangıç</label>
                <input
                  type="time"
                  value={newLocStart}
                  onChange={(e) => setNewLocStart(e.target.value)}
                  className="w-full px-2 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Bitiş</label>
                <input
                  type="time"
                  value={newLocEnd}
                  onChange={(e) => setNewLocEnd(e.target.value)}
                  className="w-full px-2 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Mola (dk)</label>
                <input
                  type="number"
                  value={newLocBreak}
                  onChange={(e) => setNewLocBreak(e.target.value)}
                  className="w-full px-2 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs"
                />
              </div>
              <button
                type="submit"
                className="py-2 px-4 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-semibold flex items-center justify-center gap-1"
              >
                <Plus className="w-4 h-4" /> Ekle
              </button>
            </form>
          </div>
        )}

        {/* SEKME 5: PERSONEL EKLEME & KİŞİYE ÖZEL ÇALIŞMA SAATLERİ */}
        {activeTab === 'staff' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 h-fit">
              <h2 className="text-lg font-bold flex items-center gap-2 mb-1">
                <UserPlus className="w-5 h-5 text-indigo-400" /> Yeni Kullanıcı Ekle
              </h2>
              <p className="text-xs text-slate-400 mb-5">
                Çalışma saatini boş bırakırsanız şubenin genel mesai saati geçerli olur.
              </p>

              {formMessage && (
                <div
                  className={`p-3 rounded-lg text-xs mb-4 flex items-start gap-2 ${
                    formMessage.type === 'success'
                      ? 'bg-emerald-500/10 border border-emerald-500/40 text-emerald-300'
                      : 'bg-red-500/10 border border-red-500/40 text-red-300'
                  }`}
                >
                  {formMessage.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  )}
                  <span>{formMessage.text}</span>
                </div>
              )}

              <form onSubmit={handleCreateUser} className="space-y-3.5">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Ad Soyad</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Örn: Ahmet Yılmaz"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Kullanıcı Adı</label>
                  <input
                    type="text"
                    required
                    autoCapitalize="none"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Örn: ahmet"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Parola</label>
                  <input
                    type="text"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Örn: 1234"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Özel Giriş Saati</label>
                    <input
                      type="time"
                      value={staffShiftStart}
                      onChange={(e) => setStaffShiftStart(e.target.value)}
                      className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Özel Çıkış Saati</label>
                    <input
                      type="time"
                      value={staffShiftEnd}
                      onChange={(e) => setStaffShiftEnd(e.target.value)}
                      className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Yetki Rolü</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as 'staff' | 'admin')}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm"
                  >
                    <option value="staff">Personel</option>
                    <option value="admin">Yönetici (Admin)</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={creating}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-semibold transition disabled:opacity-50"
                >
                  {creating ? 'Kaydediliyor...' : 'Kullanıcıyı Ekle'}
                </button>
              </form>
            </div>

            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <h2 className="font-semibold text-sm">Kayıtlı Kullanıcılar & Özel Çalışma Saatleri</h2>
                <button
                  onClick={fetchStaff}
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Yenile
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-800/60 text-slate-400 text-xs uppercase">
                    <tr>
                      <th className="px-3 py-3">Ad Soyad</th>
                      <th className="px-3 py-3">Kullanıcı</th>
                      <th className="px-3 py-3">Özel Mesai (Giriş - Çıkış)</th>
                      <th className="px-3 py-3">Rol / Cihaz</th>
                      <th className="px-3 py-3 text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {staffList.map((person) => (
                      <tr key={person.id} className="hover:bg-slate-800/30">
                        <td className="px-3 py-3 font-medium">{person.full_name || 'İsimsiz'}</td>
                        <td className="px-3 py-3 text-slate-300 font-mono text-xs">{person.username}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="time"
                              value={person.shift_start || ''}
                              onChange={(e) => updateStaffShiftField(person.id, 'shift_start', e.target.value)}
                              className="bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-xs"
                              title="Boş bırakılırsa şube saati kullanılır"
                            />
                            <span className="text-slate-500">-</span>
                            <input
                              type="time"
                              value={person.shift_end || ''}
                              onChange={(e) => updateStaffShiftField(person.id, 'shift_end', e.target.value)}
                              className="bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-xs"
                            />
                            <button
                              onClick={() => saveStaffShift(person)}
                              className="p-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 rounded"
                              title="Çalışma Saatini Kaydet"
                            >
                              <Save className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-xs">
                          <div className="flex flex-col gap-1">
                            <span
                              className={`w-fit px-2 py-0.5 rounded font-semibold ${
                                person.role === 'admin'
                                  ? 'bg-indigo-500/20 text-indigo-300'
                                  : 'bg-slate-700 text-slate-300'
                              }`}
                            >
                              {person.role === 'admin' ? 'Yönetici' : 'Personel'}
                            </span>
                            {person.role !== 'admin' && person.device_id && (
                              <span className="text-emerald-400 flex items-center gap-1">
                                <Smartphone className="w-3 h-3" /> Cihaz Tanımlı
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right flex items-center justify-end gap-1.5">
                          {person.device_id && person.role !== 'admin' && (
                            <button
                              onClick={() => resetDeviceLock(person.id, person.full_name)}
                              className="text-xs px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-amber-300"
                            >
                              Sıfırla
                            </button>
                          )}
                          <button
                            onClick={() => deleteUser(person.id, person.full_name)}
                            className="p-1.5 text-slate-400 hover:text-red-400"
                            title="Kullanıcıyı Sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* TALEP ONAY / GEREKÇELİ RED KARAR MODALI */}
      {decisionModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <MessageSquareWarning
                  className={`w-5 h-5 ${
                    decisionModal.decision === 'rejected' ? 'text-red-400' : 'text-emerald-400'
                  }`}
                />
                <h3 className="font-bold text-base text-white">
                  {decisionModal.decision === 'rejected'
                    ? 'İzin Talebini Reddet'
                    : 'İzin Talebini Onayla'}
                </h3>
              </div>
              <button
                onClick={() => setDecisionModal(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 mb-4 text-xs space-y-1">
              <p className="text-slate-300">
                <span className="text-slate-500">Personel:</span>{' '}
                <strong className="text-white">
                  {(Array.isArray(decisionModal.req.profiles)
                    ? decisionModal.req.profiles[0]?.full_name
                    : decisionModal.req.profiles?.full_name) || 'Personel'}
                </strong>
              </p>
              <p className="text-slate-300">
                <span className="text-slate-500">Talep:</span> {decisionModal.req.leave_type} (
                {new Date(decisionModal.req.start_date).toLocaleDateString('tr-TR')} –{' '}
                {new Date(decisionModal.req.end_date).toLocaleDateString('tr-TR')})
              </p>
              {decisionModal.req.reason && (
                <p className="text-slate-400 italic pt-1">"{decisionModal.req.reason}"</p>
              )}
            </div>

            <form onSubmit={submitLeaveDecision} className="space-y-4">
              {decisionModal.decision === 'rejected' && (
                <div>
                  <p className="text-[11px] text-slate-400 mb-2">Hızlı Gerekçe Seçin:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_REJECTION_REASONS.map((txt, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setDecisionReason(txt)}
                        className="text-left text-[11px] px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-200 transition"
                      >
                        {txt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  {decisionModal.decision === 'rejected'
                    ? 'Red Gerekçesi (Personele iletilecek - Zorunlu)'
                    : 'Yönetici Notu (Personele iletilecek - İsteğe bağlı)'}
                </label>
                <textarea
                  rows={3}
                  required={decisionModal.decision === 'rejected'}
                  value={decisionReason}
                  onChange={(e) => setDecisionReason(e.target.value)}
                  placeholder={
                    decisionModal.decision === 'rejected'
                      ? 'Örn: Bu tarihlerde vardiyada eksik personel kalacağı için onaylanamamıştır.'
                      : 'Örn: İyi tatiller dileriz.'
                  }
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDecisionModal(null)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-semibold text-slate-300"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={submittingDecision}
                  className={`px-5 py-2.5 rounded-xl text-xs font-semibold text-white transition disabled:opacity-50 ${
                    decisionModal.decision === 'rejected'
                      ? 'bg-red-600 hover:bg-red-500'
                      : 'bg-emerald-600 hover:bg-emerald-500'
                  }`}
                >
                  {submittingDecision
                    ? 'Kaydediliyor...'
                    : decisionModal.decision === 'rejected'
                    ? 'Reddet ve Bildir'
                    : 'Onayla ve Puantaja İşle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ŞUBE QR KOD YAZDIRMA MODALI */}
      {qrModalLoc && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-white text-slate-950 rounded-2xl p-8 max-w-sm w-full text-center relative shadow-2xl">
            <button
              onClick={() => setQrModalLoc(null)}
              className="absolute top-3 right-3 p-2 rounded-lg text-slate-500 hover:bg-slate-100 print:hidden"
            >
              <X className="w-5 h-5" />
            </button>

            <p className="text-xs font-bold uppercase tracking-widest text-emerald-700 mb-1">
              PERSONEL GİRİŞ - ÇIKIŞ
            </p>
            <h2 className="text-2xl font-extrabold mb-4">{qrModalLoc.name}</h2>

            <div className="bg-white p-4 rounded-xl border-2 border-slate-200 inline-block mb-4">
              <QRCodeSVG
                value={`${originUrl}/scan?loc=${encodeURIComponent(qrModalLoc.qr_secret)}`}
                size={220}
                level="H"
              />
            </div>

            <p className="text-xs text-slate-600 mb-5">
              Giriş veya çıkış yapmak için telefonunuzdan uygulamayı açıp bu QR kodu okutun.
            </p>

            <button
              onClick={() => window.print()}
              className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 print:hidden"
            >
              <Printer className="w-4 h-4" /> Yazdır / PDF Kaydet
            </button>
          </div>
        </div>
      )}
    </div>
  );
}