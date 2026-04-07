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
    slug: "dental-hygiene",
    title: "Dental Hygiene",
    category: "Healthcare",
    tag: "Healthcare",
    duration: "30 days",
    salaryRange: "$65K – $95K",
    description:
      "A hands-on healthcare career with strong pay, flexible hours, and real job security. No four-year degree required.",
    longDescription:
      "Dental hygienists are licensed healthcare professionals who clean teeth, examine patients for signs of disease, and teach patients about oral health. It is a stable, well-paying career that takes two years of school instead of four. This internship gives you a real look at what the job is like, what the training path looks like, and whether it fits your strengths.",
    skills: ["Patient care", "Anatomy basics", "Medical charting", "Infection control", "Communication"],
    dayInTheLife: [
      "Shadow a hygienist through a full patient appointment",
      "Learn the tools and techniques used in a cleaning",
      "Study how oral health connects to overall body health",
      "Chart a mock patient record and review it with a mentor",
    ],
    careers: ["Dental Hygienist", "Dental Assistant", "Office Manager", "Dental Sales Rep"],
    whyItMatters:
      "Healthcare is the largest employment sector in the US. Dental hygiene offers strong pay, meaningful patient contact, and a clear path from school to career.",
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
    slug: "real-estate",
    title: "Real Estate",
    category: "Finance",
    tag: "Finance",
    duration: "30 days",
    salaryRange: "$50K – $300K+",
    description:
      "Land and buildings have built more wealth than almost anything else. Learn the business of real estate from the ground up.",
    longDescription:
      "Real estate is one of the most accessible paths to building real wealth. This internship covers how property markets work, how deals get structured, what agents and brokers do, and how investors think about returns. Whether you want a career in real estate or just want to understand how to own property one day, this internship builds that foundation.",
    skills: ["Market analysis", "Negotiation", "Financial modeling", "Client relationships", "Contract basics"],
    dayInTheLife: [
      "Analyze a neighborhood's property values using real data",
      "Walk through the numbers on a rental property investment",
      "Practice explaining a listing to a first-time buyer",
      "Study a real purchase contract and identify the key terms",
    ],
    careers: ["Real Estate Agent", "Property Manager", "Real Estate Investor", "Commercial Broker", "Appraiser"],
    whyItMatters:
      "Real estate creates more millionaires than any other asset class. Understanding it opens doors whether you work in the industry or not.",
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
    slug: "social-work",
    title: "Social Work",
    category: "Public Service",
    tag: "Public Service",
    duration: "30 days",
    salaryRange: "$40K – $80K",
    description:
      "For people who want to make a direct impact on other people's lives. Learn how social workers change communities one case at a time.",
    longDescription:
      "Social workers are advocates, counselors, and connectors who help people navigate some of the hardest moments of their lives. This internship introduces you to the breadth of the field, from child welfare to mental health to community organizing. You will learn the skills required, the paths into the profession, and whether this calling is yours.",
    skills: ["Active listening", "Crisis assessment", "Case management", "Community resources", "Documentation"],
    dayInTheLife: [
      "Shadow a case manager through a client intake session",
      "Map the social services available in a specific zip code",
      "Practice a motivational interviewing technique",
      "Analyze a real case study and propose a support plan",
    ],
    careers: ["Social Worker", "Case Manager", "School Counselor", "Community Organizer", "Nonprofit Director"],
    whyItMatters:
      "Social workers are on the front lines of every social challenge we face. This work creates ripple effects that last for generations.",
  },
  {
    slug: "graphic-design",
    title: "Graphic Design",
    category: "Creative",
    tag: "Creative",
    duration: "30 days",
    salaryRange: "$40K – $100K",
    description:
      "Visual communication is everywhere. Learn to design for real clients, build a portfolio, and understand the business behind creative work.",
    longDescription:
      "Graphic designers shape how the world looks, from the apps on your phone to the signs on the street. This internship covers design fundamentals like typography, color theory, layout, and hierarchy, then applies them to real briefs. You will learn industry tools, how to take client feedback, and how to build the portfolio that gets you hired.",
    skills: ["Typography", "Color theory", "Layout design", "Brand identity", "Adobe / Figma basics"],
    dayInTheLife: [
      "Redesign a weak logo and explain every change you made",
      "Create a social media graphic for a real nonprofit campaign",
      "Review a design with a mentor and respond to feedback",
      "Study three brands and analyze what makes their visuals work",
    ],
    careers: ["Graphic Designer", "Brand Designer", "Art Director", "UX Designer", "Creative Director"],
    whyItMatters:
      "Great design builds trust and moves people to act. Every brand, product, and cause needs someone who can translate ideas into visuals.",
  },
];

export function getInternshipBySlug(slug: string): Internship | undefined {
  return internships.find((i) => i.slug === slug);
}

export const categories = Array.from(new Set(internships.map((i) => i.category)));
