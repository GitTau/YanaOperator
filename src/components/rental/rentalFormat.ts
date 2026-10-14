// Small display helpers shared by the Rental Desk components.
import { Colors } from '../../constants/design';
import type { RentalStatement } from '../../services/rentalEngineService';

type Installment = RentalStatement['installments'][number];

export function installmentLabel(plan: RentalStatement['plan'], i: Installment): string {
  if (plan === 'Weekly') return i.cycle === 1 ? 'Week 1 rent (start)' : `Week ${i.cycle} rent`;
  if (i.cycle === 1 && i.part === 1) return 'Month 1 · part 1 (start)';
  return `Month ${i.cycle} · part ${i.part}`;
}

export const INSTALLMENT_CHIP: Record<Installment['status'], { label: string; bg: string; text: string }> = {
  paid:     { label: 'PAID',     bg: Colors.surfaceGreen, text: Colors.textSuccess },
  upcoming: { label: 'UPCOMING', bg: Colors.borderLight,  text: Colors.textSecondary },
  due:      { label: 'DUE',      bg: Colors.surfaceBlue,  text: Colors.blueText },
  grace:    { label: 'GRACE',    bg: Colors.surfaceAmber, text: Colors.textWarning },
  overdue:  { label: 'OVERDUE',  bg: Colors.surfaceRed,   text: Colors.textError },
  on_hold:  { label: 'ON HOLD',  bg: Colors.borderLight,  text: Colors.textMuted },
};

/** Paid parts, anything open now, and only the next upcoming part. */
export function visibleInstallments(st: RentalStatement): Installment[] {
  let upcomingShown = false;
  return st.installments.filter((i) => {
    if (i.status !== 'upcoming' && i.status !== 'on_hold') return true;
    if (upcomingShown) return false;
    upcomingShown = true;
    return true;
  });
}

export function shortDate(isoOrDate: string | null): string {
  if (!isoOrDate) return '—';
  const d = isoOrDate.length === 10 ? new Date(`${isoOrDate}T00:00:00+05:30`) : new Date(isoOrDate);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

export function shortDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata',
  });
}
