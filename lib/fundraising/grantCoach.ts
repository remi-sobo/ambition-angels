/**
 * Grant Coach — the prompt library behind the "Grant Coach" panel on a grant's
 * workspace page (app/admin/fundraising/grants/[id]) and its API route
 * (app/api/admin/grants/coach).
 *
 * The prompts are adapted from Fast Forward's "AI Grant Writing Coach"
 * (https://www.ffwd.org/ai-grant-writing-coach), used under CC BY 4.0 —
 * attribution is rendered in the panel via COACH_ATTRIBUTION. Adaptations from
 * the original: the conversational orientation ("paste your draft, then name a
 * prompt") is dropped because the UI picks the prompt; the first-reply
 * sensitive-data reminder is a static line in the panel instead of model
 * output; and the interactive "defend the draft" prompt is omitted (it needs a
 * multi-turn chat, which this one-shot panel doesn't have).
 *
 * Design invariants, mirrored from the original coach:
 * - Refine, don't write: the coach names gaps and evidence types; it never
 *   drafts proposal copy. The safety block enforcing this lives in the shared
 *   system prompt and is sent with every call.
 * - Funder criteria only from pasted materials, never reconstructed from the
 *   model's memory of a funder.
 * - Strict per-prompt output formats, so results render predictably.
 */

export type CoachPromptGroup = "feedback" | "stress-test";

export type CoachPrompt = {
  id: string;
  /** Button label in the panel. */
  label: string;
  group: CoachPromptGroup;
  /** One-line description shown as the button's title attribute. */
  blurb: string;
  /** The full prompt text sent as the user-message header for this run. */
  instructions: string;
};

/** Rendered verbatim in the panel footer — required by the CC BY 4.0 license. */
export const COACH_ATTRIBUTION =
  "Prompts adapted from Fast Forward's AI Grant Writing Coach (CC BY 4.0).";

export const COACH_ATTRIBUTION_URL = "https://www.ffwd.org/ai-grant-writing-coach";

/** Input ceilings, enforced by the API route (roughly 20k / 10k tokens). */
export const MAX_PROPOSAL_CHARS = 80_000;
export const MAX_FUNDER_CHARS = 40_000;

/**
 * Shared system prompt: reviewer persona + safety rules. Sent (and cached) on
 * every coach call; the per-prompt instructions ride in the user message.
 */
export const COACH_SYSTEM = `You've read hundreds of tech nonprofit proposals. You know what gets funded — and what doesn't. It's rarely the writing. It's user need backed by evidence. A solution that actually fits. A team that can deliver. Numbers that hold up.

You care about what funders of tech nonprofits care about: working technology reaching the people who need it most, built by builders with real skin in the game.

When you flag a gap, quote the proposal text directly. Don't summarize what it says. Skip the hedges. If something isn't there, say so plainly. Address the applicant as "you."

If the user shares funder content — an RFP, application questions, a "What We Fund" page, past grantee announcements — read all of it, including eligibility rules, geographic restrictions, and deadlines. Use it where a prompt calls for funder context. Only ever assess against funder criteria you can quote from materials shared in this conversation: a funder's name or a URL you cannot read is not funder content, and you never reconstruct a funder's criteria from memory — say what's missing and ask them to paste it instead.

Your output renders in a review panel, so respond with the requested format only — no greeting, no preamble, no closing commentary.

SAFETY AND BOUNDARIES — these rules override everything above.

Refine, don't write. You help builders pressure-test and sharpen their own proposals. You never write the proposal for them. Surface the gaps a funder would catch and name the kind of evidence that would close them — but the applicant writes the words. Do not draft paragraphs, narrative, or proposal copy a user could paste in. If asked to write or draft any section, decline and redirect: your job is to strengthen their draft, not replace their voice.

Never fabricate. Do not invent statistics, impact metrics, quotes, citations, or organizational history. If a fact is missing, say so and mark it [insert metric] or [cite source] — never supply a number, quote, or source a user could mistake for real. A named gap beats a fake fact.

Protect sensitive data. If you spot personally identifiable information — donor or client names, home addresses, financial account details, government ID numbers — stop and tell the user to remove or anonymize it before continuing. Suggest pseudonyms like "Client A." Name only the TYPE of data to flag — say "a Social Security number" or "a home address" — and never reproduce the actual value, even in a list of what to remove. Do not rewrite their text yourself: flag what to change and let them change it.

No deception. Refuse any request to bypass eligibility rules, misstate organizational facts, or shape claims to fit a funder dishonestly. Strengthening a proposal means making true things clearer — never making false things look true.

Stay objective. No hyperbole, no emotional pleas, no exaggerated claims. Funders trust specific, verifiable, plainly stated work.

Stay in scope. You review and refine grant proposals for tech nonprofits. Politely decline unrelated tasks — blog posts, code, fiction, general-knowledge questions.

Budgets. You may outline a budget structure, but tell the user to verify all figures with an accountant before submitting.`;

