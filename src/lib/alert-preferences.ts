import type { RadarLane } from '@/lib/release-radar';

export type AlertLane = RadarLane;

export interface AlertRules {
  lanes: AlertLane[];
  weeklyDigest: boolean;
  inAppNotifications: boolean;
  /** Opt-out for weekly digest email delivery — in-app digest stays on. */
  emailOptOut: boolean;
  momentumMinDelta: number;
  dormantDays: number;
}

export const DEFAULT_ALERT_RULES: AlertRules = {
  lanes: [],
  weeklyDigest: false,
  inAppNotifications: false,
  emailOptOut: false,
  momentumMinDelta: 100,
  dormantDays: 365,
};

const VALID_LANES = new Set<AlertLane>(['release', 'maintenance', 'momentum']);

export function parseAlertRules(raw: string | null | undefined): AlertRules {
  if (!raw) return { ...DEFAULT_ALERT_RULES };
  try {
    const parsed = JSON.parse(raw) as Partial<AlertRules>;
    const lanes = Array.isArray(parsed.lanes)
      ? parsed.lanes.filter((lane): lane is AlertLane => VALID_LANES.has(lane as AlertLane))
      : [];
    return {
      lanes,
      weeklyDigest: Boolean(parsed.weeklyDigest),
      inAppNotifications: Boolean(parsed.inAppNotifications),
      emailOptOut: Boolean(parsed.emailOptOut),
      momentumMinDelta:
        typeof parsed.momentumMinDelta === 'number' && parsed.momentumMinDelta > 0
          ? Math.round(parsed.momentumMinDelta)
          : DEFAULT_ALERT_RULES.momentumMinDelta,
      dormantDays:
        typeof parsed.dormantDays === 'number' && parsed.dormantDays >= 90
          ? Math.round(parsed.dormantDays)
          : DEFAULT_ALERT_RULES.dormantDays,
    };
  } catch {
    return { ...DEFAULT_ALERT_RULES };
  }
}

export function serializeAlertRules(rules: AlertRules): string {
  return JSON.stringify({
    lanes: rules.lanes.filter((lane) => VALID_LANES.has(lane)),
    weeklyDigest: rules.weeklyDigest,
    inAppNotifications: rules.inAppNotifications,
    emailOptOut: rules.emailOptOut,
    momentumMinDelta: rules.momentumMinDelta,
    dormantDays: rules.dormantDays,
  });
}

export function mergeAlertRules(current: AlertRules, patch: Partial<AlertRules>): AlertRules {
  return {
    lanes: patch.lanes ?? current.lanes,
    weeklyDigest: patch.weeklyDigest ?? current.weeklyDigest,
    inAppNotifications: patch.inAppNotifications ?? current.inAppNotifications,
    emailOptOut: patch.emailOptOut ?? current.emailOptOut,
    momentumMinDelta: patch.momentumMinDelta ?? current.momentumMinDelta,
    dormantDays: patch.dormantDays ?? current.dormantDays,
  };
}
