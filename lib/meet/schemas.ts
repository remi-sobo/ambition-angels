import { z } from "zod";

/** Body schema for POST /api/meet/book. */
export const bookSchema = z.object({
  meetingTypeSlug: z.string().min(1),
  startTime: z.string().datetime(),
  attendeeTimezone: z.string().min(1),
  /**
   * Required when the meeting type has duration_options; ignored otherwise.
   * Must be one of the type's duration_options or the type's
   * duration_minutes.
   */
  durationMinutes: z.number().int().min(5).max(240).optional(),
  /**
   * Required when the meeting type has more than one entry in
   * location_options; defaults to 'video' otherwise.
   */
  locationType: z.enum(["video", "in_person"]).optional(),
  /**
   * Attendee-supplied address suggestion. Used only when locationType is
   * 'in_person' and the meeting type has no default_in_person_address.
   */
  inPersonAddress: z.string().max(500).optional(),
  attendee: z.object({
    name: z.string().min(1).max(200),
    email: z.string().email().max(320),
    company: z.string().max(200).optional(),
    role: z.string().max(80).optional(),
    message: z.string().max(2000).optional(),
  }),
});
export type BookInput = z.infer<typeof bookSchema>;

/** Body schema for POST /api/meet/booking/[token]/reschedule. */
export const rescheduleSchema = z.object({
  newStartTime: z.string().datetime(),
});

/** Body schema for POST /api/meet/booking/[token]/cancel. */
export const cancelSchema = z.object({
  reason: z.string().max(2000).optional(),
});