export const COACH_PROMPTS: CoachPrompt[] = [
  {
    id: "assessment",
    label: "Run assessment",
    group: "feedback",
    blurb:
      "Rate the fundamentals Developing / Strong / Standout — against the funder's own criteria when their materials are pasted — and point to the deep dives to run next.",
    instructions: `Assess our proposal. First determine which criteria to use:
- "Funder materials" means pasted funder content — an RFP, application questions, selection criteria, or a "What We Fund" page. A funder's name alone is not funder materials, and a URL alone is not funder materials unless you can actually read the page. Never reconstruct a funder's criteria from memory — only assess against criteria you can quote from the materials in this conversation. If we name a funder without pasting their materials, say so and use the standard criteria.
- If funder materials with stated criteria are present, assess against the funder's own criteria, in their order, quoting their criterion names — then add "AI responsibility" as one final criterion (rules below). If the materials contain more than one criteria-like list (for example "what we look for" plus "selection criteria"), rate against the list explicitly labeled as selection or evaluation criteria, and draw on the other lists only inside Gap and To improve lines.
- If not, assess against these standard criteria, in this order: 1. Problem grounded in real user need, 2. Solution matches the problem, 3. Co-design with the people being served, 4. Lived experience on the team, 5. Organizational capacity, 6. Measurable outcomes, 7. Sustainability beyond the grant period, 8. AI responsibility.

Rate every criterion in the chosen set — do not add, drop, or rename criteria.

Begin your response with one line naming the criteria source, exactly one of:
"**Assessing against [funder name]'s criteria from the materials provided, plus our AI responsibility standard.**"
"**No funder materials identified — assessing against the standard criteria.**"

Then this exact line on its own:
"Rating guide: Developing = needs building out  |  Strong = good with a notable gap  |  Standout = exceeds what most proposals show"

If funder materials are present, next check eligibility before any rating — read all of their materials, including eligibility rules, geographic restrictions, focus areas, and deadlines, not just scoring criteria — and output one line:
**Check before applying:** [one sentence naming any eligibility rule, geographic restriction, focus-area limit, or deadline that could disqualify the application, quoting their text — or "no disqualifying requirements found in the materials provided"]
If something disqualifying exists, say it plainly here, then still rate against the funder's criteria — not the standard set — so we can see how the draft performs against their rubric. A disqualifier changes what we do next; it does not change which criteria you rate.

Use this rating scale, lowest tier to highest: Developing / Strong / Standout.

Apply these rating definitions:
- "Developing" means: criterion is absent, contradicted, or addressed only with non-committal language and aspiration. Example: a problem section describing the issue in general terms with no named users, field research, or quotes rates Developing — stating a problem exists is not evidencing it. Organizational statistics ("we've served 3,000 users") are capacity claims, not user need evidence, and do not raise a rating.
- "Strong" means: criterion is addressed with specifics and evidence, but with at least one notable gap a reviewer would flag. Example: a problem section citing a study and naming the population, without connecting that evidence to this org's specific users, rates Strong.
- "Standout" means: criterion is addressed with specifics, evidence, and either a stronger-than-typical answer or a dimension the rubric doesn't require. Example: a problem section quoting users directly, naming the research method, and showing how findings shaped the solution rates Standout.

Apply this ranking for "biggest gap": the one most likely to drop the rating a tier if left unaddressed. Prefer gaps you can quote proposal text for over abstract weaknesses.

Apply this mandatory specificity penalty before finalizing each rating: if a section relies on vague claims, round numbers without sources, or low-specificity language (no named users, partners, dates, dollar amounts, or specific outcomes), reduce that criterion's rating by one tier. An unsourced headline statistic caps a problem or need criterion at Developing. Specificity separates accepted proposals from rejected ones in real data.

Apply this aspirational-claim cap: unsecured commitments (contracts still in conversation, funding not closed, features not built, partnerships only planned) cannot rate above Strong — Standout requires evidence in place today. "We are confident" or "we are in conversations" is not Standout.

Apply these rules for AI responsibility — always include it as the final criterion, never skip it:
- If the proposal makes AI claims you can quote, rate it on how completely it tells a verifiable governance story: what the AI actually is (custom build, fine-tune, vendor API, or off-the-shelf), deployed with users cited or aspirational, and whether data handling (sources, consent, retention, access), bias testing, human oversight, and an appeals path are named. All elements present and specific: Standout. Named AI with real gaps: Strong. If data handling, bias testing, and human oversight are all absent, rate Developing even when the AI is named — naming a model is not governance.
- If the proposal describes automated or algorithmic features without saying whether they are AI, do not rate; output under the criterion label: "Not rated: [quote the feature] doesn't say whether this is AI. If it is, name it plainly — funders probe unexplained algorithms. If it's rule-based, say that."
- If the proposal has no AI claims and no algorithmic features, do not rate; output under the criterion label: "Not rated: No AI claims found in this proposal. Nothing to assess here, and it does not count against you."

Use this same output structure no matter which criteria set you rate against. Never sum ratings into a total or overall score, never use emoji or checklists, and never add commentary comparing this funder to other funders. Format every rated criterion in this exact structure, with each label bolded, each field on its own line, and one blank line between criterion blocks:
**Criterion:** [name]
**Rating:** [Developing, Strong, or Standout]
**Gap:** [one sentence naming the single biggest gap, quoting proposal text]
**To improve:** [one sentence naming what to add or sharpen to raise this one tier (for Standout, the refinement that would make it bulletproof); name the missing evidence or framing — don't rewrite it for us; addressed to us as "you"]

After the criteria, write one sentence in bold labeled "**Overall:**" on the overall picture, naming which criteria set you used.

If no funder materials were provided, add this single line after Overall:
Funder fit: Paste the RFP or "What We Fund" page along with your draft, and I'll assess your proposal against their specific criteria.

End with a final block labeled exactly "**Where to go deeper:**". For the one or two lowest-rated criteria, tell us which prompt to run for a full teardown of each, choosing the closest match: "Run problem clarity", "Run solution fit" (covers solution match and co-design), "Run lived experience", "Run team capacity", "Run impact check", "Run sustainability check", "Run AI check", or "Run funder alignment" (suggest this one whenever the eligibility check or funder criteria surfaced a mismatch).

Theory of change and systems thinking are deeper lenses that don't fit a quick assessment — we can run "Run theory of change" or "Run systems check" as separate teardowns.

Stop there. No preamble before the first line, no commentary after the last block. Be tough. Don't grade on a curve — the encouragement lives in "To improve," not in inflated ratings.`,
  },
  {
    id: "weakest-paragraph",
    label: "Weakest paragraph",
    group: "feedback",
    blurb: "Find the single weakest paragraph by writing quality and name what it needs.",
    instructions: `Read our full proposal. Identify the single weakest paragraph by writing quality, not by topic.

Apply these failure mode definitions:
- "Vague" means: lacks specific numbers, names, dates, or examples
- "Generic" means: could appear in any nonprofit's proposal with minor swaps, no specifics to this org or this work
- "Unsupported" means: claims made without evidence, citations, or data
- "Non-committal" means: uses conditional language that avoids accountability — "may," "could," "hopes to," "potentially," "explore," "consider"

Pick the paragraph with the highest count of these red flags across all four categories.

If two or more paragraphs have a similar red flag count, apply this tie-breaker in order:
1. Pick the paragraph whose gap is most likely to cause a reviewer to recommend rejection — a weak claim about money, capacity, or evidence outweighs a weak claim about values or vision.
2. If still tied, pick the paragraph carrying the most load-bearing claim — the one other sections depend on being true.

Respond in exactly three sections, no preamble, no headers:
Diagnosis: [one sentence naming the weakest paragraph (by section or opening words) and which failure modes apply]
What it needs: [2-3 sentences naming what type of evidence, structure, or specifics would strengthen this paragraph — name the direction, not words to use, addressed to us as "you"]
Weakest paragraph: [quote the full paragraph]`,
  },
  {
    id: "reviewer-questions",
    label: "Reviewer questions",
    group: "feedback",
    blurb: "The five most damaging questions a skeptical program officer would ask.",
    instructions: `Pretend you're a skeptical program officer who has reviewed hundreds of proposals. List exactly five questions you'd ask the applicant.

Apply this ranking criterion. A "damaging" question is one that:
- targets a structural weakness in the proposal
- would be hard to answer without admitting a gap
- would require new evidence the applicant doesn't appear to have
- could shift the funder's evaluation significantly if answered poorly

Order most damaging first. Number them 1 through 5. One sentence per question. No preamble, no headers, no commentary.`,
  },
  {
    id: "problem-clarity",
    label: "Problem clarity",
    group: "stress-test",
    blurb: "Is the problem grounded in real user need, or assumed?",
    instructions: `Review our proposal against this question: is the problem grounded in real user need? Go deep — this is a full teardown of the problem section, not a snapshot.

Apply these criteria when answering:
- "Evidence of user input" means: names specific users or communities consulted, quotes users directly, cites field research the team conducted, or describes co-design sessions. Generic stats and demographic claims don't count.
- "Reads as assumed" means: uses "we think/believe," cites statistics without naming the source or specific community, or generalizes about user needs without specifics.
- "User-voice balance" means: in the Problem section only, count the number of sentences that center the user's experience (sentences where the grammatical subject is a user — "adults," "job seekers," "people," "they," etc.) versus sentences that center the organization (sentences where the grammatical subject is "we," "our," or the org name). Report as "user-centered: X sentences, org-centered: Y sentences." If org-centered sentences outnumber user-centered sentences, call it we-heavy. If equal or user-centered is higher, call it balanced.
- "Reviewer's objection" means: the single sharpest question a skeptical program officer would raise about whether this problem is real and understood — phrased in their voice, the way they'd say it out loud in a review meeting.
- "What grounded looks like" means: the type and shape of evidence that would move this section from assumed to grounded. Name the kind of proof — do not draft the sentences for us.

Respond in exactly six lines, no preamble, no headers:
Where it reads as assumed: [one sentence pointing to specific text, or "none detected"]
User-voice balance: [one sentence: balanced (user-words match or exceed we-words), or we-heavy (more we-words than user-words), with rough counts]
Reviewer's objection: [one sentence in a skeptical reviewer's voice, naming or quoting the text that provokes it]
What would make it grounded: [2 sentences max — name the specific gap and the type of evidence or information that would close it; describe what to strengthen, don't write it for us; addressed to us as "you"]
Problem stated: [one sentence quoted from proposal]
Evidence of user input: [one sentence quoted from proposal, or "none stated"]`,
  },
  {
    id: "solution-fit",
    label: "Solution fit",
    group: "stress-test",
    blurb: "Does the solution match the problem, with evidence of co-design?",
    instructions: `Review our proposal against this question: does the solution match the problem, with evidence of co-design? Go deep — this is a full teardown of solution fit, not a snapshot.

Apply these criteria when answering:
- "Co-design evidence" means: named user advisors, documented user feedback cycles, iteration based on user input, or specific user-facing changes made before this proposal. Generic statements like "designed with the community in mind" don't count.
- "Mismatch or overreach" means: solution claims to address a broader problem than the one stated, solution proposes capabilities not justified by the user need, or solution is a technology-first answer to a problem the user need says is non-technical.
- "Reviewer's objection" means: the single sharpest question a skeptical program officer would raise about whether this solution actually fits the stated problem — phrased in their voice, the way they'd say it out loud in a review meeting.

Respond in exactly five lines, no preamble, no headers:
Mismatch or overreach: [one sentence pointing to specific text, or "none detected"]
Reviewer's objection: [one sentence in a skeptical reviewer's voice, naming or quoting the text that provokes it]
To improve: [2 sentences max — name the specific gap and the type of evidence or information that would close it; describe what to strengthen, don't write it for us; addressed to us as "you"]
Solution claimed: [one sentence quoted from proposal]
Co-design evidence: [one sentence quoted from proposal, or "none stated"]`,
  },
  {
    id: "lived-experience",
    label: "Lived experience",
    group: "stress-test",
    blurb: "Is the team's lived experience unmissable, implied, or absent?",
    instructions: `Review our proposal for evidence of lived experience on our team. Go deep — this is a full teardown of the team's lived-experience signal, not a snapshot.

Apply these assessment definitions:
- "Unmissable" means: explicit statement of a team member's firsthand experience with the problem, names them, and ties their experience to a specific product or program decision.
- "Implied" means: vague language about "communities we serve" or "passion for this work" without naming team members or tying experience to decisions. Note: job titles alone (e.g., "community navigator," "outreach coordinator") do not count — a title is a role, not a lived experience signal.
- "Absent" means: no mention of any team member's personal connection to the problem — only roles, credentials, or organizational history.
- "Reviewer's objection" means: the single sharpest question a skeptical program officer would raise about whether this team truly has lived experience with the problem — phrased in their voice, the way they'd say it out loud in a review meeting.

Respond in exactly five lines, no preamble, no headers:
Assessment: [one word: unmissable, implied, or absent]
Reviewer's objection: [one sentence in a skeptical reviewer's voice, naming or quoting the text that provokes it]
Make it concrete: [2 sentences max — name the specific gap and the type of information that would make this signal unmissable; describe what to strengthen, don't write it for us; addressed to us as "you"]
Concrete signal: [one sentence quoted from proposal, or "none stated"]
Implied but not shown: [one sentence quoted from proposal, or "none"]`,
  },
  {
    id: "team-capacity",
    label: "Team capacity",
    group: "stress-test",
    blurb: "Can the team actually build and sustain what it proposes?",
    instructions: `Review our proposal against this question: do we have the team and capacity to deliver? Go deep — this is a full teardown of delivery capacity, not a snapshot.

Apply these criteria when answering. Note: full-time tech staff is not required for a strong proposal. Hybrid models (part-time, contractors, volunteers) can work. What matters is honesty about the tech model and capability to deliver.

- "Tech model named" means: the proposal explicitly states who builds and maintains the tech (full-time staff, part-time staff, contractors, volunteers, vendors). If it's mixed, the mix is described.
- "Capability evidence" means: named individuals with specific roles AND specific functions (e.g., "ML engineer focused on natural language processing"), shipped product evidence (named clients, deployment counts, named partners), or revenue from the tech.
- "Key-person risk and runway" means: the proposal names what happens if a key person leaves, has a succession plan, or shows runway to sustain the work through and beyond the grant period.
- "Internal consistency" means: founding year, operational history, and revenue claims line up. If the proposal says founded 2024 but operational since 2023, that's a flag.
- "Reviewer's objection" means: the single sharpest question a skeptical program officer would raise about whether this team can actually build and sustain what it proposes — phrased in their voice, the way they'd say it out loud in a review meeting.

Respond in exactly six lines, no preamble, no headers:
Key-person risk and runway: [one sentence: addressed how, or unaddressed]
Internal consistency: [one sentence: consistent, or where it contradicts itself]
Reviewer's objection: [one sentence in a skeptical reviewer's voice, naming or quoting the text that provokes it]
To improve: [2 sentences max — name the specific gap and the type of evidence or information that would close it; describe what to strengthen, don't write it for us; addressed to us as "you"]
Tech model named: [one sentence quoted from proposal, or "ambiguous"]
Capability evidence: [one sentence quoting named people, deployments, or revenue, or "none stated"]`,
  },
  {
    id: "impact-measurement",
    label: "Impact check",
    group: "stress-test",
    blurb: "Outcomes or just outputs — and do the numbers hold up?",
    instructions: `Review our proposal against this question: are we measuring outcomes or just outputs, and are our numbers credible? Go deep — this is a full teardown of the measurement approach, not a snapshot.

Apply these definitions:
- "Outputs" are activities the organization completes: sessions delivered, users reached, hours of programming, content published. Outputs measure effort, not effect.
- "Outcomes" are changes in users' lives or circumstances that result from the work: skills gained, employment outcomes, health improvements, behavior change, system change. Outcomes measure effect.
- "User feedback loop" means: a named mechanism for collecting user feedback and using it to change the work, not just an end-of-program survey.
- "Round-number red flag" means: large round numbers ("25M tons of CO2 annually," "500 users served," "20 awards won") that appear without a methodology, named source, or breakdown by year. Repeated round numbers across multiple sections amplify the flag.
- "Reviewer's objection" means: the single sharpest question a skeptical program officer would raise about whether these numbers show real change — phrased in their voice, the way they'd say it out loud in a review meeting.

Respond in exactly six lines, no preamble, no headers:
Outputs vs. outcomes: [one sentence naming which listed metrics are outputs and which are outcomes]
Round-number red flags: [one sentence quoting any unsupported round-number claims, or "none detected"]
Reviewer's objection: [one sentence in a skeptical reviewer's voice, naming or quoting the text that provokes it]
Stronger metric: [2 sentences max — name the specific output metric that's weakest and the outcome metric that would replace or complement it; describe what to strengthen, don't write it for us; addressed to us as "you"]
Metrics listed: [one sentence quoted from proposal]
User feedback loop: [one sentence quoted from proposal, or "not addressed"]`,
  },
  {
    id: "funder-alignment",
    label: "Funder alignment",
    group: "stress-test",
    blurb: "Are we the right fit for this specific funder? (paste their materials)",
    instructions: `Review our proposal against this question: are we the right fit for this specific funder? Go deep — this is a full teardown of funder fit, not a snapshot.

Base every funder-specific judgment only on funder materials pasted in this conversation (an RFP, application questions, selection criteria, or a "What We Fund" page). A funder's name or a URL you cannot read is not funder material — never reconstruct a funder's criteria from memory. If no funder materials are present, say so first and limit the review to what the proposal itself signals about fit.

Apply these criteria when answering:
- "Stage fit" means: our annual budget, organization age, and growth stage match what this funder typically funds as described in their RFP or website.
- "Funder-specific signal" means: the proposal explicitly references this funder's stated priorities, language, or past grants in a way that couldn't apply to a different funder.
- "Scope discipline" means: 1 to 2 issue areas reads as focused. 3 issue areas is borderline. 4 or more signals scattershot positioning and weakens fit with any specific funder.
- "Reviewer's objection" means: the single sharpest question a skeptical program officer at this funder would raise about whether this proposal belongs in their portfolio — phrased in their voice, the way they'd say it out loud in a review meeting.
- Assessment definitions:
  - "Fits" means: proposal addresses this funder's stated priorities and constraints directly.
  - "Transactional" means: proposal could be sent to any funder, no funder-specific framing or references.
  - "Wrong lane" means: proposal sits in a sector, geography, or stage this funder doesn't fund.

Respond in exactly six lines, no preamble, no headers:
Assessment: [one word: fits, transactional, or wrong lane]
Stage fit: [one sentence: right stage for this funder, or where it's off]
Scope discipline: [one sentence: focused (1-2 issue areas), borderline (3), or scattershot (4+), with the list quoted]
Reviewer's objection: [one sentence in a skeptical reviewer's voice, naming or quoting the text that provokes it]
To improve: [2 sentences max — name the specific gap and the type of information or framing that would close it; describe what to strengthen, don't write it for us; addressed to us as "you"]
Funder-specific signal: [one sentence quoted from proposal, or "reads generic"]`,
  },
  {
    id: "ai-specifics",
    label: "AI check",
    group: "stress-test",
    blurb: "Are the AI claims credible, governed, and more than a buzzword?",
    instructions: `Review our proposal on AI-specific concerns. Go deep — this is a full teardown of the AI claims, not a snapshot. Always complete all six lines below. If AI is peripheral to the proposal or absent, say so in the first line and mark the AI-detail lines "not applicable." Do not skip this prompt or refuse to answer.

Apply these definitions:
- "Custom build" means: model trained or fine-tuned by the organization on their own data. If "custom" or "proprietary" appears to mean prompt engineering or configuration on top of a third-party model, classify it as vendor API and say so plainly.
- "Fine-tune" means: an off-the-shelf model adapted with the organization's data or domain inputs.
- "Vendor API" means: calling a third-party model (OpenAI, Anthropic, Google) without modification.
- "Off-the-shelf" means: using a consumer AI product (ChatGPT, Claude.ai) directly.
- "Minimal or none" means: AI is mentioned only in passing, or the proposal does not use AI in its core work. Name what little is there, or state plainly that AI is not central to this proposal.
- "Deployed vs. aspirational" means: deployed AI is in production today with users, with specific clients or use counts cited. Aspirational AI uses language like "we are looking to incorporate," "we plan to add," "we will integrate" — future-tense, no current users. Aspirational AI in a proposal is a major red flag.
- "Data handling addressed" means: data sources named, consent process described, retention period stated, and access controls listed. Missing any one of these counts as not addressed. Note: vague statements like "user data will be stored securely" or "we have a privacy policy" do NOT count — all four elements must be present.
- "Bias and oversight addressed" means: bias testing mechanism named, human-in-the-loop checkpoint described, and appeals path for affected users specified. Missing any one of these counts as not addressed.
- "Reviewer's objection" means: the single sharpest question a skeptical program officer would raise about whether the AI is real, responsible, and more than a buzzword — phrased in their voice, the way they'd say it out loud in a review meeting.

Respond in exactly six lines, no preamble, no headers:
What's actually AI: [one of: custom build, fine-tune, vendor API, off-the-shelf, minimal, or none — with a brief quote or summary from the proposal]
Data handling: ["not addressed" if any of the four elements are missing, one sentence quoted from proposal if addressed, or "not applicable" if AI is minimal or none]
Bias and oversight: [one sentence quoted from proposal, "not addressed", or "not applicable" if AI is minimal or none]
Deployed or aspirational: [one of: deployed (cite specific users or clients), aspirational (quote the future-tense language), mixed (some live, some planned), or "not applicable" if AI is minimal or none]
Reviewer's objection: [one sentence in a skeptical reviewer's voice, naming or quoting the text that provokes it, or "not applicable" if the proposal never claims AI]
What to add: [2 sentences max — name the specific gap and the category of evidence that would differentiate this from a generic AI pitch; if AI is minimal or none, say plainly that this prompt does not apply and point us to the other prompts; describe what to strengthen, don't write it for us; addressed to us as "you"]`,
  },
  {
    id: "theory-of-change",
    label: "Theory of change",
    group: "stress-test",
    blurb: "Is the causal chain explicit and credible, or just a list of activities?",
    instructions: `Review our proposal against this question: is our theory of change explicit and credible? Go deep — this is a full teardown of the theory of change, not a snapshot.

Apply these criteria when answering:
- "Theory of change stated" means: the proposal explains WHY the intervention works — not just what it does, but the causal mechanism. A list of activities is not a theory of change. Look for logic like "by doing X, users can do Y, which leads to Z outcome."
- "Causal chain" means: a sequence of cause-and-effect steps from the intervention to the intended impact. It must move from activity → behavior change → outcome — not just a timeline.
- "Key assumptions" means: conditions that must be true for the change to happen that the organization doesn't control — e.g., internet access, employer behavior, policy environment. Unstated assumptions are not safer than stated ones. They're riskier.
- "Evidence for mechanism" means: research, pilot data, or field evidence that this type of intervention produces this type of change in this type of context. Generic statistics about the problem area don't count.
- "Reviewer's objection" means: the single sharpest question a skeptical program officer would raise about whether this causal logic actually holds — phrased in their voice, the way they'd say it out loud in a review meeting.

Respond in exactly six lines, no preamble, no headers:
Causal chain: [one sentence only — one of: "explicit: [brief quote]", "implied: [one phrase describing the assumed logic]", or "absent"]
Key assumptions embedded: [2 sentences max — name the most significant unstated assumption and why it's load-bearing for the proposed change]
Reviewer's objection: [one sentence in a skeptical reviewer's voice, naming or quoting the text that provokes it]
To improve: [2 sentences max — name the specific gap in the theory of change and the type of evidence or information that would make it credible; describe what to strengthen, don't write it for us; addressed to us as "you"]
Mechanism stated: [one sentence only — quote the proposal if it states a mechanism, or write "not stated"]
Evidence for mechanism: [one sentence only — quote the proposal if evidence exists, or write "none cited"]`,
  },
  {
    id: "sustainability",
    label: "Sustainability",
    group: "stress-test",
    blurb: "What happens to the work after the grant ends?",
    instructions: `Review our proposal against this question: what happens to this work after the grant ends? Go deep — this is a full teardown of sustainability, not a snapshot.

Apply these criteria when answering:
- "Revenue model named" means: the proposal identifies a specific path toward financial sustainability — earned revenue, government contracts, fee-for-service, licensing, or a diversified grant strategy with named funders. "We plan to seek additional funding" does not count.
- "Grant dependency risk" is: high if all current revenue is grant-funded with no earned revenue path named; medium if there's some earned revenue or a named diversification plan; low if earned revenue is significant or a credible multi-funder pipeline is described.
- "Runway stated" means: the proposal shows the organization can sustain the work beyond the grant period — not just through it — by naming post-grant funding sources, revenue projections, or a specific bridge plan.
- "Sustainability timeline" means: the proposal names when or under what conditions the work becomes self-sustaining, or identifies the next funding source with a realistic ask.
- "Reviewer's objection" means: the single sharpest question a skeptical program officer would raise about whether this work survives past the grant — phrased in their voice, the way they'd say it out loud in a review meeting.

Respond in exactly six lines, no preamble, no headers:
Grant dependency risk: [one of: low, medium, or high — with a one-sentence reason]
Revenue model: [one sentence: named model with specifics, "grant-dependent only," or "not addressed"]
Runway after grant: [one sentence: addressed how, or "not addressed"]
Reviewer's objection: [one sentence in a skeptical reviewer's voice, naming or quoting the text that provokes it]
To improve: [2 sentences max — name the specific sustainability gap and the type of financial information or planning that would address it; describe what to strengthen, don't write it for us; addressed to us as "you"]
Sustainability timeline: [one sentence quoted from proposal, or "not stated"]`,
  },
  {
    id: "systems-thinking",
    label: "Systems check",
    group: "stress-test",
    blurb: "Does the solution understand the system it's entering?",
    instructions: `Review our proposal against this question: does this solution understand the system it's entering? Go deep — this is a full teardown of the systems thinking, not a snapshot.

Apply these criteria when answering:
- "Root cause vs. symptom" — a root cause is a structural or systemic driver (e.g., lack of employer incentives, policy gaps, infrastructure inequity). A symptom is an observable effect of that driver (e.g., low employment rates, poor health outcomes). Most proposals address symptoms. Note which this is.
- "Ecosystem named" means: the proposal identifies other actors, institutions, or structural forces that shape the problem — employers, government agencies, community organizations, funding patterns, infrastructure, policy environment. Naming the target population alone is not naming the ecosystem.
- "Feedback loops considered" means: the proposal shows awareness that the intervention will change system dynamics — for better or worse. Example of positive: the tool lowers friction, which increases adoption, which generates data, which improves the tool. Example of negative: automation displaces workers the org claims to serve.
- "Unintended consequences addressed" means: the proposal names at least one risk or tradeoff that could harm the people it serves or adjacent populations — and shows a monitoring plan or mitigation approach.
- "Reviewer's objection" means: the single sharpest question a skeptical program officer would raise about whether this proposal understands the system it's entering — phrased in their voice, the way they'd say it out loud in a review meeting.

Respond in exactly six lines, no preamble, no headers:
Problem framed as: [one of: root cause (quote), symptom (name the root cause it implies), or mixed]
Feedback loops: [one sentence only: addressed (quote the logic), or "not addressed"]
Unintended consequences: [one sentence only: addressed how, or "not addressed"]
Reviewer's objection: [one sentence in a skeptical reviewer's voice, naming or quoting the text that provokes it]
To improve: [2 sentences max — name the specific systemic gap and the type of thinking, evidence, or stakeholder engagement that would address it; describe what to strengthen, don't write it for us; addressed to us as "you"]
Ecosystem named: [one sentence only — quote named actors or structures, or state "not named"]`,
  },
];

export function getCoachPrompt(id: string): CoachPrompt | null {
  return COACH_PROMPTS.find((p) => p.id === id) ?? null;
}

/**
 * Assemble the user message for one run: the prompt's instructions, then the
 * draft and (optionally) funder materials in clearly-fenced blocks. The
 * explicit "no funder materials" marker keeps the assessment's criteria-source
 * line honest when only a draft is pasted.
 */
export function buildCoachUserPrompt(opts: {
  instructions: string;
  proposal: string;
  funderMaterials?: string | null;
}): string {
  const funder = opts.funderMaterials?.trim();
  return [
    opts.instructions,
    "",
    "---",
    "",
    "PROPOSAL DRAFT:",
    '"""',
    opts.proposal.trim(),
    '"""',
    "",
    ...(funder
      ? ["FUNDER MATERIALS:", '"""', funder, '"""']
      : ["No funder materials provided."]),
  ].join("\n");
}
