import {
  Building2,
  Compass,
  Heart,
  MessageCircle,
  Mic,
  Sparkles,
  Target,
  type LucideIcon,
} from "lucide-react";

/**
 * Icons used by meeting type cards. Keys mirror meeting_types.icon_name
 * values seeded in supabase/seed_meeting_types.sql. Falls back to
 * Sparkles for unknown names.
 */
export const MEET_ICON_MAP = {
  MessageCircle,
  Heart,
  Building2,
  Compass,
  Mic,
  Sparkles,
  Target,
} satisfies Record<string, LucideIcon>;

export type MeetIconName = keyof typeof MEET_ICON_MAP;
