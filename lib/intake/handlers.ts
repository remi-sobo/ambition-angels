import { application } from "./application";
import { coachSignup } from "./coach-signup";
import { companyContact } from "./company-contact";
import { demodaySignup } from "./demoday-signup";
import { donation } from "./donation";
import { partnerInquiry } from "./partner-inquiry";
import { quizSubmission } from "./quiz-submission";
import type { KindHandler } from "./types";
import { ygbRegistration } from "./ygb-registration";

/** Intake kinds, v1. The URL segment in POST /api/intake/v1/{kind}. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const INTAKE_HANDLERS: Record<string, KindHandler<any>> = {
  application,
  partner_inquiry: partnerInquiry,
  company_contact: companyContact,
  coach_signup: coachSignup,
  ygb_registration: ygbRegistration,
  demoday_signup: demodaySignup,
  quiz_submission: quizSubmission,
  donation,
};
