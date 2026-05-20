import { z } from "zod";

/** Body schema for POST /api/meet/book. */
export const bookSchema = z.object({
  meetingTypeSlug: z.string().min(1),
  startTime: z.string().datetime(),
  attendeeTimezone: z.string().min(1),
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
