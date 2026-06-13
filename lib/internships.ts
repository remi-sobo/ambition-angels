export type Internship = {
  slug: string;
  title: string;
  category: string;
  tag: string; // short label shown on card
  duration: string;
  salaryRange: string;
  description: string; // 1-2 sentences for card
  longDescription: string; // full paragraph for detail page
  skills: string[];
  dayInTheLife: string[]; // 3-4 bullets
  careers: string[]; // related job titles
  whyItMatters: string;
};

export const internships: Internship[] = [
  {
    slug: "entrepreneurship",
    title: "Entrepreneurship",
    category: "Business",
    tag: "Business",
    duration: "30 days",
    salaryRange: "$40K – $250K+",
    description:
      "Build something from nothing. Learn how real founders identify problems, test ideas, and create businesses that generate revenue.",
    longDescription:
      "Entrepreneurs solve problems and build things that last. This internship walks you through the full arc of starting a business: finding a real need, validating your idea with real people, building a simple version, and figuring out how to make money from it. You will think like a founder from day one.",
    skills: ["Problem solving", "Financial modeling", "Pitching", "Market research", "Team building"],
    dayInTheLife: [
      "Interview potential customers to find an unmet need",
      "Build a one-page business model for your idea",
      "Create a simple pitch and practice it out loud",
      "Analyze a real startup story and spot the turning point",
    ],
    careers: ["Founder / CEO", "Product Manager", "Venture Capitalist", "Business Development"],
    whyItMatters:
      "Entrepreneurs create jobs, build wealth, and solve problems no one else will touch. Every industry needs people who can start something from scratch.",
  },
  {
    slug: "sales",
    title: "Sales",
    category: "Business",
    tag: "Business",
    duration: "30 days",
    salaryRange: "$45K – $200K+",
    description:
      "The highest-paid skill most schools never teach. Learn how to listen, persuade, and close deals that move any career forward.",
    longDescription:
      "Sales is not about being pushy. It is about understanding what people need and showing them how to get it. This internship covers the full sales process: prospecting, discovery calls, handling objections, and closing. These skills transfer to every job and every conversation you will ever have.",
    skills: ["Active listening", "Communication", "Negotiation", "CRM basics", "Objection handling"],
    dayInTheLife: [
      "Study a real sales script and identify what makes it work",
      "Role-play a cold call with a coach",
      "Research a prospect and write a personalized outreach message",
      "Analyze a lost deal and figure out where things went wrong",
    ],
    careers: ["Sales Representative", "Account Executive", "Sales Manager", "Business Development Rep"],
    whyItMatters:
      "Every company lives or dies by sales. Reps who can reliably close deals are among the highest-paid professionals in any industry.",
  },
  {
    slug: "game-design",
    title: "Game Design",
    category: "Technology",
    tag: "Tech",
    duration: "30 days",
    salaryRange: "$55K – $150K",
    description:
      "Games are a $200B industry. Learn the design thinking, storytelling, and systems behind the games you already love.",
    longDescription:
      "Game design is part art, part psychology, part engineering. This internship covers how games are conceived, how levels are structured, how mechanics create engagement, and how studios bring it all together. Whether you want to build games or just think more creatively, this internship teaches you how to design experiences people cannot put down.",
    skills: ["Design thinking", "Systems thinking", "User testing", "Storytelling", "Prototyping"],
    dayInTheLife: [
      "Deconstruct a game you love into its core mechanics",
      "Sketch a level map and explain the design decisions behind it",
      "Write a one-page game design document for an original idea",
      "Playtest a prototype and document player behavior",
    ],
    careers: ["Game Designer", "Level Designer", "UX Designer", "Product Designer", "Creative Director"],
    whyItMatters:
      "Game design teaches you to think about how humans behave and how systems create behavior. That skill matters far beyond gaming.",
  },
  {
    slug: "wealth-management",
    title: "Wealth Management",
    category: "Finance",
    tag: "Finance",
    duration: "30 days",
    salaryRange: "$60K – $200K+",
    description:
      "Most teens were never taught how money actually works. This internship fixes that and shows you the career on the other side of it.",
    longDescription:
      "Wealth managers help people grow and protect their money. This internship teaches the fundamentals of personal finance, investing, and financial planning, then shows you what a career in this field actually looks like. You will learn the vocabulary, the tools, and the mindset of someone who works with money professionally every day.",
    skills: ["Financial literacy", "Investment basics", "Client communication", "Data analysis", "Excel / spreadsheets"],
    dayInTheLife: [
      "Build a personal budget using real numbers",
      "Compare two investment options and make a recommendation",
      "Research a public company and explain whether you would invest",
      "Practice explaining compound interest to a 12-year-old",
    ],
    careers: ["Financial Advisor", "Wealth Manager", "Financial Analyst", "Investment Banker", "CFP"],
    whyItMatters:
      "Financial literacy is the skill gap that keeps too many families stuck. The people who understand money help other people build it.",
  },
  {
    slug: "software-engineering",
    title: "Software Engineering",
    category: "Technology",
    tag: "Tech",
    duration: "30 days",
    salaryRange: "$85K – $200K+",
    description:
      "Every company is a tech company now. Learn what software engineers actually build, how they think, and what it takes to become one.",
    longDescription:
      "Software engineers build the systems and products that run the modern world. This internship walks you through the engineering mindset, introduces core concepts like logic, data structures, and problem decomposition, and gives you a window into how real engineering teams work. You do not need prior coding experience to start.",
    skills: ["Logical thinking", "Problem decomposition", "Debugging", "Version control basics", "Technical communication"],
    dayInTheLife: [
      "Trace through a simple program and predict its output",
      "Break a real-world problem into smaller programming tasks",
      "Read production code and explain what it does",
      "Participate in a mock code review",
    ],
    careers: ["Software Engineer", "Frontend Developer", "Backend Engineer", "DevOps Engineer", "CTO"],
    whyItMatters:
      "Software engineering consistently ranks among the best-paying, fastest-growing, and most in-demand careers in the world.",
  },
  {
    slug: "marketing",
    title: "Marketing",
    category: "Business",
    tag: "Business",
    duration: "30 days",
    salaryRange: "$45K – $130K",
    description:
      "Every product needs someone to tell its story. Learn how brands connect with audiences and how campaigns actually get built.",
    longDescription:
      "Marketing is the art and science of getting people to care. This internship covers brand strategy, content creation, social media, email, paid ads, and analytics. You will learn how marketers think about audiences, craft messages that land, and measure whether any of it worked. These skills are useful whether you want to work for a brand or build your own.",
    skills: ["Copywriting", "Social media strategy", "Analytics basics", "Brand thinking", "Campaign planning"],
    dayInTheLife: [
      "Audit a real brand's social media and identify what is working",
      "Write three versions of a headline for the same product",
      "Build a simple content calendar for a hypothetical launch",
      "Read a campaign analytics report and explain what it means",
    ],
    careers: ["Marketing Manager", "Brand Strategist", "Content Creator", "Growth Marketer", "CMO"],
    whyItMatters:
      "Every organization, for-profit or nonprofit, needs marketers who can get the message out. Creative communicators with data skills are always in demand.",
  },
  {
    slug: "nursing",
    title: "Nursing",
    category: "Healthcare",
    tag: "Healthcare",
    duration: "30 days",
    salaryRange: "$60K – $120K",
    description:
      "One of the most stable, in-demand, and meaningful careers in the country. Learn what nurses do and whether this is your path.",
    longDescription:
      "Nurses are the backbone of healthcare. They assess patients, administer treatments, coordinate care, and provide the human connection that patients need most when they are most vulnerable. This internship introduces you to the daily reality of nursing, the different specialties you can pursue, and the educational path from high school to RN.",
    skills: ["Patient assessment", "Care coordination", "Medical terminology", "Empathy under pressure", "Critical thinking"],
    dayInTheLife: [
      "Follow a nurse through morning rounds and document patient status",
      "Practice a patient intake conversation with a simulated scenario",
      "Study the difference between an RN, LPN, and NP",
      "Review a medication administration protocol",
    ],
    careers: ["Registered Nurse", "Nurse Practitioner", "Travel Nurse", "ICU Nurse", "Nurse Educator"],
    whyItMatters:
      "The US is projected to need over 200,000 new nurses per year through 2030. It is one of the most stable career paths in existence.",
  },
  {
    slug: "culinary-arts",
    title: "Culinary Arts",
    category: "Skilled Trades",
    tag: "Trades",
    duration: "30 days",
    salaryRange: "$35K – $100K+",
    description:
      "Food is culture, science, and business all in one. Learn what a career in the culinary world looks like from line cook to restaurant owner.",
    longDescription:
      "The culinary industry is one of the largest employers in the country, and it offers career paths at every level, from line cook to executive chef to restaurant owner. This internship covers knife skills, kitchen operations, food science, menu development, and the business side of running a restaurant. You will come out knowing whether this is the right path, and with a strong foundation if it is.",
    skills: ["Knife skills", "Kitchen safety", "Menu planning", "Food cost management", "Team communication"],
    dayInTheLife: [
      "Work a station during a simulated dinner service",
      "Cost out a three-course menu and price it for profit",
      "Learn the brigade system and your role within it",
      "Study one famous chef and identify what made them exceptional",
    ],
    careers: ["Sous Chef", "Executive Chef", "Restaurant Owner", "Food Stylist", "Culinary Instructor"],
    whyItMatters:
      "Food brings people together. The culinary industry touches every part of society and offers real creative freedom for those who master the craft.",
  },
  {
    slug: "social-media-management",
    title: "Social Media Management",
    category: "Business",
    tag: "Business",
    duration: "30 days",
    salaryRange: "$40K – $90K",
    description:
      "Turn attention into a career. Learn how brands and creators grow an audience, keep it engaged, and prove it worked.",
    longDescription:
      "Social media managers run the voice of a brand in the place teens already spend their time. This internship puts you on the team for an up-and-coming musical artist: you set goals, define the audience, plan content across platforms, drive engagement, and read the analytics to see what actually landed. You will learn that posting is the easy part — strategy is the job.",
    skills: ["Content strategy", "Copywriting", "Platform analytics", "Community management", "Brand voice"],
    dayInTheLife: [
      "Define the target audience for an artist's next release",
      "Build a one-week content calendar across two platforms",
      "Write three post captions in the artist's voice",
      "Read an engagement report and decide what to post more of",
    ],
    careers: ["Social Media Manager", "Content Creator", "Community Manager", "Brand Strategist", "Digital Marketer"],
    whyItMatters:
      "Every brand, artist, and cause now lives or dies by its presence online. People who can grow and hold an audience are in constant demand.",
  },
  {
    slug: "human-resources",
    title: "HR Management",
    category: "Business",
    tag: "Business",
    duration: "30 days",
    salaryRange: "$50K – $120K",
    description:
      "The people side of every company. Learn how teams get hired, onboarded, and set up to do their best work.",
    longDescription:
      "Human resources is how organizations take care of the people who make them run. In this internship you join a retail headquarters to onboard new store employees ahead of a busy season — building the plan that covers day one, safety, culture, training, and ongoing support. You will learn how good companies turn a new hire into a confident team member.",
    skills: ["Communication", "Onboarding design", "Conflict resolution", "Policy basics", "Organization"],
    dayInTheLife: [
      "Map out a new employee's first day hour by hour",
      "Draft a short culture-and-values welcome",
      "Build a training checklist for a store role",
      "Design a 30-day check-in to support a new hire",
    ],
    careers: ["HR Coordinator", "Recruiter", "People Operations Manager", "Training Specialist", "HR Director"],
    whyItMatters:
      "Every organization with employees needs people who understand people. HR is a stable, human-centered career with a clear path to leadership.",
  },
  {
    slug: "event-planning",
    title: "Event Planning",
    category: "Business",
    tag: "Business",
    duration: "30 days",
    salaryRange: "$40K – $95K",
    description:
      "Pull off the day everyone remembers. Learn how big events come together — budget, vendors, logistics, and the run-of-show.",
    longDescription:
      "Event planners turn an idea into a day that runs like clockwork. This internship drops you into an event studio planning a victory rally for state-champion high school teams. You will scope the event, set a budget, choose a theme and venue, line up vendors, and build the minute-by-minute plan that keeps the day on track — then review what worked afterward.",
    skills: ["Project planning", "Budgeting", "Vendor coordination", "Logistics", "Problem solving under pressure"],
    dayInTheLife: [
      "Set the scope and goals for a championship rally",
      "Build a working budget and find where to save",
      "Compare two venues and make the call",
      "Write a day-of run-of-show timeline",
    ],
    careers: ["Event Coordinator", "Event Planner", "Wedding Planner", "Conference Producer", "Venue Manager"],
    whyItMatters:
      "Events bring people together for the moments that matter. Planners who can run a flawless day are valued across every industry.",
  },
  {
    slug: "project-management",
    title: "Project Management",
    category: "Business",
    tag: "Business",
    duration: "30 days",
    salaryRange: "$60K – $135K",
    description:
      "The person who gets things shipped. Learn how to take a big goal and turn it into a plan a whole team can follow.",
    longDescription:
      "Project managers are the glue that keeps teams moving toward a goal. In this internship you help a tech company launch a tutoring app for high schoolers: defining scope, mapping stakeholders, building a schedule and budget, planning for risks, and supporting the launch. You will learn the skill every employer wants — making sure the right work happens at the right time.",
    skills: ["Planning & scheduling", "Stakeholder communication", "Risk management", "Budgeting", "Prioritization"],
    dayInTheLife: [
      "Break an app launch into phases and milestones",
      "List the stakeholders and what each one needs",
      "Build a simple schedule with dependencies",
      "Name three risks and a plan for each",
    ],
    careers: ["Project Coordinator", "Project Manager", "Program Manager", "Scrum Master", "Operations Lead"],
    whyItMatters:
      "Every team needs someone who can turn ambition into a plan and a plan into results. Project management skills transfer to any field.",
  },
  {
    slug: "ux-ui-design",
    title: "UX/UI Design",
    category: "Technology",
    tag: "Tech",
    duration: "30 days",
    salaryRange: "$65K – $150K",
    description:
      "Design the apps people love to use. Learn how research, layout, and testing turn a rough idea into a product that just works.",
    longDescription:
      "UX/UI designers decide how a product feels to use. This internship puts you on the team designing a chat app for teens: you will run user research, study the competition, build a design system, prototype screens, test them with real people, and plan the launch. You will learn to design for the human on the other side of the screen, not just to make things look good.",
    skills: ["User research", "Wireframing", "Prototyping", "Design systems", "Usability testing"],
    dayInTheLife: [
      "Interview a potential user about how they message friends",
      "Sketch three layouts for the same screen",
      "Build a clickable prototype of the core flow",
      "Run a quick usability test and note what confused people",
    ],
    careers: ["UX Designer", "UI Designer", "Product Designer", "Design Researcher", "Design Lead"],
    whyItMatters:
      "Every app, site, and device needs someone who makes it usable. UX/UI design is among the fastest-growing, best-paid creative careers.",
  },
  {
    slug: "physical-therapy",
    title: "Physical Therapy",
    category: "Healthcare",
    tag: "Healthcare",
    duration: "30 days",
    salaryRange: "$70K – $100K",
    description:
      "Help people move again. Learn how physical therapists rebuild strength and confidence after an injury.",
    longDescription:
      "Physical therapists get people back to the activities they love after injury or surgery. In this internship you help design a recovery plan for a teen soccer player coming back from ACL surgery — handling intake and safety, assessing the injury, setting goals, sequencing the rehab phases, and planning the at-home program. You will see what a hands-on healthcare career really looks like.",
    skills: ["Anatomy basics", "Patient assessment", "Treatment planning", "Empathy", "Progress tracking"],
    dayInTheLife: [
      "Take an intake history for a teen athlete",
      "Set safe, realistic recovery goals",
      "Sequence the phases of an ACL rehab plan",
      "Design a home exercise program for week one",
    ],
    careers: ["Physical Therapist", "PT Assistant", "Athletic Trainer", "Occupational Therapist", "Rehab Specialist"],
    whyItMatters:
      "An aging, active population needs more physical therapists every year. It is stable, hands-on, and deeply rewarding work.",
  },
  {
    slug: "personal-training",
    title: "Personal Training",
    category: "Healthcare",
    tag: "Healthcare",
    duration: "30 days",
    salaryRange: "$35K – $80K+",
    description:
      "Coach people to their goals. Learn how trainers assess clients, build programs, and keep them coming back.",
    longDescription:
      "Personal trainers turn health goals into real progress. This internship puts you in a neighborhood gym helping a new client: you will run an assessment, set goals, design a program, cover nutrition basics, plan sessions, and track progress over time. You will learn the coaching and communication skills that make a trainer worth coming back to — and how to turn it into a business.",
    skills: ["Fitness assessment", "Program design", "Nutrition basics", "Coaching", "Motivation"],
    dayInTheLife: [
      "Assess a new client's fitness and goals",
      "Design a balanced first-month program",
      "Explain a nutrition basic in plain language",
      "Plan a single session start to finish",
    ],
    careers: ["Personal Trainer", "Strength Coach", "Group Fitness Instructor", "Wellness Coach", "Gym Owner"],
    whyItMatters:
      "Health and fitness is a growing industry with flexible paths — from employee to entrepreneur — and the chance to change lives daily.",
  },
  {
    slug: "mental-health-therapy",
    title: "Mental Health Therapy",
    category: "Healthcare",
    tag: "Healthcare",
    duration: "30 days",
    salaryRange: "$50K – $100K",
    description:
      "Support people through the hard stuff. Learn how therapists listen, assess, and help teens build real resilience.",
    longDescription:
      "Mental health professionals help people understand themselves and navigate life's hardest moments. In this internship at a youth wellness center, you build a treatment plan for a teen facing stress — moving through assessment, understanding the challenge, setting goals, choosing interventions, monitoring progress, and planning for long-term resilience. You will learn what compassionate, skilled care actually involves.",
    skills: ["Active listening", "Assessment basics", "Empathy", "Treatment planning", "Healthy boundaries"],
    dayInTheLife: [
      "Practice an intake conversation with a teen client",
      "Identify the challenges behind the stress",
      "Set supportive, realistic treatment goals",
      "Choose a coping strategy and explain why it helps",
    ],
    careers: ["Therapist / Counselor", "Clinical Social Worker", "School Psychologist", "Youth Counselor", "Psychologist"],
    whyItMatters:
      "Demand for mental health care has never been higher, especially for youth. This field combines meaningful impact with strong job security.",
  },
  {
    slug: "firefighting",
    title: "Firefighting",
    category: "Public Service",
    tag: "Public Service",
    duration: "30 days",
    salaryRange: "$45K – $90K",
    description:
      "Run toward the emergency. Learn how firefighters respond, work as a team, and keep a community safe.",
    longDescription:
      "Firefighters are first responders trained for the worst day of someone's life. This internship puts you inside a fire station responding to community emergencies — from the alert and dispatch, through size-up and fire attack, to overhaul, safety, and the post-incident review. You will learn the discipline, teamwork, and decision-making that the job demands, and what the path into it looks like.",
    skills: ["Situational awareness", "Teamwork", "Physical readiness", "Emergency response", "Clear communication"],
    dayInTheLife: [
      "Walk through what happens the moment a call comes in",
      "Size up a scene and call the first priority",
      "Learn each crew member's role on the team",
      "Review an incident to find what to do better",
    ],
    careers: ["Firefighter", "EMT / Paramedic", "Fire Captain", "Fire Inspector", "Emergency Manager"],
    whyItMatters:
      "Firefighting is stable public-service work with strong pay, brotherhood, and a direct, daily impact on people's lives.",
  },
  {
    slug: "photography-videography",
    title: "Photography & Videography",
    category: "Creative",
    tag: "Creative",
    duration: "30 days",
    salaryRange: "$40K – $100K+",
    description:
      "Tell stories with a camera. Learn how creative studios shoot, edit, and deliver work clients love.",
    longDescription:
      "Photographers and videographers capture the moments people keep forever. This internship puts you in a creative studio producing a graduation photoshoot and party video — from the client consult and pre-production planning, through the shoot days, into editing, delivery, and managing the client relationship. You will learn that great media is half craft, half running a real creative business.",
    skills: ["Composition", "Lighting basics", "Editing", "Client communication", "Project management"],
    dayInTheLife: [
      "Run a client consult to learn what they want",
      "Build a shot list for a graduation shoot",
      "Plan the gear and timeline for shoot day",
      "Edit a short sequence and prep it for delivery",
    ],
    careers: ["Photographer", "Videographer", "Photo Editor", "Content Producer", "Creative Director"],
    whyItMatters:
      "Visual content drives everything online. Skilled photo and video creators can build careers as employees, freelancers, or studio owners.",
  },
  {
    slug: "stylist-barber",
    title: "Stylist / Barber",
    category: "Skilled Trades",
    tag: "Trades",
    duration: "30 days",
    salaryRange: "$35K – $90K+",
    description:
      "A craft, a chair, and a community. Learn the skills and the business behind a career in hair.",
    longDescription:
      "Stylists and barbers master a hands-on craft and often build a business around it. This internship puts you inside a community salon and barbershop, working through a personalized plan to enter the industry: skill development, practice, tools, client relationships, the business basics, and a long-term career plan. You will learn why a great chair is about trust as much as technique.",
    skills: ["Cutting & styling fundamentals", "Tools & sanitation", "Client consultation", "Customer service", "Small-business basics"],
    dayInTheLife: [
      "Learn the core tools of the trade and their care",
      "Practice a consultation to understand what a client wants",
      "Map the licensing path in your state",
      "Sketch a plan to build a loyal client base",
    ],
    careers: ["Barber", "Hair Stylist", "Salon Owner", "Color Specialist", "Booth Renter / Entrepreneur"],
    whyItMatters:
      "Skilled trades like barbering offer a fast path to earning, creative freedom, and the chance to own your own business.",
  },
];

export function getInternshipBySlug(slug: string): Internship | undefined {
  return internships.find((i) => i.slug === slug);
}

export const categories = Array.from(new Set(internships.map((i) => i.category)));
