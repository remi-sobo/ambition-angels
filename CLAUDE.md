# CLAUDE.md — The House We Built

## READ THIS BEFORE TOUCHING ANY FILE

Stack: Next.js 14, TypeScript, Supabase, Vercel, Anthropic Claude API, Twilio, Google Calendar API, Tailwind CSS

## ARCHITECTURE
Pages Router NOT App Router. Single main file: pages/index.tsx. All views controlled by view state in index.tsx. No middleware file exists. Supabase client: lib/supabase.ts.

## KEY DIRECTORIES
pages/index.tsx — entire app, all views
pages/api/ — all API routes
components/ — all components
lib/supabase.ts — database client
lib/db.ts — tracker helpers
lib/constants.ts — PILLARS array

## DATA PATTERN
Tracker table is key/value store per household. All app state persisted via tracker keys. household_id cached in localStorage as hid. householdProfile from tracker key household_profile. Contains adults array, kids array, houseName.

## BRAND
CSS vars: --gold, --forest, --cream, --text-primary, --text-muted, --input-bg, --border, --serif, --sans
Forest dark: #1A3020
Gold: #C9952A
Cream: #F5F0E8
Adult colors: #C49A3C, #52B788, #7F77DD, #E76F51
Kid color: #5499C7

## ECONOMY SYSTEM v44
Replaces marble system completely. Tracker keys: economy_settings, economy_rules, economy_prizes, economy_balances, economy_history. Currency default is LastNameBucks.

## UPDATE CAROUSEL
app_versions table controls carousel. To ship new version insert row with is_current true, set old row is_current false. No code changes needed.

## ADMIN ACCESS
Authorized: remi@ambitionangels.org and kendrasobo@gmail.com. Company email remi@thehousewebuilt.family NOT yet active. Protection via useEffect in AdminLayout, redirect to /app if not authorized.

## CY AI ADVISOR
Model: claude-sonnet-4-20250514. Prompts in pages/api files. Keep under 500 tokens. No em dashes in Cy output.

## DO NOT TOUCH
next.config.js, existing Google OAuth token handling, CSS theming variables, current time line in TimePillar, existing RLS policies.

## CURRENT VERSION v44
## LAST STABLE DEPLOY v43
## GITHUB remi-sobo/house-we-built
