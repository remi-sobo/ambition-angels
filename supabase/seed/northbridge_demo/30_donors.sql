-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 3a — Donors, gifts, stewardship
--   bulk constituents (individual donors, monthly donors, mentors, partner /
--   employer / funder contacts, corporate donors), households, relationships,
--   gifts (named + ~27 months of seasonal history), soft credits, recurring
--   plans, pledges + payments, interactions, acknowledgments, ack templates,
--   stewardship rules, segments, journeys (+ steps, enrollments).
--
-- Reads (by key) rows from sections 10/20/25: org, staff handles, campaigns
-- (camp:annual/yearend/gala/summer), appeals, funds, anchor constituents and
-- households. Grant money (Bayview, Hollis, Eastshore WDB, CA YOI, Harbor,
-- East Bay, Cypress) is Section 3b's: no gift rows for it here.
--
-- Historical attribution: gifts dated in a PRIOR fiscal year look up the
-- optional campaigns camp:annual_prev / camp:annual_prev2 and appeals
-- appeal:yearend_prev / appeal:gt_prev / appeal:spring_prev by id. If those
-- rows do not exist (Section 1 does not create them today) the lookup yields
-- NULL and the gift is simply unattributed: never an FK error.
--
-- SAFETY
--   * Every email is on a reserved domain (example.com/.org/.net); phones are
--     in the fictional 555-01xx range.
--   * No stewardship rule uses action 'auto_email' (the auto-receipt path
--     sends from the Ambition Angels domain), so recording a gift in the demo
--     never emails anyone.
--   * Both journeys are 'paused'. The hourly journeys cron only enrolls into
--     and advances ACTIVE journeys, so nothing here can ever be sent by it.
--   * Pending gifts older than 48h carry external_source NULL (non-taskable),
--     so the ack-queue reconcile never mints tasks assigned to the legacy
--     'shannon' fallback handle. The three online gifts from the last two days
--     are 'stripe'; Section 8a mirrors their receipt tasks (assigned jordan),
--     and Goldberg's escalation task carries sys:escalate:<gift:goldberg_daf>.
-- ════════════════════════════════════════════════════════════════════════════
begin;

-- ── Section-local helpers (pg_temp, prefixed s3a_) ─────────────────────────
create or replace function pg_temp.s3a_at(dt date, hhmi text default '10:00') returns timestamptz
  language sql stable as $$ select (dt::text || ' ' || hhmi)::timestamp at time zone 'America/Los_Angeles' $$;

-- Fiscal year (named for its end year) of any date.
create or replace function pg_temp.s3a_fy(dt date) returns int language sql immutable
  as $$ select extract(year from dt)::int + case when extract(month from dt) >= 7 then 1 else 0 end $$;

-- Most recent past December 1 (this December when the anchor is in December).
create or replace function pg_temp.s3a_last_dec() returns date language sql stable
  as $$ select make_date(extract(year from pg_temp.d(0))::int
                         - case when extract(month from pg_temp.d(0)) = 12 then 0 else 1 end, 12, 1) $$;

-- GivingTuesday of a calendar year: the Tuesday after the 4th Thursday of November.
create or replace function pg_temp.s3a_gt(y int) returns date language sql immutable
  as $$ select make_date(y, 11, 1) + ((4 - extract(isodow from make_date(y, 11, 1))::int + 7) % 7) + 21 + 5 $$;

-- Spring appeal mail date: the most recent March 15 whose 8-week window has closed.
create or replace function pg_temp.s3a_spring() returns date language sql stable
  as $$ select make_date(extract(year from pg_temp.d(0))::int
                         - case when pg_temp.d(0) >= make_date(extract(year from pg_temp.d(0))::int, 5, 20) then 0 else 1 end, 3, 15) $$;

-- Optional-row lookups (NULL when the row does not exist).
create or replace function pg_temp.s3a_camp_id(k text) returns uuid language sql stable
  as $$ select id from public.campaigns where id = pg_temp.nb_id(k) and org_id = pg_temp.nb_org() $$;
create or replace function pg_temp.s3a_appeal_id(k text) returns uuid language sql stable
  as $$ select id from public.appeals where id = pg_temp.nb_id(k) and org_id = pg_temp.nb_org() $$;

-- Campaign for a gift date: this FY's Annual Fund, or the optional prior-FY ones.
create or replace function pg_temp.s3a_camp(dt date) returns uuid language sql stable
  as $$ select case pg_temp.fy() - pg_temp.s3a_fy(dt)
                 when 0 then pg_temp.s3a_camp_id('camp:annual')
                 when 1 then pg_temp.s3a_camp_id('camp:annual_prev')
                 when 2 then pg_temp.s3a_camp_id('camp:annual_prev2') end $$;

-- Appeal for an event + gift date.
create or replace function pg_temp.s3a_appeal(ev text, dt date, paddle boolean default false) returns uuid
  language sql stable as $$
  select case
    when ev like 'ye%'     and pg_temp.fy() - pg_temp.s3a_fy(dt) = 1 then pg_temp.s3a_appeal_id('appeal:yearend_prev')
    when ev like 'gt%'     and pg_temp.fy() - pg_temp.s3a_fy(dt) = 1 then pg_temp.s3a_appeal_id('appeal:gt_prev')
    when ev like 'spring%' and pg_temp.fy() - pg_temp.s3a_fy(dt) = 1 then pg_temp.s3a_appeal_id('appeal:spring_prev')
    when ev like 'spring%' and pg_temp.fy() = pg_temp.s3a_fy(dt)     then pg_temp.s3a_appeal_id('appeal:spring')
    when ev = 'gala_last'  and paddle                                then pg_temp.s3a_appeal_id('appeal:gala')
    when ev = 'monthly'    and pg_temp.fy() = pg_temp.s3a_fy(dt)     then pg_temp.s3a_appeal_id('appeal:monthly')
  end $$;

-- Name pools for generated people. Surnames of the anchors, staff, and named
-- participants are deliberately absent so generated people never collide.
create or replace function pg_temp.s3a_first() returns text[] language sql immutable as $$ select array[
  'Adriana','Aisha','Alan','Alejandro','Alma','Amir','Ana','Angela','Anil','Antoine','Ava','Beatriz',
  'Bianca','Brandon','Brenda','Caleb','Carlos','Carmen','Cecilia','Chloe','Claire','Colin','Connie','Darnell',
  'Deborah','Derek','Diane','Dmitri','Dolores','Eduardo','Elaine','Emeka','Erin','Esther','Farah','Felix',
  'Fiona','Gabriel','Gloria','Gordon','Hannah','Hiroshi','Imani','Irene','Isaac','Ivy','Jamal','Javier',
  'Jin','Joanne','Joyce','Julian','Kara','Kenji','Kiana','Lamar','Leticia','Lionel','Lorraine','Lucia',
  'Malik','Marcia','Marisol','Maya','Mei','Mohammed','Nadia','Naomi','Nathan','Neha','Nora','Oscar',
  'Pamela','Paolo','Quentin','Rachel','Rafael','Renee','Rohan','Ruth','Sanjay','Serena','Sofia','Tanya',
  'Terrence','Tiffany','Valerie','Vikram','Walter','Wendy','Xavier','Yolanda','Yusuf','Zoe','Graham','Helen'] $$;

create or replace function pg_temp.s3a_last() returns text[] language sql immutable as $$ select array[
  'Abernathy','Acosta','Adeyemi','Aguilar','Ahmed','Anand','Bachman','Banerjee','Barrera','Beaumont','Bender','Blackwell',
  'Bonilla','Bustamante','Calloway','Campos','Carver','Castellanos','Chandra','Chavez','Choi','Contreras','Cortez','Dang',
  'Darby','Delacroix','Desai','Dominguez','Duarte','Easton','Ebrahimi','Espinoza','Farrow','Flores','Fong','Gallagher',
  'Gill','Gutierrez','Haddad','Hale','Hamilton','Haynes','Hernandez','Holt','Hsu','Ibarra','Iqbal','Jang',
  'Jimenez','Kaur','Keller','Khan','Kowal','Lacey','Lam','Landry','Le','Lopez','Lowe','Lucero',
  'Mahoney','Maldonado','Mendoza','Mehta','Moon','Morrow','Mwangi','Navarro','Ng','Nguyen','Novak','Obi',
  'Ochoa','Padilla','Pham','Quintero','Rahman','Rao','Rhodes','Rios','Rosen','Salazar','Santos','Schultz',
  'Sharma','Shaw','Silva','Singh','Soto','Stein','Suarez','Tanaka','Thibodeaux','Torres','Underwood','Vargas',
  'Vasquez','Vo','Wagner','Walsh','Watanabe','Yamamoto','Yang','Yu','Zamora','Zhang','Okoye','Bergstrom',
  'Castillo','Duong','Ferreira','Grayson'] $$;

-- Bijective index → (first, last): k = g·7919 mod (|F|·|L|), so every g in
-- range gets a distinct full name.
create or replace function pg_temp.s3a_fn(g int) returns text language sql immutable as $$
  select f[1 + ((g::bigint * 7919) % (array_length(f, 1) * array_length(l, 1))) % array_length(f, 1)]
  from (select pg_temp.s3a_first() f, pg_temp.s3a_last() l) x $$;
create or replace function pg_temp.s3a_ln(g int) returns text language sql immutable as $$
  select l[1 + ((g::bigint * 7919) % (array_length(f, 1) * array_length(l, 1))) / array_length(f, 1)]
  from (select pg_temp.s3a_first() f, pg_temp.s3a_last() l) x $$;

create or replace function pg_temp.s3a_email(fn text, ln text, g int) returns text language sql immutable as $$
  select case g % 5
    when 0 then lower(regexp_replace(fn, '[^A-Za-z]', '', 'g')) || '.' || lower(regexp_replace(ln, '[^A-Za-z]', '', 'g')) || '@example.com'
    when 1 then lower(regexp_replace(fn, '[^A-Za-z]', '', 'g')) || lower(regexp_replace(ln, '[^A-Za-z]', '', 'g')) || '@example.net'
    when 2 then lower(left(fn, 1)) || lower(regexp_replace(ln, '[^A-Za-z]', '', 'g')) || (10 + g % 89) || '@example.org'
    when 3 then lower(regexp_replace(fn, '[^A-Za-z]', '', 'g')) || '_' || lower(regexp_replace(ln, '[^A-Za-z]', '', 'g')) || '@example.com'
    else lower(regexp_replace(fn, '[^A-Za-z]', '', 'g')) || lower(left(ln, 1)) || (100 + g) || '@example.net'
  end $$;

-- Fictional phones: 555-01xx across six Bay Area area codes (unique per g < 600).
create or replace function pg_temp.s3a_phone(g int) returns text language sql immutable as $$
  select '(' || (array['341','925','628','669','707','408'])[1 + (g / 100) % 6] || ') 555-01' || lpad((g % 100)::text, 2, '0') $$;

create or replace function pg_temp.s3a_addr(g int) returns table(street text, city text, zip text) language sql immutable as $$
  select (100 + floor(pg_temp.rnd('s3a:addr:n:' || g) * 6800)::int)::text || ' ' ||
         pg_temp.pick(array['Alcatraz Ave','Lakeshore Ave','Grand Ave','Park Blvd','College Ave','Telegraph Ave','Shattuck Ave',
                             'Fruitvale Ave','MacArthur Blvd','Foothill Blvd','High St','Broadway Terrace','Monte Vista Ave',
                             'Harrison St','Euclid Ave','Solano Ave','San Pablo Ave','Webster St','Santa Clara Ave','Bancroft Ave',
                             '38th Ave','Seminary Ave','Redwood Rd','Chabot Rd','Mandana Blvd','Lincoln Ave','Encinal Ave',
                             'Estates Dr','Hopkins St','Rose St','Adeline St','Market St','Peralta St','Fairmount Ave'], 's3a:addr:s:' || g),
         c[1], c[2]
  from (select string_to_array(pg_temp.pick(array[
          'Oakland|94602','Oakland|94606','Oakland|94609','Oakland|94610','Oakland|94611','Oakland|94618','Oakland|94619',
          'Oakland|94612','Oakland|94607','Oakland|94605','Oakland|94621','Berkeley|94702','Berkeley|94703','Berkeley|94705',
          'Berkeley|94707','Alameda|94501','San Leandro|94577','San Leandro|94578','Piedmont|94611','Emeryville|94608',
          'Albany|94706','El Cerrito|94530','Orinda|94563','Walnut Creek|94596','San Francisco|94110','San Francisco|94117',
          'Castro Valley|94546','Hayward|94541','Richmond|94805','Oakland|94603'], 's3a:addr:c:' || g), '|') c) x $$;

-- Gift calendar. grp: y2 = two calendar years back, y1 = last year, y0 = this
-- year (read against the default anchor; the story stays coherent when the
-- anchor moves).
create or replace function pg_temp.s3a_events() returns table(ev text, start_date date, span int, grp text)
  language sql stable as $$
  select * from (values
    ('fall_prev2',  pg_temp.d(-820),                                                      75, 'y2'),
    ('gt_prev',     pg_temp.s3a_gt(extract(year from pg_temp.s3a_last_dec())::int - 1),   2, 'y2'),
    ('ye_prev',     (pg_temp.s3a_last_dec() - interval '1 year')::date,                   31, 'y2'),
    ('spring_prev', (pg_temp.s3a_spring() - interval '1 year')::date,                     56, 'y1'),
    ('gala_prev',   pg_temp.d(-529),                                                       1, 'y1'),
    ('summer_prev', pg_temp.d(-470),                                                      90, 'y1'),
    ('gt_last',     pg_temp.s3a_gt(extract(year from pg_temp.s3a_last_dec())::int),        2, 'y1'),
    ('ye_last',     pg_temp.s3a_last_dec(),                                               31, 'y1'),
    ('spring_last', pg_temp.s3a_spring(),                                                 56, 'y0'),
    ('gala_last',   pg_temp.d(-165),                                                       1, 'y0'),
    ('fall',        pg_temp.d(-110),                                                      95, 'y0')
  ) e(ev, start_date, span, grp) $$;

-- Probability that a donor of a giving pattern/tier gives in an event.
create or replace function pg_temp.s3a_p(pattern text, tier text, ev text) returns float8 language sql immutable as $$
  select case pattern
    when 'loyal' then case ev
      when 'fall_prev2' then .12 when 'gt_prev' then .12 when 'ye_prev' then .55 when 'spring_prev' then .28
      when 'gala_prev' then (case tier when 'mid' then .45 when 'core' then .12 else .04 end)
      when 'summer_prev' then .12 when 'gt_last' then .22 when 'ye_last' then .78 when 'spring_last' then .45
      when 'gala_last' then (case tier when 'mid' then .55 when 'core' then .15 else .05 end)
      when 'fall' then .32 else 0 end
    when 'lybunt' then case ev
      when 'fall_prev2' then .10 when 'gt_prev' then .10 when 'ye_prev' then .45 when 'spring_prev' then .25
      when 'gala_prev' then (case tier when 'mid' then .35 when 'core' then .08 else .03 end)
      when 'summer_prev' then .15 when 'gt_last' then .28 when 'ye_last' then .70 else 0 end
    when 'sybunt' then case ev when 'fall_prev2' then .30 when 'gt_prev' then .30 when 'ye_prev' then .65 else 0 end
    else 0 end $$;

-- The ~300 generated individual donors.
--   tier: mid ($1K–$5K gifts) · core ($100–$500) · small ($25–$150)
--   pattern: loyal (gave last year and this year) · lybunt · new (first gift
--   this year) · sybunt (lapsed two years) · onetime (2nd-gift watch) ·
--   fresh (first gift is one of the hand-placed recent gifts) · prospect.
create or replace function pg_temp.s3a_bulk() returns table(i int, k text, fn text, ln text, tier text, pattern text, hh boolean)
  language sql stable as $$
  select i, 'd' || lpad(i::text, 3, '0'), pg_temp.s3a_fn(i), pg_temp.s3a_ln(i),
    case when i <= 24 then 'mid' when i <= 140 then 'core' else 'small' end,
    case
      when i = 298 then 'prospect'
      when i in (299, 300) then 'fresh'
      when i in (1, 2, 3, 4, 7, 12, 60, 120, 200) then 'loyal'
      when i in (133, 277) then 'sybunt'
      when i <= 24 then (case when r < .62 then 'loyal' when r < .86 then 'lybunt' when r < .93 then 'new' else 'sybunt' end)
      else (case when r < .42 then 'loyal' when r < .73 then 'lybunt' when r < .86 then 'new' when r < .94 then 'sybunt' else 'onetime' end)
    end,
    i in (5, 9, 13, 17, 21, 30, 38, 46, 55, 63, 71, 80, 88, 97, 105, 113, 122, 130, 150, 170, 190, 210, 230, 250)
  from generate_series(1, 300) i, lateral (select pg_temp.rnd('s3a:pat:' || i) as r) x $$;

-- Every generated one-time gift from the bulk donors, fully attributed.
create or replace function pg_temp.s3a_bulk_gifts() returns table(
    k text, i int, tier text, pattern text, ev text, gkey text, gift_date date, amount numeric,
    fmv numeric, method text, src text, fund text, campaign_id uuid, appeal_id uuid, ack_at timestamptz,
    created_at timestamptz, note text)
  language sql stable as $$
  with b as (select * from pg_temp.s3a_bulk()),
  e as (select * from pg_temp.s3a_events()),
  cand as (
    select b.k, e.ev, e.grp from b cross join e
    where b.pattern in ('loyal', 'lybunt', 'sybunt')
      and pg_temp.rnd('s3a:' || b.k || ':' || e.ev) < pg_temp.s3a_p(b.pattern, b.tier, e.ev)),
  forced as (
    select b.k, f.ev from b cross join lateral (values
      (case when b.pattern in ('loyal', 'lybunt') and not exists (select 1 from cand c where c.k = b.k and c.grp = 'y1') then 'ye_last' end),
      (case when b.pattern = 'loyal' and not exists (select 1 from cand c where c.k = b.k and c.grp = 'y0')
            then (case when b.i % 2 = 0 then 'spring_last' else 'fall' end) end),
      (case when b.pattern = 'sybunt' and not exists (select 1 from cand c where c.k = b.k and c.grp = 'y2') then 'ye_prev' end),
      (case when b.pattern = 'new' then pg_temp.pick(array['spring_last','gala_last','fall','fall'], 's3a:' || b.k || ':first')
            when b.pattern = 'onetime' then pg_temp.pick(array['gt_last','spring_last','gala_last'], 's3a:' || b.k || ':first') end),
      (case when b.pattern = 'new' and pg_temp.rnd('s3a:' || b.k || ':second') < .3 then 'fall' end)
    ) f(ev) where f.ev is not null),
  allg as (select k, ev from cand union select k, ev from forced),
  g0 as (
    select b.k, b.i, b.tier, b.pattern, a.ev, 'gift:b:' || b.k || ':' || a.ev as gkey,
      (e.start_date + case when a.ev like 'ye%' then floor(sqrt(pg_temp.rnd('s3a:' || b.k || ':' || a.ev || ':day')) * e.span)
                           else floor(pg_temp.rnd('s3a:' || b.k || ':' || a.ev || ':day') * e.span) end::int) as gift_date,
      greatest(1, least(case b.tier when 'mid' then 8 else 10 end,
        1 + floor(pg_temp.rnd('s3a:' || b.k || ':amt') * case b.tier when 'mid' then 8 else 10 end)::int
          + case when a.ev like 'ye%' or a.ev like 'gala%' then 1 when a.ev like 'gt%' then -2 when a.ev like 'spring%' then -1 else 0 end)) as ai,
      pg_temp.rnd('s3a:' || b.k || ':' || a.ev || ':m') as rm
    from allg a join b on b.k = a.k join e on e.ev = a.ev),
  g1 as (
    select g0.*,
      (g0.ev like 'gala%' and (g0.tier <> 'mid' or g0.rm < .5)) as ticket,
      case when g0.ev like 'gala%' and g0.tier <> 'mid' then (case when g0.rm < .6 then 250 else 500 end)
           when g0.ev like 'gala%' and g0.rm < .5 then (array[2500,5000,5000,7500,10000])[1 + floor(g0.rm * 10)::int]
           when g0.tier = 'mid' then (array[1000,1000,1500,2000,2500,2500,3000,5000])[g0.ai]
           when g0.tier = 'core' then (array[100,100,150,200,250,250,300,400,500,500])[g0.ai]
           else (array[25,35,40,50,50,50,75,100,100,150])[g0.ai] end::numeric as amount
    from g0
    where g0.gift_date <= pg_temp.d(-15))
  select g1.k, g1.i, g1.tier, g1.pattern, g1.ev, g1.gkey, g1.gift_date, g1.amount,
    case when g1.ticket then (case when g1.amount = 250 then 150 when g1.amount = 500 then 300 else 1500 end)::numeric end,
    case when g1.amount <= 500 and (g1.amount < 500 or g1.ticket) then 'card'
         when g1.ticket then 'check'
         when g1.rm < .55 then 'check' when g1.rm < .80 then 'card' when g1.rm < .93 or g1.tier <> 'mid' then 'ach' else 'stock' end,
    case when g1.amount <= 500 and (g1.amount < 500 or g1.ticket) then 'stripe'
         when g1.ticket then 'manual'
         when g1.rm >= .55 and g1.rm < .80 then 'stripe' else 'manual' end,
    case when g1.ev like 'spring%' then 'stipends'
         when pg_temp.rnd('s3a:' || g1.gkey || ':fund') < .07 then 'pathways' else 'general' end,
    case when g1.ev = 'gala_last' then pg_temp.s3a_camp_id('camp:gala') else pg_temp.s3a_camp(g1.gift_date) end,
    pg_temp.s3a_appeal(g1.ev, g1.gift_date, not g1.ticket),
    least(pg_temp.s3a_at(g1.gift_date + 1 + floor(pg_temp.rnd('s3a:' || g1.gkey || ':lag') * case when g1.ev like 'ye%' then 6 else 4 end)::int,
                         lpad((9 + floor(pg_temp.rnd('s3a:' || g1.gkey || ':h') * 8)::int)::text, 2, '0') || ':' ||
                         lpad((floor(pg_temp.rnd('s3a:' || g1.gkey || ':mi') * 60)::int)::text, 2, '0')),
          pg_temp.ts(-1, '16:00')),
    pg_temp.s3a_at(g1.gift_date + floor(pg_temp.rnd('s3a:' || g1.gkey || ':entry') * 2)::int, '11:' || lpad((g1.i % 60)::text, 2, '0')),
    case when pg_temp.rnd('s3a:' || g1.gkey || ':note') < .5 then
      case when g1.ev like 'gt%' then 'GivingTuesday gift, doubled by the board challenge match.'
           when g1.ev like 'ye%' then 'Year-end gift.'
           when g1.ev like 'spring%' then 'Spring Appeal: put a teen to work this summer.'
           when g1.ticket and g1.amount > 500 then 'Gala table host (table of ten).'
           when g1.ticket then 'Gala tickets.'
           when g1.ev like 'gala%' then 'Gala paddle raise.'
           else null end end
  from g1 $$;

-- ~45 monthly donors and their plans.
create or replace function pg_temp.s3a_monthly() returns table(
    n int, k text, fn text, ln text, amount numeric, months int, last_charge date, status text,
    failed_at timestamptz, src text)
  language sql stable as $$
  with base as (
    select n, 'm' || lpad(n::text, 2, '0') as k, pg_temp.s3a_fn(300 + n) as fn, pg_temp.s3a_ln(300 + n) as ln,
      (array[25,50,25,10,35,50,100,20,25,50,75,30,25,50,15,100,40,25,50,60,25,150,50,25,35,50,20,100,25,50,
             75,25,250,50,30,25,50,40,100,25,60,50,25,15,50])[n]::numeric as amount,
      case when n <= 10 then 18 + (n * 7) % 9 when n <= 30 then 7 + (n * 5) % 12 else 1 + (n * 3) % 7 end as months,
      1 + floor(pg_temp.rnd('s3a:m:dom:' || n) * 28)::int as dom
    from generate_series(1, 45) n),
  t as (
    select base.*,
      case n when 7 then 'active' when 19 then 'active' when 33 then 'paused' when 40 then 'cancelled' when 44 then 'cancelled' else 'active' end as status,
      case n
        when 7  then (pg_temp.d(-3) - interval '1 month')::date
        when 19 then (pg_temp.d(-7) - interval '1 month')::date
        when 33 then pg_temp.d(-70)
        when 40 then pg_temp.d(-200)
        when 44 then pg_temp.d(-95)
        else case when extract(day from pg_temp.d(-1))::int >= dom
                  then make_date(extract(year from pg_temp.d(-1))::int, extract(month from pg_temp.d(-1))::int, dom)
                  else (make_date(extract(year from pg_temp.d(-1))::int, extract(month from pg_temp.d(-1))::int, dom) - interval '1 month')::date end
      end as last_charge
    from base)
  select n, k, fn, ln, amount, months, last_charge, status,
    case n when 7 then pg_temp.ts(-3, '06:04') when 19 then pg_temp.ts(-7, '06:02') end,
    case when n in (12, 27) then 'manual' else 'stripe' end
  from t $$;

-- 60 mentors (Mentor Circles volunteers). 1–12 are Kinetic Labs employees.
create or replace function pg_temp.s3a_mentors() returns table(n int, k text, fn text, ln text, status text, employer text, since int)
  language sql stable as $$
  select n, 'mt' || lpad(n::text, 2, '0'), pg_temp.s3a_fn(345 + n), pg_temp.s3a_ln(345 + n),
    case when n <= 30 then 'Matched' when n <= 36 then 'Trained' when n <= 40 then 'Alumni mentor'
         when n <= 50 then 'Background check' else 'Applied' end,
    case when n <= 12 then 'kinetic' when n <= 16 then 'pacific_summit' when n <= 19 then 'harbor'
         when n <= 22 then 'corp_quillfeather' when n <= 24 then 'corp_tidewell' when n <= 26 then 'corp_copperline'
         when n <= 28 then 'corp_brightwater' when n = 29 then 'redline' when n = 30 then 'corp_harborlight' end,
    case when n in (3, 5, 8, 20, 21, 22) then -420 - floor(pg_temp.rnd('s3a:mt:since:' || n) * 300)::int
         when n <= 30 then -60 - floor(pg_temp.rnd('s3a:mt:since:' || n) * 640)::int
         when n <= 36 then -40 - floor(pg_temp.rnd('s3a:mt:since:' || n) * 60)::int
         when n <= 40 then -500 - floor(pg_temp.rnd('s3a:mt:since:' || n) * 300)::int
         when n <= 50 then -12 - floor(pg_temp.rnd('s3a:mt:since:' || n) * 30)::int
         else -2 - floor(pg_temp.rnd('s3a:mt:since:' || n) * 20)::int end
  from generate_series(1, 60) n $$;

create or replace function pg_temp.s3a_spouse_fn(i int) returns text language sql immutable as $$
  select case when pg_temp.s3a_fn(600 + i) = pg_temp.s3a_fn(i) then pg_temp.s3a_fn(700 + i) else pg_temp.s3a_fn(600 + i) end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Anchor enrichment (this org only; each update is a no-op on re-run)
-- ════════════════════════════════════════════════════════════════════════════
-- Bay Legacy Giving Fund shared grants@example.net with The Cypress Fund,
-- which the duplicates screen would flag as one person. Give it its own.
update public.constituents set emails = array['daf.grants@example.net']
where org_id = pg_temp.nb_org() and id = pg_temp.nb_id('con:legacy_daf') and emails = array['grants@example.net'];

update public.constituents c set preferred_ack_channel = v.ch, why_matters = coalesce(c.why_matters, v.why)
from (values
  ('pacific_summit', 'letter', 'The bank has hired 31 Summer Works interns in five summers and promoted four of them into full-time roles.'),
  ('kinetic',        'email',  'Kinetic hired Amara Johnson out of Pathways Cohort 6 and lends us twelve employee mentors; their help desk is a real career door for our IT fellows.'),
  ('redline',        'email',  'Redline opened two active job sites to our trades fellows, the first contractor in Oakland to do it.'),
  ('legacy_daf',     'letter', null),
  ('harbor',         'letter', null)
) v(k, ch, why)
where c.org_id = pg_temp.nb_org() and c.id = pg_temp.nb_id('con:' || v.k) and c.preferred_ack_channel is null;

update public.constituents c set why_matters = v.why
from (values
  ('po_bayview',  'Janelle has championed general operating support inside Bayview for three years; she reads our reports closely and shares them with her board.'),
  ('po_hollis',   'Martin is a family trustee as well as program lead; he cares most about fellows who are first in their family to hold a salaried job.'),
  ('po_meridian', 'Camille invited the full proposal after one call. A Meridian award would fund the San Leandro site.'),
  ('po_sequoia',  'Arthur came to us through Celeste. Sequoia is reshaping its education portfolio toward career pathways.'),
  ('bd_patel',    null)
) v(k, why)
where c.org_id = pg_temp.nb_org() and c.id = pg_temp.nb_id('con:' || v.k) and c.why_matters is null and v.why is not null;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Corporate donors and sponsors (local businesses; employer partners)
-- ════════════════════════════════════════════════════════════════════════════
insert into public.constituents
  (id, org_id, type, org_name, emails, phones, street, city, state, postal_code, tags, source, notes,
   why_matters, preferred_ack_channel, custom_fields, created_at, updated_at)
select pg_temp.nb_id('con:' || c.k), pg_temp.nb_org(), 'organization', c.n, array[c.email], array[c.phone],
       c.street, c.city, 'CA', c.zip, c.tags, 'manual', c.notes, c.why, c.ack, c.cf,
       pg_temp.ts(c.since, '10:00'), pg_temp.ts(c.touched, '15:30')
from (values
  ('corp_harborlight', 'Harborlight Property Group', 'giving.harborlight@example.com', '(510) 555-0180', '1 Clay St Ste 900', 'Oakland', '94607',
   array['corporate','gala_sponsor'], 'Commercial real estate firm. Presenting sponsor of Northbridge Rising two years running.',
   'Their managing partner grew up on 98th Avenue and wants every intern to see a downtown office from the inside.', 'letter', '{}'::jsonb, -700, -150),
  ('corp_quillfeather', 'Quillfeather Software', 'community@example.net', '(415) 555-0181', '600 Townsend St', 'San Francisco', '94103',
   array['corporate','gala_sponsor','employer_partner','matching_gifts'], 'Software company; hosts two IT-track interns each summer and matches employee gifts 1:1.',
   null, 'email', '{"employer_partner":true}'::jsonb, -650, -60),
  ('corp_brightwater', 'Brightwater Freight', 'giving.brightwater@example.com', '(510) 555-0182', '2201 Seaport Blvd', 'Oakland', '94607',
   array['corporate','gala_sponsor','employer_partner','summer_works_sponsor'], 'Port logistics company; Summer Works employer (warehouse operations and dispatch).',
   'Their operations director started on the loading dock at nineteen.', 'email', '{"employer_partner":true}'::jsonb, -600, -4),
  ('corp_tidewell', 'Tidewell Community Credit Union', 'outreach@example.org', '(510) 555-0183', '3020 Fruitvale Ave', 'Oakland', '94602',
   array['corporate','gala_sponsor','employer_partner','summer_works_sponsor'], 'Credit union in Fruitvale. Sponsors Summer Works and teaches the financial-literacy workshop.',
   null, 'letter', '{"employer_partner":true}'::jsonb, -560, -10),
  ('corp_albright', 'Albright Marsh LLP', 'firm.giving@example.com', '(510) 555-0184', '555 12th St Ste 1500', 'Oakland', '94607',
   array['corporate','gala_sponsor'], 'Law firm; buys a gala table and reviews our internship agreements pro bono with Victor Ramos.',
   null, 'letter', '{}'::jsonb, -600, -165),
  ('corp_corbettlim', 'Corbett & Lim CPAs', 'office.corbettlim@example.com', '(510) 555-0185', '1999 Harrison St Ste 700', 'Oakland', '94612',
   array['corporate','gala_sponsor'], 'Regional accounting firm where Grace Lim is a partner. Gala sponsor.',
   null, 'letter', '{}'::jsonb, -420, -170),
  ('corp_copperline', 'Copperline Electric', 'jobs.copperline@example.com', '(510) 555-0186', '4500 Coliseum Way', 'Oakland', '94601',
   array['corporate','employer_partner','trades'], 'Union electrical contractor; pre-apprenticeship placements for trades fellows.',
   null, 'email', '{"employer_partner":true}'::jsonb, -480, -50),
  ('corp_mosaic', 'Mosaic Smile Dental', 'frontdesk.mosaic@example.com', '(510) 555-0187', '3800 International Blvd', 'Oakland', '94601',
   array['corporate','employer_partner','healthcare'], 'Community dental group; hosts a dental-assistant shadow day for healthcare fellows.',
   null, 'email', '{"employer_partner":true}'::jsonb, -380, -168),
  ('corp_juniper', 'Juniper Lane Bakery', 'hello.juniperlane@example.com', '(510) 555-0188', '4120 Piedmont Ave', 'Oakland', '94611',
   array['corporate','in_kind','summer_works_employer'], 'Neighborhood bakery; donates the gala dessert service and hires two Summer Works interns.',
   null, 'letter', '{"employer_partner":true}'::jsonb, -520, -165),
  ('corp_eastport', 'Eastport Hardware Supply', 'store.eastport@example.com', '(510) 555-0189', '9700 San Leandro St', 'Oakland', '94603',
   array['corporate'], 'Family-owned hardware store; small gala sponsor and tool donations for the trades track.',
   null, 'letter', '{}'::jsonb, -470, -168)
) c(k, n, email, phone, street, city, zip, tags, notes, why, ack, cf, since, touched)
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Partner, employer, and funder contact people (35)
-- ════════════════════════════════════════════════════════════════════════════
insert into public.constituents
  (id, org_id, type, first_name, last_name, emails, phones, city, state, tags, source, notes, custom_fields, created_at, updated_at)
select pg_temp.nb_id('con:' || c.k), pg_temp.nb_org(), 'person', c.fn, c.ln, array[c.email],
       case when c.phone is null then '{}'::text[] else array[c.phone] end, c.city, 'CA', c.tags, 'manual', c.notes,
       c.cf, pg_temp.ts(c.since, '10:30'), pg_temp.ts(c.touched, '14:00')
from (values
  ('pc01', 'Marcus',    'Webb',      'marcus.webb@example.com',        '(510) 555-0172', 'Oakland',       array['partner_contact','employer_contact'], 'VP, Human Resources at Pacific Summit Bank. Owns early-careers hiring; signs off on intern headcount.', '{"employer_partner":true}'::jsonb, -900, -118),
  ('pc02', 'Felicia',   'Grant',     'fgrant@example.com',             '(510) 555-0173', 'Oakland',       array['partner_contact','employer_contact','intern_supervisor'], 'Branch Operations Manager, Pacific Summit Bank (downtown). Supervised Luis Ortega last summer.', '{"employer_partner":true}'::jsonb, -560, -118),
  ('pc03', 'Ian',       'Morales',   'ian.morales@example.com',        '(510) 555-0174', 'Oakland',       array['partner_contact','sponsor_contact'], 'Community Reinvestment Officer, Pacific Summit Bank. Manages the sponsorship budget and the renewal paperwork.', '{}'::jsonb, -620, -20),
  ('pc04', 'Lauren',    'Cho',       'lcho@example.com',               null,             'Oakland',       array['partner_contact'], 'Corporate Giving Coordinator, Pacific Summit Bank. Send logos and recognition proofs to her.', '{}'::jsonb, -300, -142),
  ('pc05', 'Priscilla', 'Gomez',     'pgomez@example.com',             '(415) 555-0175', 'San Francisco', array['partner_contact','sponsor_contact','employer_contact'], 'Head of Social Impact, Kinetic Labs. Owns the $75K pledge and the employee mentor program.', '{"employer_partner":true}'::jsonb, -640, 0),
  ('pc06', 'Owen',      'Fitzgerald','owen.fitzgerald@example.com',    '(415) 555-0176', 'San Francisco', array['partner_contact','employer_contact','intern_supervisor'], 'IT Service Desk Manager, Kinetic Labs. Hired Amara Johnson; wants two more Pathways IT fellows in spring.', '{"employer_partner":true}'::jsonb, -400, -40),
  ('pc07', 'Hana',      'Sato',      'hsato@example.com',              '(415) 555-0177', 'Oakland',       array['partner_contact','volunteer_coordinator'], 'Employee Volunteer Program Lead, Kinetic Labs. Coordinates the twelve Kinetic mentors.', '{}'::jsonb, -520, -33),
  ('pc08', 'Raj',       'Iyer',      'raj.iyer@example.com',           null,             'San Francisco', array['partner_contact','employer_contact'], 'Talent Acquisition Partner, Kinetic Labs.', '{"employer_partner":true}'::jsonb, -300, -90),
  ('pc09', 'Samuel',    'Reyes',     'sreyes@example.org',             '(510) 555-0178', 'Oakland',       array['partner_contact','employer_contact'], 'Director of Clinical Education, Harbor Health Partners. Approves clinical rotations for the healthcare track.', '{"employer_partner":true}'::jsonb, -600, -41),
  ('pc10', 'Bettina',   'Kowalski',  'bkowalski@example.org',          '(510) 555-0179', 'Oakland',       array['partner_contact','intern_supervisor'], 'Nurse Educator, Harbor Health Partners. Runs the CNA clinical rotation Keisha Brown is in.', '{}'::jsonb, -350, -22),
  ('pc11', 'Leon',      'Sharpe',    'leon.sharpe@example.org',        '(510) 555-0190', 'Oakland',       array['partner_contact','employer_contact'], 'Workforce Development Manager, Harbor Health Partners.', '{"employer_partner":true}'::jsonb, -500, -70),
  ('pc12', 'Tom',       'Brennan',   'tbrennan@example.com',           '(510) 555-0191', 'Oakland',       array['partner_contact','employer_contact','intern_supervisor'], 'Field Operations, Redline Builders. Day-to-day contact for trades fellows on site.', '{"employer_partner":true}'::jsonb, -600, -76),
  ('pc13', 'Dana',      'Whitcomb',  'dwhitcomb@example.com',          '(510) 555-0192', 'Oakland',       array['partner_contact'], 'Safety & Apprenticeship Coordinator, Redline Builders. Runs OSHA-10 for our fellows.', '{}'::jsonb, -450, -76),
  ('pc14', 'Rick',      'Saldana',   'rick.saldana@example.com',       '(510) 555-0193', 'Alameda',       array['partner_contact','sponsor_contact'], 'President, Redline Builders. Made the $25K commitment after the job-site visit.', '{}'::jsonb, -730, -75),
  ('pc15', 'Theresa',   'Vu',        'tvu@example.org',                '(510) 555-0194', 'Oakland',       array['funder_contact','foundation_contact'], 'Grants Manager, Bayview Community Foundation. Handles payment schedules and report portals.', '{}'::jsonb, -1000, -61),
  ('pc16', 'Evelyn',    'Hollis',    'evelyn.hollis@example.org',      null,             'San Francisco', array['funder_contact','family_trustee'], 'Trustee, The Hollis Family Foundation. Martin''s aunt; came to the Cohort 6 graduation.', '{}'::jsonb, -500, -120),
  ('pc17', 'Gregory',   'Ashford',   'gashford@example.net',           '(415) 555-0195', 'San Francisco', array['funder_contact','foundation_contact'], 'Program Officer, The Cypress Fund. Invited the renewal LOI.', '{}'::jsonb, -700, -14),
  ('pc18', 'Rosalind',  'Okeke',     'rokeke@example.org',             '(510) 555-0196', 'Oakland',       array['funder_contact','foundation_contact'], 'Senior Program Officer, East Bay Workforce Fund. Reviews the final report and the renewal.', '{}'::jsonb, -1200, -20),
  ('pc19', 'Kevin',     'Lindqvist', 'kevin.lindqvist@example.org',    null,             'Sacramento',    array['funder_contact','government'], 'Program Analyst, California Youth Opportunity Initiative. Contact for tranche timing and reporting.', '{}'::jsonb, -450, -45),
  ('pc20', 'Miriam',    'Stokes',    'mstokes@example.net',            '(510) 555-0197', 'Oakland',       array['funder_contact','foundation_contact'], 'Program Officer, Alder & Finch Foundation. Joined after last year''s decline; open to a workforce conversation.', '{}'::jsonb, -120, -90),
  ('pc21', 'Diego',     'Ferraro',   'dferraro@example.org',           null,             'New York',      array['funder_contact','foundation_contact'], 'Program Associate, Meridian Foundation. Logistics for the proposal review.', '{}'::jsonb, -190, -14),
  ('pc22', 'Yvonne',    'Adair',     'yadair@example.org',             null,             'Menlo Park',    array['funder_contact','foundation_contact'], 'Grants Associate, Sequoia Trust for Education. Scheduling for the intro meeting.', '{}'::jsonb, -35, -4),
  ('pc23', 'Tamika',    'Reed',      'treed@example.org',              '(510) 555-0198', 'Oakland',       array['partner_contact','school_champion'], 'Assistant Principal, Eastlake High School. Launchpad''s champion at the founding site.', '{}'::jsonb, -1500, -6),
  ('pc24', 'Jason',     'Whitaker',  'jwhitaker@example.org',          '(510) 555-0199', 'Oakland',       array['partner_contact','school_champion'], 'College & Career Lead, Laurel Ridge High School. Working with Rosa on the new bell schedule.', '{}'::jsonb, -900, -3),
  ('pc25', 'Nia',       'Coleman',   'ncoleman@example.org',           null,             'Oakland',       array['partner_contact','school_champion'], 'Principal, Bayshore Academy. Strong counselor partnership.', '{}'::jsonb, -800, -10),
  ('pc26', 'Laura',     'Kim',       'lkim@example.org',               null,             'San Leandro',   array['partner_contact','school_champion'], 'Director of Career Ed, San Leandro Unified. Pilot partner for the fourth Launchpad site.', '{}'::jsonb, -250, -8),
  ('pc27', 'Grace',     'Okonkwo',   'gokonkwo@example.org',           null,             'Oakland',       array['partner_contact'], 'Teen Services Manager, Eastshore Public Library. Hosts library-aide interns and FAFSA nights.', '{}'::jsonb, -700, -50),
  ('pc28', 'Hector',    'Ruiz',      'hruiz@example.org',              null,             'Oakland',       array['partner_contact'], 'Program Director, Fruitvale Hub Community Center. Mentor Circles venue host.', '{}'::jsonb, -600, -14),
  ('pc29', 'Allison',   'Mercer',    'amercer@example.com',            null,             'Oakland',       array['partner_contact','sponsor_contact','employer_contact'], 'Operations Director, Brightwater Freight. Sent the Summer Works sponsorship this month.', '{"employer_partner":true}'::jsonb, -600, -4),
  ('pc30', 'Desmond',   'Clarke',    'dclarke@example.com',            null,             'Oakland',       array['partner_contact','sponsor_contact'], 'CEO, Tidewell Community Credit Union. Teaches the Summer Works financial-literacy session himself.', '{}'::jsonb, -560, -10),
  ('pc31', 'Inez',      'Galvan',    'igalvan@example.com',            null,             'Oakland',       array['partner_contact','employer_contact'], 'HR Manager, Copperline Electric. Pre-apprenticeship slots for trades fellows.', '{"employer_partner":true}'::jsonb, -480, -50),
  ('pc32', 'Peter',     'Lindgren',  'plindgren@example.com',          null,             'Piedmont',      array['partner_contact','sponsor_contact'], 'Managing Partner, Harborlight Property Group. Presenting gala sponsor.', '{}'::jsonb, -700, -150),
  ('pc33', 'Keiko',     'Ward',      'kward@example.com',              null,             'Oakland',       array['partner_contact','employer_contact'], 'Practice Manager, Mosaic Smile Dental. Runs the dental-assistant shadow day.', '{"employer_partner":true}'::jsonb, -380, -168),
  ('pc34', 'Bernard',   'Kimani',    'bkimani@example.com',            null,             'Oakland',       array['partner_contact','employer_contact'], 'Owner, Juniper Lane Bakery. Hires two Summer Works interns every year.', '{"employer_partner":true}'::jsonb, -520, -165),
  ('pc35', 'Celia',     'Moreno',    'cmoreno@example.com',            null,             'San Francisco', array['partner_contact','employer_contact'], 'Director of People, Quillfeather Software. Runs their matching-gift program.', '{"employer_partner":true}'::jsonb, -650, -60)
) c(k, fn, ln, email, phone, city, tags, notes, cf, since, touched)
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Individual donors (~300), their households and spouses
-- ════════════════════════════════════════════════════════════════════════════
insert into public.households (id, org_id, name, salutation, created_at, updated_at)
select pg_temp.nb_id('hh:' || b.k), pg_temp.nb_org(), b.ln || ' Household', b.fn || ' and ' || pg_temp.s3a_spouse_fn(b.i),
       coalesce(f.first_ts, pg_temp.ts(-400, '10:00')), coalesce(f.first_ts, pg_temp.ts(-400, '10:00'))
from pg_temp.s3a_bulk() b
left join (select k, min(created_at) first_ts from pg_temp.s3a_bulk_gifts() group by k) f on f.k = b.k
where b.hh
on conflict do nothing;

insert into public.constituents
  (id, org_id, type, first_name, last_name, emails, phones, street, city, state, postal_code, tags,
   do_not_contact, household_id, source, notes, why_matters, preferred_ack_channel, custom_fields,
   created_at, updated_at, archived_at)
select pg_temp.nb_id('con:' || b.k), pg_temp.nb_org(), 'person', b.fn, b.ln,
  case when b.i = 1 or (b.i not in (2, 3, 60, 120, 200, 299, 300) and pg_temp.rnd('s3a:noemail:' || b.k) < .05) then '{}'::text[]
       else array[pg_temp.s3a_email(b.fn, b.ln, b.i)] end,
  case when pg_temp.rnd('s3a:phone:' || b.k) < .5 or b.tier = 'mid' then array[pg_temp.s3a_phone(b.i)] else '{}'::text[] end,
  a.street, a.city, 'CA', a.zip,
  array['donor']
    || case when b.tier = 'mid' then array['mid_level'] else '{}'::text[] end
    || case when gs.gala then array['gala'] else '{}'::text[] end
    || case when b.i % 11 = 0 then array['alumni_parent'] else '{}'::text[] end,
  b.i in (88, 191, 245),
  case when b.hh then pg_temp.nb_id('hh:' || b.k) end,
  case when b.pattern = 'fresh' then 'stripe'
       when b.pattern = 'prospect' then 'manual'
       when gs.first_gift < pg_temp.d(-600) then 'import'
       when gs.first_src = 'stripe' then 'stripe' else 'manual' end,
  case
    when b.i = 1   then 'Gives appreciated stock through a brokerage; prefers mailed letters and has no email on file.'
    when b.i = 4   then 'Four-installment pledge for Summer Works stipends; the third installment slipped past its date.'
    when b.i = 7   then 'Monthly pledge toward Pathways certification exam fees.'
    when b.i = 88  then 'Asked for no solicitations. Still gives every December; thank-you only.'
    when b.i = 191 then 'Do not contact: asked to be removed from all mail and email.'
    when b.i = 245 then 'Do not contact at the family''s request.'
    when b.i = 133 then 'Moved to Portland; asked us to close the record. Kept for giving history.'
    when b.i = 277 then 'Deceased (family let us know in the spring). Archived to keep the giving history.'
    when b.i = 298 then 'Signed in at the gala as a guest; interested in Mentor Circles. No gift yet.'
    when b.i = 299 then 'Toured the Pathways IT lab with a friend from work; first gift came a week later.'
    when b.i = 300 then 'New online donor this morning; found us through the Kinetic Labs story about Amara.'
    when pg_temp.rnd('s3a:note:' || b.k) < .28 then pg_temp.pick(array[
      'Parent of a Launchpad alum from Bayshore.', 'Retired OUSD teacher; reads every newsletter.',
      'Works in hospital administration; asked about the healthcare track.', 'Gives through a workplace giving campaign at year-end.',
      'Prefers email; no mailed appeals please.', 'Supervised a Summer Works intern at a family-owned shop.',
      'Former Mentor Circles volunteer.', 'Met at the Fruitvale community night.', 'Small-business owner in Temescal.',
      'Comes to the spring donor dinner every year.', 'Asks for an annual giving summary each January.',
      'Employer matches gifts; remind about the match form.', 'Grew up in West Oakland; brother went through Launchpad.',
      'Heard Amara speak at the gala and wants updates on Pathways.', 'Church partner; organizes a holiday coat drive for fellows.'],
      's3a:notepick:' || b.k) end,
  case when b.tier = 'mid' and b.i not in (1, 4, 7) then pg_temp.pick(array[
      'A first-generation professional who says a summer job at seventeen changed everything.',
      'Has mentored two Pathways fellows informally and hired one.',
      'Retired nurse; gives to the healthcare track in honor of her mother.',
      'Grew up in Fruitvale and wants teens there to have the network she had to build alone.',
      'Engineer who funds certification exams because that is where fellows get stuck.',
      'Former OUSD principal; believes paid work is the best attendance program there is.',
      'Small-business owner who hires our interns and pays above minimum wage.',
      'Lost a nephew to violence in East Oakland; gives so teens have somewhere to be after school.'],
      's3a:why:' || b.k)
    when b.i = 1 then 'Thirty-year Oakland public defender; gives stock every fall because he has seen what a first job does for a kid.'
    when b.i = 4 then 'Committed four installments to put four more interns on payroll this summer.' end,
  case when b.i = 1 then 'letter'
       when b.tier = 'mid' then (case when pg_temp.rnd('s3a:ackch:' || b.k) < .55 then 'letter' when pg_temp.rnd('s3a:ackch:' || b.k) < .75 then 'call' else 'email' end)
       when pg_temp.rnd('s3a:ackch:' || b.k) < .35 then 'email' end,
  case when pg_temp.rnd('s3a:aff:' || b.k) < .4 then jsonb_build_object('affinity',
         pg_temp.pick(array['Career mentoring','Youth employment','Education equity','Oakland roots','Alumni family'], 's3a:affpick:' || b.k))
       else '{}'::jsonb end,
  case when b.pattern = 'prospect' then pg_temp.ts(-165, '21:10')
       when b.k = 'd299' then pg_temp.ts(-12, '15:40')
       when b.k = 'd300' then pg_temp.ts(0, '07:05')
       else least(pg_temp.s3a_at(gs.first_gift, '10:' || lpad((b.i % 60)::text, 2, '0')),
                  case b.k when 'd012' then pg_temp.s3a_at((pg_temp.s3a_last_dec() - interval '1 year')::date + 5, '10:00')
                           when 'd004' then pg_temp.ts(-200, '10:00') when 'd007' then pg_temp.ts(-215, '10:00') end) end,
  case when b.pattern = 'prospect' then pg_temp.ts(-165, '21:10')
       when b.k = 'd299' then pg_temp.ts(-4, '11:20')
       when b.k = 'd300' then pg_temp.ts(0, '07:05')
       else greatest(gs.last_ack, pg_temp.s3a_at(gs.first_gift, '10:00')) end,
  case when b.i = 133 then pg_temp.ts(-210, '12:00') when b.i = 277 then pg_temp.ts(-150, '12:00') end
from pg_temp.s3a_bulk() b
cross join lateral pg_temp.s3a_addr(b.i) a
left join (
  select k, min(gift_date) as first_gift, max(ack_at) as last_ack, bool_or(ev like 'gala%') as gala,
         (array_agg(src order by gift_date))[1] as first_src
  from pg_temp.s3a_bulk_gifts() group by k) gs on gs.k = b.k
on conflict do nothing;

-- Spouses / partners in the donor households (soft-credited on household gifts).
insert into public.constituents
  (id, org_id, type, first_name, last_name, emails, street, city, state, postal_code, tags, household_id, source,
   created_at, updated_at)
select pg_temp.nb_id('con:sp' || substr(b.k, 2)), pg_temp.nb_org(), 'person', pg_temp.s3a_spouse_fn(b.i), b.ln,
  case when b.i % 3 = 0 then '{}'::text[] else array[pg_temp.s3a_email(pg_temp.s3a_spouse_fn(b.i), b.ln, 600 + b.i)] end,
  c.street, c.city, 'CA', c.postal_code, array['household_member'], pg_temp.nb_id('hh:' || b.k), c.source,
  c.created_at, c.created_at
from pg_temp.s3a_bulk() b
join public.constituents c on c.id = pg_temp.nb_id('con:' || b.k)
where b.hh
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Monthly donors (45)
-- ════════════════════════════════════════════════════════════════════════════
insert into public.constituents
  (id, org_id, type, first_name, last_name, emails, phones, street, city, state, postal_code, tags, source, notes,
   preferred_ack_channel, custom_fields, created_at, updated_at)
select pg_temp.nb_id('con:' || m.k), pg_temp.nb_org(), 'person', m.fn, m.ln,
  array[pg_temp.s3a_email(m.fn, m.ln, 300 + m.n)],
  case when pg_temp.rnd('s3a:phone:' || m.k) < .45 then array[pg_temp.s3a_phone(300 + m.n)] else '{}'::text[] end,
  a.street, a.city, 'CA', a.zip,
  array['donor','monthly_donor'] || case when m.n % 6 = 0 then array['mentor_alumni'] else '{}'::text[] end,
  case when m.src = 'manual' then 'manual' else 'stripe' end,
  case m.n
    when 7  then 'Card declined on the last charge; Jordan emailed for an updated card.'
    when 12 then 'Mails a check on the first of every month; logged as a manual plan.'
    when 19 then 'Card expired; second failed attempt this week.'
    when 27 then 'Monthly bank bill-pay check; manual plan.'
    when 33 then 'Paused for three months while between jobs; asked us to check back in January.'
    when 40 then 'Cancelled after moving abroad; still on the newsletter.'
    when 44 then 'Cancelled to give one larger gift at year-end instead.'
    else case when pg_temp.rnd('s3a:mnote:' || m.k) < .3 then pg_temp.pick(array[
      'Joined the Monthly Giving Circle on GivingTuesday.', 'Increased her monthly gift after the gala.',
      'Started giving monthly after the Summer Works showcase.', 'Former Launchpad parent.',
      'Monthly donor since the circle launched.', 'Asked for the year-end giving summary by email.'], 's3a:mnotepick:' || m.k) end end,
  case when m.n % 5 = 0 then 'email' end,
  case when pg_temp.rnd('s3a:aff:' || m.k) < .35 then jsonb_build_object('affinity',
         pg_temp.pick(array['Career mentoring','Youth employment','Education equity','Oakland roots','Alumni family'], 's3a:affpick:' || m.k))
       else '{}'::jsonb end,
  pg_temp.s3a_at((m.last_charge - make_interval(months => m.months - 1))::date, '06:00'),
  greatest(pg_temp.s3a_at(m.last_charge, '06:00'), coalesce(m.failed_at, pg_temp.s3a_at(m.last_charge, '06:00')))
from pg_temp.s3a_monthly() m
cross join lateral pg_temp.s3a_addr(300 + m.n) a
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Mentors (Mentor Circles volunteers, 60)
-- ════════════════════════════════════════════════════════════════════════════
insert into public.constituents
  (id, org_id, type, first_name, last_name, emails, phones, street, city, state, postal_code, tags, source, notes,
   custom_fields, created_at, updated_at)
select pg_temp.nb_id('con:' || t.k), pg_temp.nb_org(), 'person', t.fn, t.ln,
  array[pg_temp.s3a_email(t.fn, t.ln, 345 + t.n)],
  case when t.n % 3 <> 0 then array[pg_temp.s3a_phone(345 + t.n)] else '{}'::text[] end,
  a.street, a.city, 'CA', a.zip,
  array['mentor','volunteer'] || case when t.employer = 'kinetic' then array['kinetic_mentor'] else '{}'::text[] end,
  'manual',
  case t.status
    when 'Matched' then pg_temp.pick(array[
      'Matched with a Launchpad junior at Bayshore; meets every other Thursday.', 'Matched with a Pathways IT fellow; mock interviews monthly.',
      'Matched with a healthcare-track fellow; shadow day at her clinic in the spring.', 'Matched with a Launchpad senior at Eastlake; college essays this fall.',
      'Matched with a trades fellow; helped him prep for the apprenticeship test.', 'Matched with a Summer Works alum; résumé and LinkedIn this month.',
      'Matched with a Laurel Ridge sophomore; mostly math help and encouragement.'], 's3a:mtnote:' || t.k)
    when 'Trained' then 'Completed mentor training; waiting on a match for the spring cohort.'
    when 'Alumni mentor' then 'Mentored for two years; now helps run the circle orientation.'
    when 'Background check' then 'Background check submitted; orientation scheduled.'
    else 'Applied through the website; Simone to schedule a screening call.' end,
  jsonb_build_object('mentor_status', t.status, 'affinity', 'Career mentoring')
    || case when t.employer is not null then jsonb_build_object('employer_partner', true) else '{}'::jsonb end,
  pg_temp.ts(t.since, '18:15'), pg_temp.ts(greatest(t.since + 10, -2), '17:30')
from pg_temp.s3a_mentors() t
cross join lateral pg_temp.s3a_addr(345 + t.n) a
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Intentional duplicates (the duplicates screen finds them by shared email)
-- ════════════════════════════════════════════════════════════════════════════
insert into public.constituents
  (id, org_id, type, first_name, last_name, emails, city, state, tags, source, notes, created_at, updated_at)
select pg_temp.nb_id('con:' || v.k), pg_temp.nb_org(), 'person',
       case v.k when 'dup2' then left(c.first_name, 1) || '.' when 'dup3' then lower(c.first_name) else c.first_name end,
       case v.k when 'dup1' then left(c.last_name, length(c.last_name) - 2) || right(c.last_name, 1) || substr(c.last_name, length(c.last_name) - 1, 1)
                when 'dup3' then lower(c.last_name) else c.last_name end,
       c.emails, c.city, 'CA', array['donor'], v.src, v.notes, pg_temp.ts(v.at, '20:40'), pg_temp.ts(v.at, '20:40')
from (values
  ('dup1', 'd045', 'manual', 'Created at gala check-in (name typed from the sign-in sheet).', -165),
  ('dup2', 'm12',  'stripe', 'Created by an online gift; same email as a monthly check donor.', -60),
  ('dup3', 'mt41', 'manual', 'Volunteer interest form.', -20)
) v(k, base, src, notes, at)
join public.constituents c on c.id = pg_temp.nb_id('con:' || v.base) and cardinality(c.emails) > 0
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 8. Recurring plans (45: 40 healthy, 2 failing, 1 paused, 2 cancelled)
-- ════════════════════════════════════════════════════════════════════════════
insert into public.recurring_plans
  (id, org_id, constituent_id, amount, frequency, status, external_source, external_id,
   created_at, updated_at, last_charged_at, last_payment_failed_at)
select pg_temp.nb_id('rp:' || m.k), pg_temp.nb_org(), pg_temp.nb_id('con:' || m.k), m.amount, 'monthly', m.status,
       m.src, null,
       pg_temp.s3a_at((m.last_charge - make_interval(months => m.months - 1))::date, '06:00'),
       greatest(pg_temp.s3a_at(m.last_charge, '06:00'), coalesce(m.failed_at, pg_temp.s3a_at(m.last_charge, '06:00')),
                case when m.status <> 'active' then pg_temp.s3a_at(m.last_charge + 12, '14:20') else pg_temp.s3a_at(m.last_charge, '06:00') end),
       pg_temp.s3a_at(m.last_charge, '06:00'), m.failed_at
from pg_temp.s3a_monthly() m
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 9. Pledges (6) — schedules in section 11
-- ════════════════════════════════════════════════════════════════════════════
create or replace function pg_temp.s3a_pledges() returns table(
    k text, con text, total numeric, n int, freq text, start_date date, fund text, camp uuid, status text, notes text, since int)
  language sql stable as $$
  select * from (values
    ('chen', 'chen_margaret', 150000::numeric, 3, 'annually', pg_temp.d(-322), 'general', pg_temp.s3a_camp_id('camp:annual'), 'active',
     'Three-year commitment, $50K a year, confirmed at the Chens'' home last fall. Installment two due early December; send the reminder letter in November.', -340),
    ('kinetic', 'kinetic', 75000, 3, 'quarterly', pg_temp.d(-30), 'pathways', pg_temp.s3a_camp_id('camp:annual'), 'active',
     'Kinetic Labs partnership pledge for this fiscal year, restricted to the Pathways IT track. Invoiced to Priscilla Gomez; paid by ACH.', -45),
    ('harrington', 'bd_harrington', 20000, 1, 'annually', make_date(extract(year from pg_temp.d(60))::int, 12, 15), 'general', pg_temp.s3a_camp_id('camp:annual'), 'active',
     'Second half of Celeste''s $40K annual commitment (first half paid in July). She sends it before the December board meeting.', -101),
    ('d004', 'd004', 10000, 4, 'quarterly', (pg_temp.d(-12) - interval '6 months')::date, 'stipends', pg_temp.s3a_camp_id('camp:annual'), 'active',
     'Four quarterly installments to fund four Summer Works stipends. Third installment is late; Priya to call before sending a reminder.', -200),
    ('d007', 'd007', 6000, 12, 'monthly', (pg_temp.d(4) - interval '7 months')::date, 'pathways', pg_temp.s3a_camp_id('camp:annual'), 'active',
     '$500 a month for twelve months toward Pathways certification exam fees.', -215),
    ('d012', 'd012', 5000, 2, 'annually', (pg_temp.s3a_last_dec() - interval '1 year')::date + 10, 'general', null::uuid, 'completed',
     'Two-year pledge, paid in full.', -690)
  ) p(k, con, total, n, freq, start_date, fund, camp, status, notes, since) $$;

insert into public.pledges
  (id, org_id, constituent_id, total_amount, installment_count, frequency, start_date, campaign_id, fund_id, status, notes, created_at, updated_at)
select pg_temp.nb_id('pledge:' || p.k), pg_temp.nb_org(), pg_temp.nb_id('con:' || p.con), p.total, p.n, p.freq, p.start_date,
       p.camp, pg_temp.nb_id('fund:' || p.fund), p.status, p.notes, pg_temp.ts(p.since, '15:10'),
       case when p.status = 'completed' then pg_temp.s3a_at(p.start_date + 368, '10:00') else pg_temp.ts(least(p.since + 2, -1), '09:30') end
from pg_temp.s3a_pledges() p
on conflict do nothing;

-- Installment schedule for every pledge (paid rows carry their gift key).
create or replace function pg_temp.s3a_pledge_sched() returns table(
    pk text, seq int, due date, amount numeric, status text, gkey text, paid_date date)
  language sql stable as $$
  select p.k, s.seq,
    case p.k
      when 'chen' then (array[p.start_date, pg_temp.d(45), pg_temp.d(410)])[s.seq]
      when 'kinetic' then (array[pg_temp.d(-30), pg_temp.d(60), pg_temp.d(150)])[s.seq]
      else (p.start_date + case p.freq when 'monthly' then make_interval(months => s.seq - 1)
                                       when 'quarterly' then make_interval(months => 3 * (s.seq - 1))
                                       else make_interval(years => s.seq - 1) end)::date end,
    round(p.total / p.n, 2),
    case when p.k = 'chen' and s.seq = 1 then 'paid'
         when p.k = 'kinetic' and s.seq = 1 then 'paid'
         when p.k = 'd004' and s.seq <= 2 then 'paid'
         when p.k = 'd007' and s.seq <= 7 then 'paid'
         when p.k = 'd012' then 'paid'
         else 'scheduled' end,
    case when p.k = 'chen' and s.seq = 1 then 'gift:chen_last'
         when p.k = 'kinetic' and s.seq = 1 then 'gift:kinetic_1'
         when (p.k = 'd004' and s.seq <= 2) or (p.k = 'd007' and s.seq <= 7) or p.k = 'd012' then 'gift:pl:' || p.k || ':' || s.seq end,
    null::date
  from pg_temp.s3a_pledges() p cross join lateral generate_series(1, p.n) s(seq) $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 10. Gifts
--   Every family below returns the same shape so gifts, acknowledgments, soft
--   credits, and interactions all derive from one definition.
-- ════════════════════════════════════════════════════════════════════════════
-- Hand-placed gifts: board, major donors, corporate partners, DAF, the gala,
-- and the last-14-days window (8 still awaiting a thank-you).
create or replace function pg_temp.s3a_named_gifts() returns table(
    gkey text, con text, amount numeric, gift_date date, method text, fund text, campaign_id uuid, appeal_id uuid,
    recurring_key text, ack_status text, ack_at timestamptz, ack_channel text, ack_by text, fmv numeric, src text,
    notes text, created_at timestamptz, ev text)
  language sql stable as $$
  with v(gkey, con, amount, gdate, method, fund, camp, ev, paddle, ack, lag, hhmi, fmv, src, notes, chan, by, chhmi) as (values
    -- ── Board of directors ──
    ('gift:harrington_1',          'bd_harrington', 20000::numeric, pg_temp.d(-100), 'check', 'general', 'auto', null::text, false, 'sent', 2, '11:15', null::numeric, 'manual', 'First half of Celeste''s $40K annual commitment.', null::text, null::text, '12:00'),
    ('gift:harrington_ye_last',    'bd_harrington', 20000, pg_temp.s3a_last_dec() + 10, 'check', 'general', 'auto', 'ye_last', false, 'sent', 2, '11:15', null, 'manual', 'Second half of her annual commitment.', null, null, '12:00'),
    ('gift:harrington_jul_prev',   'bd_harrington', 20000, pg_temp.d(-465), 'check', 'general', 'auto', null, false, 'sent', 2, '11:15', null, 'manual', null, null, null, '12:00'),
    ('gift:harrington_ye_prev',    'bd_harrington', 17500, (pg_temp.s3a_last_dec() - interval '1 year')::date + 10, 'check', 'general', 'auto', 'ye_prev', false, 'sent', 2, '11:15', null, 'manual', null, null, null, '12:00'),
    ('gift:harrington_jul_prev2',  'bd_harrington', 17500, pg_temp.d(-830), 'check', 'general', 'auto', null, false, 'sent', 3, '11:15', null, 'import', null, null, null, '12:00'),
    ('gift:harrington_ye_prev2',   'bd_harrington', 15000, (pg_temp.s3a_last_dec() - interval '2 years')::date + 10, 'check', 'general', 'none', null, false, 'sent', 3, '11:15', null, 'import', null, null, null, '12:00'),
    ('gift:harrington_ye_prev3',   'bd_harrington', 15000, (pg_temp.s3a_last_dec() - interval '3 years')::date + 10, 'check', 'general', 'none', null, false, 'sent', 3, '11:15', null, 'import', null, null, null, '12:00'),
    ('gift:harrington_ye_prev4',   'bd_harrington', 12000, (pg_temp.s3a_last_dec() - interval '4 years')::date + 10, 'check', 'general', 'none', null, false, 'sent', 3, '11:15', null, 'import', null, null, null, '12:00'),
    ('gift:harrington_gala',       'bd_harrington', 10000, pg_temp.d(-165), 'check', 'general', 'gala', 'gala_last', true, 'sent', 3, '10:30', null, 'manual', 'Opened the paddle raise.', null, null, '23:10'),
    ('gift:harrington_gala_prev',  'bd_harrington', 7500,  pg_temp.d(-529), 'check', 'general', 'auto', 'gala_prev', true, 'sent', 3, '10:30', null, 'manual', 'Paddle raise.', null, null, '23:10'),
    ('gift:osei_fy',               'bd_osei', 10000, pg_temp.d(-88), 'ach', 'general', 'auto', null, false, 'sent', 2, '10:05', null, 'manual', 'Annual board gift.', null, null, '12:00'),
    ('gift:osei_ye_last',          'bd_osei', 10000, pg_temp.s3a_last_dec() + 8, 'ach', 'general', 'auto', 'ye_last', false, 'sent', 2, '10:05', null, 'manual', null, null, null, '12:00'),
    ('gift:osei_ye_prev',          'bd_osei', 7500, (pg_temp.s3a_last_dec() - interval '1 year')::date + 8, 'ach', 'general', 'auto', 'ye_prev', false, 'sent', 2, '10:05', null, 'import', null, null, null, '12:00'),
    ('gift:osei_ye_prev2',         'bd_osei', 5000, (pg_temp.s3a_last_dec() - interval '2 years')::date + 8, 'check', 'general', 'none', null, false, 'sent', 3, '10:05', null, 'import', null, null, null, '12:00'),
    ('gift:osei_gala',             'bd_osei', 2500, pg_temp.d(-165), 'card', 'general', 'gala', 'gala_last', true, 'sent', 3, '10:30', null, 'stripe', 'Paddle raise.', null, null, '22:40'),
    ('gift:lim_fy',                'bd_lim', 5000, pg_temp.d(-70), 'check', 'general', 'auto', null, false, 'sent', 2, '09:40', null, 'manual', 'Annual board gift; asked that it stay unrestricted.', null, null, '12:00'),
    ('gift:lim_prev',              'bd_lim', 5000, pg_temp.d(-445), 'check', 'general', 'auto', null, false, 'sent', 2, '09:40', null, 'manual', null, null, null, '12:00'),
    ('gift:lim_prev2',             'bd_lim', 4000, pg_temp.d(-810), 'check', 'general', 'auto', null, false, 'sent', 3, '09:40', null, 'import', null, null, null, '12:00'),
    ('gift:lim_gala',              'bd_lim', 1000, pg_temp.d(-165), 'card', 'general', 'gala', 'gala_last', false, 'sent', 3, '10:30', 300, 'stripe', 'Gala tickets (two).', null, null, '19:05'),
    ('gift:ramos_ye_last',         'bd_ramos', 2500, pg_temp.s3a_last_dec() + 20, 'check', 'general', 'auto', 'ye_last', false, 'sent', 4, '10:00', null, 'manual', null, null, 'jordan', '12:00'),
    ('gift:ramos_ye_prev',         'bd_ramos', 2500, (pg_temp.s3a_last_dec() - interval '1 year')::date + 20, 'check', 'general', 'auto', 'ye_prev', false, 'sent', 4, '10:00', null, 'import', null, null, null, '12:00'),
    ('gift:ramos_gala_prev',       'bd_ramos', 1000, pg_temp.d(-529), 'card', 'general', 'auto', 'gala_prev', false, 'sent', 3, '10:30', 300, 'stripe', 'Gala tickets (two).', null, null, '18:50'),
    ('gift:freeman_fy',            'bd_freeman', 2500, pg_temp.d(-25), 'check', 'general', 'auto', null, false, 'sent', 1, '14:20', null, 'manual', 'Annual board gift. She asked to underwrite a FAFSA night.', null, 'remi', '12:00'),
    ('gift:freeman_ye_last',       'bd_freeman', 500, pg_temp.s3a_last_dec() + 12, 'check', 'general', 'auto', 'ye_last', false, 'sent', 3, '10:00', null, 'manual', null, null, null, '12:00'),
    ('gift:freeman_prev',          'bd_freeman', 2500, pg_temp.d(-410), 'check', 'general', 'auto', null, false, 'sent', 2, '10:00', null, 'manual', null, null, null, '12:00'),
    ('gift:freeman_ye_prev',       'bd_freeman', 500, (pg_temp.s3a_last_dec() - interval '1 year')::date + 12, 'check', 'general', 'auto', 'ye_prev', false, 'sent', 3, '10:00', null, 'import', null, null, null, '12:00'),
    ('gift:freeman_prev3',         'bd_freeman', 2500, (pg_temp.s3a_last_dec() - interval '2 years')::date + 12, 'check', 'general', 'none', null, false, 'sent', 3, '10:00', null, 'import', null, null, null, '12:00'),
    ('gift:freeman_prev4',         'bd_freeman', 2000, (pg_temp.s3a_last_dec() - interval '3 years')::date + 12, 'check', 'general', 'none', null, false, 'sent', 3, '10:00', null, 'import', null, null, null, '12:00'),
    ('gift:nakamura_fy',           'legacy_daf', 25000, pg_temp.d(-52), 'check', 'general', 'auto', null, false, 'sent', 3, '16:40', null, 'manual', 'DAF grant recommended by Ken Nakamura (his annual board gift). Soft credit to Ken.', 'letter', 'remi', '12:00'),
    ('gift:nakamura_gala',         'bd_nakamura', 10000, pg_temp.d(-165), 'check', 'general', 'gala', 'gala_last', false, 'sent', 3, '10:30', 1500, 'manual', 'Host table at the gala (Ravi Patel was his guest).', null, null, '19:30'),
    ('gift:nakamura_prev',         'bd_nakamura', 25000, pg_temp.d(-385), 'stock', 'general', 'auto', null, false, 'sent', 2, '16:40', null, 'manual', 'Appreciated stock.', null, null, '12:00'),
    ('gift:nakamura_gala_prev',    'bd_nakamura', 5000, pg_temp.d(-529), 'check', 'general', 'auto', 'gala_prev', false, 'sent', 3, '10:30', 1500, 'manual', 'Gala table.', null, null, '19:30'),
    ('gift:nakamura_first',        'bd_nakamura', 10000, pg_temp.d(-760), 'stock', 'general', 'auto', null, false, 'sent', 3, '16:40', null, 'import', 'First gift, the month he joined the board.', null, null, '12:00'),
    ('gift:jackson_fy',            'bd_jackson', 7500, pg_temp.d(-47), 'card', 'pathways', 'auto', null, false, 'sent', 1, '13:10', null, 'stripe', 'Board gift, designated to the healthcare track.', null, null, '12:00'),
    ('gift:jackson_prev',          'bd_jackson', 5000, pg_temp.d(-400), 'card', 'pathways', 'auto', null, false, 'sent', 2, '13:10', null, 'stripe', null, null, null, '12:00'),
    ('gift:jackson_gala',          'bd_jackson', 1000, pg_temp.d(-165), 'card', 'general', 'gala', 'gala_last', false, 'sent', 3, '10:30', 300, 'stripe', 'Gala tickets (two).', null, null, '19:12'),
    ('gift:brooks_fy',             'bd_brooks', 300, pg_temp.d(-25), 'card', 'pathways', 'auto', null, false, 'sent', 1, '09:30', null, 'stripe', 'Youth-seat board gift.', 'email', 'jordan', '12:00'),
    ('gift:brooks_gt_last',        'bd_brooks', 100, pg_temp.s3a_gt(extract(year from pg_temp.s3a_last_dec())::int), 'card', 'general', 'auto', 'gt_last', false, 'sent', 1, '09:30', null, 'stripe', null, null, null, '12:00'),
    ('gift:brooks_ye_prev',        'bd_brooks', 150, (pg_temp.s3a_last_dec() - interval '1 year')::date + 20, 'card', 'general', 'auto', 'ye_prev', false, 'sent', 2, '09:30', null, 'stripe', null, null, null, '12:00'),
    ('gift:brooks_gt_prev',        'bd_brooks', 50, pg_temp.s3a_gt(extract(year from pg_temp.s3a_last_dec())::int - 1), 'card', 'general', 'auto', 'gt_prev', false, 'sent', 1, '09:30', null, 'stripe', null, null, null, '12:00'),
    -- ── Major individual donors ──
    ('gift:chen_last',             'chen_margaret', 50000, pg_temp.d(-320), 'check', 'general', 'auto', null, false, 'sent', 1, '15:00', null, 'pledge', 'Pledge installment 1 of 3.', null, null, '12:00'),
    ('gift:chen_ye_prev',          'chen_margaret', 30000, (pg_temp.s3a_last_dec() - interval '1 year')::date + 15, 'check', 'general', 'auto', 'ye_prev', false, 'sent', 2, '15:00', null, 'import', 'Year-end gift from the Chen family fund.', null, null, '12:00'),
    ('gift:chen_ye_prev2',         'chen_margaret', 25000, (pg_temp.s3a_last_dec() - interval '2 years')::date + 15, 'check', 'general', 'none', null, false, 'sent', 3, '15:00', null, 'import', null, null, null, '12:00'),
    ('gift:chen_ye_prev3',         'chen_margaret', 25000, (pg_temp.s3a_last_dec() - interval '3 years')::date + 15, 'check', 'general', 'none', null, false, 'sent', 3, '15:00', null, 'import', null, null, null, '12:00'),
    ('gift:chen_ye_prev4',         'chen_margaret', 20000, (pg_temp.s3a_last_dec() - interval '4 years')::date + 15, 'check', 'general', 'none', null, false, 'sent', 3, '15:00', null, 'import', null, null, null, '12:00'),
    ('gift:chen_gala',             'chen_margaret', 5000, pg_temp.d(-165), 'card', 'general', 'gala', 'gala_last', true, 'sent', 3, '10:30', null, 'stripe', 'Paddle raise.', null, null, '22:45'),
    ('gift:okafor_last',           'okafor', 25000, pg_temp.d(-300), 'stock', 'general', 'auto', 'ye_last', false, 'sent', 2, '11:00', null, 'manual', 'Appreciated stock, given after the gala conversation with Daniel Osei.', null, null, '12:00'),
    ('gift:okafor_ye_prev',        'okafor', 15000, (pg_temp.s3a_last_dec() - interval '1 year')::date + 12, 'stock', 'general', 'auto', 'ye_prev', false, 'sent', 3, '11:00', null, 'import', null, null, null, '12:00'),
    ('gift:okafor_gala_prev',      'okafor', 1000, pg_temp.d(-529), 'card', 'general', 'auto', 'gala_prev', false, 'sent', 3, '10:30', 300, 'stripe', 'Gala tickets (two).', null, null, '19:20'),
    ('gift:okafor_ye_prev2',       'okafor', 10000, (pg_temp.s3a_last_dec() - interval '2 years')::date + 20, 'check', 'general', 'none', null, false, 'sent', 3, '11:00', null, 'import', 'First gift.', null, null, '12:00'),
    ('gift:alvarez_gala',          'alvarez_ricardo', 15000, pg_temp.d(-165), 'check', 'general', 'gala', 'gala_last', false, 'sent', 2, '14:30', 1500, 'manual', 'Gala table for ten, plus his kitchens'' Summer Works interns as guests.', null, null, '19:00'),
    ('gift:alvarez_gala_prev',     'alvarez_ricardo', 12500, pg_temp.d(-529), 'check', 'general', 'auto', 'gala_prev', false, 'sent', 2, '14:30', 1500, 'manual', 'Gala table for ten.', null, null, '19:00'),
    ('gift:alvarez_ye_last',       'alvarez_ricardo', 2500, pg_temp.s3a_last_dec() + 18, 'card', 'general', 'auto', 'ye_last', false, 'sent', 3, '14:30', null, 'stripe', null, null, null, '12:00'),
    ('gift:elena_gt_last',         'alvarez_elena', 250, pg_temp.s3a_gt(extract(year from pg_temp.s3a_last_dec())::int), 'card', 'general', 'auto', 'gt_last', false, 'sent', 1, '10:00', null, 'stripe', null, null, null, '12:00'),
    ('gift:goldberg_gala',         'goldberg', 1000, pg_temp.d(-165), 'card', 'general', 'gala', 'gala_last', false, 'sent', 3, '10:30', 300, 'stripe', 'Gala tickets (two); a DAF can''t buy tickets, so he paid personally.', null, null, '19:08'),
    ('gift:goldberg_gala_prev',    'goldberg', 500, pg_temp.d(-529), 'card', 'general', 'auto', 'gala_prev', false, 'sent', 3, '10:30', 300, 'stripe', 'Gala ticket.', null, null, '19:08'),
    ('gift:goldberg_daf',          'legacy_daf', 20000, pg_temp.d(-9), 'check', 'general', 'auto', null, false, 'pending', 0, '10:00', null, null, 'DAF grant from Bay Legacy Giving Fund, recommended by Aaron Goldberg. Unrestricted. No tax receipt to the advisor; thank Aaron personally.', null, null, '14:05'),
    ('gift:goldberg_daf_last',     'legacy_daf', 15000, pg_temp.s3a_last_dec() + 19, 'check', 'general', 'auto', 'ye_last', false, 'sent', 4, '11:30', null, 'manual', 'DAF grant recommended by Aaron Goldberg.', 'letter', 'remi', '12:00'),
    ('gift:goldberg_daf_prev',     'legacy_daf', 10000, (pg_temp.s3a_last_dec() - interval '1 year')::date + 18, 'check', 'general', 'auto', 'ye_prev', false, 'sent', 4, '11:30', null, 'import', 'DAF grant recommended by Aaron Goldberg.', 'letter', 'remi', '12:00'),
    ('gift:goldberg_daf_prev2',    'legacy_daf', 10000, (pg_temp.s3a_last_dec() - interval '2 years')::date + 18, 'check', 'general', 'none', null, false, 'sent', 4, '11:30', null, 'import', 'DAF grant recommended by Aaron Goldberg.', 'letter', 'remi', '12:00'),
    ('gift:bell_ye_last',          'bell', 10000, pg_temp.s3a_last_dec() + 14, 'check', 'general', 'auto', 'ye_last', false, 'sent', 3, '10:45', null, 'manual', 'December gift, after the year-end letter.', null, null, '12:00'),
    ('gift:bell_ye_prev',          'bell', 10000, (pg_temp.s3a_last_dec() - interval '1 year')::date + 16, 'check', 'general', 'auto', 'ye_prev', false, 'sent', 3, '10:45', null, 'import', 'December gift.', null, null, '12:00'),
    ('gift:bell_ye_prev2',         'bell', 8000, (pg_temp.s3a_last_dec() - interval '2 years')::date + 16, 'check', 'general', 'none', null, false, 'sent', 3, '10:45', null, 'import', null, null, null, '12:00'),
    ('gift:bell_ye_prev3',         'bell', 8000, (pg_temp.s3a_last_dec() - interval '3 years')::date + 16, 'check', 'general', 'none', null, false, 'sent', 3, '10:45', null, 'import', null, null, null, '12:00'),
    ('gift:bell_ye_prev4',         'bell', 7500, (pg_temp.s3a_last_dec() - interval '4 years')::date + 16, 'check', 'general', 'none', null, false, 'sent', 3, '10:45', null, 'import', null, null, null, '12:00'),
    ('gift:bell_ye_prev5',         'bell', 5000, (pg_temp.s3a_last_dec() - interval '5 years')::date + 16, 'check', 'general', 'none', null, false, 'sent', 3, '10:45', null, 'import', 'First gift.', null, null, '12:00'),
    -- ── Corporate partners ──
    ('gift:pacific_summit',        'pacific_summit', 50000, pg_temp.d(-140), 'ach', 'stipends', 'auto', null, false, 'sent', 3, '10:20', null, 'manual', 'Summer Works presenting sponsorship (8 interns, branch operations and commercial banking).', null, null, '12:00'),
    ('gift:psb_match',             'pacific_summit', 5920, pg_temp.d(-35), 'ach', 'general', 'auto', null, false, 'sent', 3, '10:20', null, 'manual', 'Employee matching gifts (quarterly batch from the bank''s giving program).', 'email', 'jordan', '12:00'),
    ('gift:psb_prev',              'pacific_summit', 45000, pg_temp.d(-505), 'ach', 'stipends', 'auto', null, false, 'sent', 3, '10:20', null, 'manual', 'Summer Works presenting sponsorship.', null, null, '12:00'),
    ('gift:psb_prev2',             'pacific_summit', 40000, pg_temp.d(-870), 'ach', 'stipends', 'none', null, false, 'sent', 3, '10:20', null, 'import', 'Summer Works presenting sponsorship.', null, null, '12:00'),
    ('gift:psb_gala',              'pacific_summit', 10000, pg_temp.d(-180), 'check', 'general', 'gala', null, false, 'sent', 3, '10:20', 1500, 'manual', 'Gala table sponsor.', null, null, '12:00'),
    ('gift:psb_gala_prev',         'pacific_summit', 7500, pg_temp.d(-545), 'check', 'general', 'auto', null, false, 'sent', 3, '10:20', 1500, 'manual', 'Gala table sponsor.', null, null, '12:00'),
    ('gift:kinetic_1',             'kinetic', 25000, pg_temp.d(-30), 'ach', 'pathways', 'auto', null, false, 'sent', 3, '11:40', null, 'pledge', 'Pledge installment 1 of 3.', 'email', 'priya', '12:00'),
    ('gift:kinetic_prev',          'kinetic', 40000, pg_temp.d(-250), 'ach', 'pathways', 'auto', null, false, 'sent', 3, '11:40', null, 'manual', 'Partnership gift for the Pathways IT track.', null, null, '12:00'),
    ('gift:kinetic_first',         'kinetic', 20000, pg_temp.d(-600), 'ach', 'pathways', 'auto', null, false, 'sent', 4, '11:40', null, 'manual', 'First partnership gift, after Ken Nakamura''s introduction.', null, null, '12:00'),
    ('gift:kinetic_gala',          'kinetic', 20000, pg_temp.d(-190), 'ach', 'general', 'gala', null, false, 'sent', 3, '11:40', 1500, 'manual', 'Gala sponsor (includes a table).', null, null, '12:00'),
    ('gift:redline',               'redline', 25000, pg_temp.d(-75), 'check', 'pathways', 'auto', null, false, 'sent', 2, '15:15', null, 'manual', 'For the trades pathway: tools, OSHA-10, and stipends for on-site internships.', null, null, '12:00'),
    ('gift:redline_prev',          'redline', 15000, pg_temp.d(-430), 'check', 'pathways', 'auto', null, false, 'sent', 3, '15:15', null, 'manual', null, null, null, '12:00'),
    ('gift:redline_gala',          'redline', 5000, pg_temp.d(-178), 'check', 'general', 'gala', null, false, 'sent', 3, '15:15', null, 'manual', 'Gala sponsor.', null, null, '12:00'),
    ('gift:harborlight_gala',      'corp_harborlight', 30000, pg_temp.d(-205), 'check', 'general', 'gala', null, false, 'sent', 3, '10:10', 3000, 'manual', 'Presenting sponsor, Northbridge Rising (two tables).', null, null, '12:00'),
    ('gift:harborlight_gala_prev', 'corp_harborlight', 15000, pg_temp.d(-570), 'check', 'general', 'auto', null, false, 'sent', 3, '10:10', 1500, 'manual', 'Presenting sponsor.', null, null, '12:00'),
    ('gift:harborlight_ye_last',   'corp_harborlight', 5000, pg_temp.s3a_last_dec() + 5, 'check', 'general', 'auto', 'ye_last', false, 'sent', 3, '10:10', null, 'manual', 'Year-end corporate gift.', null, null, '12:00'),
    ('gift:quillfeather_gala',     'corp_quillfeather', 15000, pg_temp.d(-200), 'ach', 'general', 'gala', null, false, 'sent', 3, '10:10', 1500, 'manual', 'Gala sponsor.', null, null, '12:00'),
    ('gift:quillfeather_gala_prev','corp_quillfeather', 10000, pg_temp.d(-560), 'ach', 'general', 'auto', null, false, 'sent', 3, '10:10', 1500, 'manual', 'Gala sponsor.', null, null, '12:00'),
    ('gift:brightwater_gala',      'corp_brightwater', 10000, pg_temp.d(-185), 'check', 'general', 'gala', null, false, 'sent', 3, '10:10', 1500, 'manual', 'Gala sponsor.', null, null, '12:00'),
    ('gift:brightwater_gala_prev', 'corp_brightwater', 7500, pg_temp.d(-555), 'check', 'general', 'auto', null, false, 'sent', 3, '10:10', 1500, 'manual', 'Gala sponsor.', null, null, '12:00'),
    ('gift:brightwater_summer',    'corp_brightwater', 7500, pg_temp.d(0), 'ach', 'stipends', 'summer', null, false, 'pending', 0, '10:00', null, null, 'Summer Works sponsorship for next summer: three warehouse-operations interns.', null, null, '15:30'),
    ('gift:tidewell_summer',       'corp_tidewell', 10000, pg_temp.d(-12), 'check', 'stipends', 'summer', null, false, 'sent', 2, '11:20', null, 'manual', 'First Summer Works sponsorship of the new drive; covers four stipends.', 'letter', 'priya', '12:00'),
    ('gift:tidewell_sw_prev',      'corp_tidewell', 7500, pg_temp.d(-150), 'check', 'stipends', 'auto', null, false, 'sent', 3, '11:20', null, 'manual', 'Summer Works sponsorship.', null, null, '12:00'),
    ('gift:tidewell_gala',         'corp_tidewell', 7500, pg_temp.d(-175), 'check', 'general', 'gala', null, false, 'sent', 3, '11:20', 1500, 'manual', 'Gala sponsor.', null, null, '12:00'),
    ('gift:tidewell_gala_prev',    'corp_tidewell', 5000, pg_temp.d(-560), 'check', 'general', 'auto', null, false, 'sent', 3, '11:20', null, 'manual', 'Gala sponsor.', null, null, '12:00'),
    ('gift:albright_gala',         'corp_albright', 7500, pg_temp.d(-195), 'check', 'general', 'gala', null, false, 'sent', 3, '11:20', 1500, 'manual', 'Gala table sponsor.', null, null, '12:00'),
    ('gift:albright_gala_prev',    'corp_albright', 5000, pg_temp.d(-565), 'check', 'general', 'auto', null, false, 'sent', 3, '11:20', 1500, 'manual', 'Gala table sponsor.', null, null, '12:00'),
    ('gift:corbettlim_gala',       'corp_corbettlim', 5000, pg_temp.d(-172), 'check', 'general', 'gala', null, false, 'sent', 3, '11:20', 1500, 'manual', 'Gala table sponsor.', null, null, '12:00'),
    ('gift:copperline_gala',       'corp_copperline', 5000, pg_temp.d(-170), 'check', 'general', 'gala', null, false, 'sent', 3, '11:20', null, 'manual', 'Gala sponsor.', null, null, '12:00'),
    ('gift:copperline_fall',       'corp_copperline', 2500, pg_temp.d(-50), 'check', 'pathways', 'auto', null, false, 'sent', 2, '11:20', null, 'manual', 'Tool allowance for the Cohort 7 trades fellows.', null, null, '12:00'),
    ('gift:mosaic_gala',           'corp_mosaic', 2500, pg_temp.d(-168), 'check', 'general', 'gala', null, false, 'sent', 3, '11:20', null, 'manual', 'Gala sponsor.', null, null, '12:00'),
    ('gift:juniper_gala',          'corp_juniper', 3000, pg_temp.d(-165), 'in_kind', 'general', 'gala', null, false, 'sent', 4, '11:20', null, 'manual', 'In-kind: dessert service for 320 gala guests (donor''s valuation).', null, null, '12:00'),
    ('gift:eastport_gala',         'corp_eastport', 2500, pg_temp.d(-168), 'check', 'general', 'gala', null, false, 'sent', 3, '11:20', null, 'manual', 'Gala sponsor.', null, null, '12:00'),
    ('gift:eastport_tools',        'corp_eastport', 1200, pg_temp.d(-88), 'in_kind', 'pathways', 'auto', null, false, 'sent', 3, '11:20', null, 'manual', 'In-kind: hand tools and tool belts for the trades cohort.', null, null, '12:00'),
    ('gift:anon_gala_match',       null, 60000, pg_temp.d(-165), 'ach', 'general', 'gala', 'gala_last', true, 'not_required', 0, '10:00', null, 'manual', 'Anonymous paddle-raise match: every paddle up to $60K was doubled.', null, null, '23:30'),
    -- ── Contacts who give ──
    ('gift:pc01_gala',             'pc01', 500, pg_temp.d(-165), 'card', 'general', 'gala', 'gala_last', false, 'sent', 3, '10:30', 300, 'stripe', 'Gala tickets (two).', null, null, '19:15'),
    ('gift:pc30_gt',               'pc30', 250, pg_temp.s3a_gt(extract(year from pg_temp.s3a_last_dec())::int), 'card', 'general', 'auto', 'gt_last', false, 'sent', 1, '10:00', null, 'stripe', null, null, null, '12:00'),
    ('gift:pc14_ye',               'pc14', 1000, pg_temp.s3a_last_dec() + 14, 'check', 'pathways', 'auto', 'ye_last', false, 'sent', 3, '10:00', null, 'manual', 'Personal year-end gift from Redline''s president.', null, null, '12:00'),
    ('gift:dup1_gala',             'dup1', 250, pg_temp.d(-165), 'card', 'general', 'gala', 'gala_last', false, 'sent', 3, '10:30', 150, 'stripe', 'Gala ticket bought at the door.', null, null, '21:00'),
    -- ── The last two weeks ──
    ('gift:d001_stock',            'd001', 5000, pg_temp.d(-1), 'stock', 'general', 'auto', null, false, 'pending', 0, '10:00', null, null, 'Appreciated stock (40 shares) transferred to our brokerage account. Letter receipt; no email on file.', null, null, '13:45'),
    ('gift:d002_check',            'd002', 2500, pg_temp.d(0), 'check', 'pathways', 'auto', null, false, 'pending', 0, '10:00', null, null, 'Check by mail with a note: "For the Pathways fellows."', null, null, '11:30'),
    ('gift:d299_first',            'd299', 1000, pg_temp.d(-2), 'card', 'pathways', 'auto', null, false, 'pending', 0, '10:00', null, null, 'First gift, a week after touring the Pathways IT lab.', null, null, '20:15'),
    ('gift:d060_recent',           'd060', 500, pg_temp.d(-2), 'card', 'general', 'auto', null, false, 'pending', 0, '10:00', null, 'stripe', null, null, null, '09:55'),
    ('gift:d200_recent',           'd200', 250, pg_temp.d(-1), 'card', 'general', 'auto', null, false, 'pending', 0, '10:00', null, 'stripe', 'Up from $50 last year.', null, null, '19:40'),
    ('gift:d300_first',            'd300', 150, pg_temp.d(0), 'card', 'general', 'auto', null, false, 'pending', 0, '10:00', null, 'stripe', 'First gift, online.', null, null, '07:05'),
    ('gift:d003_recent',           'd003', 1000, pg_temp.d(-13), 'check', 'general', 'auto', null, false, 'sent', 1, '10:40', null, 'manual', null, 'call', 'priya', '12:00'),
    ('gift:d120_recent',           'd120', 300, pg_temp.d(-11), 'card', 'general', 'auto', null, false, 'sent', 1, '15:10', null, 'stripe', null, 'email', 'jordan', '12:00'),
    ('gift:mt10_recent',           'mt10', 100, pg_temp.d(-8), 'card', 'general', 'auto', null, false, 'sent', 8, '08:20', null, 'stripe', 'Mentor''s first gift.', 'email', 'jordan', '12:00')
  )
  select v.gkey, v.con, v.amount, v.gdate, v.method, v.fund,
    case v.camp when 'auto' then pg_temp.s3a_camp(v.gdate) when 'gala' then pg_temp.s3a_camp_id('camp:gala')
                when 'summer' then pg_temp.s3a_camp_id('camp:summer') end,
    case when v.ev is not null then pg_temp.s3a_appeal(v.ev, v.gdate, v.paddle) end,
    null::text, v.ack,
    case when v.ack = 'sent' then least(pg_temp.s3a_at(v.gdate + v.lag, v.hhmi), pg_temp.ts(0, '08:20')) end,
    v.chan, v.by, v.fmv, v.src, v.notes,
    pg_temp.s3a_at(v.gdate, v.chhmi), v.ev
  from v $$;

-- Monthly gifts, one per charge, plus a few year-end extras from monthly donors.
create or replace function pg_temp.s3a_monthly_gifts() returns table(
    gkey text, con text, amount numeric, gift_date date, method text, fund text, campaign_id uuid, appeal_id uuid,
    recurring_key text, ack_status text, ack_at timestamptz, ack_channel text, ack_by text, fmv numeric, src text,
    notes text, created_at timestamptz, ev text)
  language sql stable as $$
  select 'gift:m:' || m.k || ':' || s.j, m.k, m.amount, (m.last_charge - make_interval(months => s.j))::date,
    case when m.src = 'manual' then 'check' else 'card' end, 'general',
    pg_temp.s3a_camp((m.last_charge - make_interval(months => s.j))::date),
    pg_temp.s3a_appeal('monthly', (m.last_charge - make_interval(months => s.j))::date),
    m.k,
    case when s.j = m.months - 1 then 'sent' else 'not_required' end,
    case when s.j = m.months - 1 then pg_temp.s3a_at((m.last_charge - make_interval(months => s.j))::date + 1, '10:15') end,
    case when s.j = m.months - 1 then 'email' end, case when s.j = m.months - 1 then 'jordan' end,
    null::numeric, m.src,
    case when s.j = m.months - 1 then 'First monthly gift.' end,
    pg_temp.s3a_at((m.last_charge - make_interval(months => s.j))::date, '06:00'), 'monthly'
  from pg_temp.s3a_monthly() m cross join lateral generate_series(0, m.months - 1) s(j)
  union all
  select 'gift:mx:' || m.k || ':ye', m.k, (array[100, 150, 250])[1 + m.n % 3]::numeric,
    pg_temp.s3a_last_dec() + 10 + m.n % 18, 'card', 'general',
    pg_temp.s3a_camp(pg_temp.s3a_last_dec() + 10 + m.n % 18),
    pg_temp.s3a_appeal('ye_last', pg_temp.s3a_last_dec() + 10 + m.n % 18),
    null::text, 'sent', pg_temp.s3a_at(pg_temp.s3a_last_dec() + 12 + m.n % 18, '10:30'), 'email', 'jordan', null::numeric, 'stripe',
    'Year-end gift on top of the monthly plan.', pg_temp.s3a_at(pg_temp.s3a_last_dec() + 10 + m.n % 18, '12:00'), 'ye_last'
  from pg_temp.s3a_monthly() m
  where m.n % 4 = 0 and (m.last_charge - make_interval(months => m.months - 1))::date < pg_temp.s3a_last_dec()
    and m.last_charge > pg_temp.s3a_last_dec() and pg_temp.s3a_last_dec() + 10 + m.n % 18 <= pg_temp.d(-15) $$;

-- Mentor gifts (small, at year-end) and the employer matches they unlock.
create or replace function pg_temp.s3a_mentor_gifts() returns table(
    gkey text, con text, amount numeric, gift_date date, method text, fund text, campaign_id uuid, appeal_id uuid,
    recurring_key text, ack_status text, ack_at timestamptz, ack_channel text, ack_by text, fmv numeric, src text,
    notes text, created_at timestamptz, ev text)
  language sql stable as $$
  with mg as (
    select t.k, t.n, t.employer, case when t.n % 2 = 0 then 'gt_last' else 'ye_last' end as ev,
      case when t.n % 2 = 0 then pg_temp.s3a_gt(extract(year from pg_temp.s3a_last_dec())::int)
           else pg_temp.s3a_last_dec() + 8 + t.n % 20 end as gdate,
      (array[50, 100, 100, 150, 250])[1 + t.n % 5]::numeric as amount
    from pg_temp.s3a_mentors() t
    where t.status in ('Matched', 'Alumni mentor')
      and (t.n in (3, 5, 8, 20, 21, 22) or pg_temp.rnd('s3a:mtgift:' || t.k) < .35)
      and t.since < -330)
  select 'gift:mt:' || mg.k, mg.k, mg.amount, mg.gdate, 'card', 'general', pg_temp.s3a_camp(mg.gdate),
    pg_temp.s3a_appeal(mg.ev, mg.gdate), null::text, 'sent', pg_temp.s3a_at(mg.gdate + 2, '10:20'), 'email', 'jordan', null::numeric, 'stripe',
    null::text, pg_temp.s3a_at(mg.gdate, '12:00'), mg.ev
  from mg where mg.gdate <= pg_temp.d(-15)
  union all
  select 'gift:match:' || mg.k, mg.employer, mg.amount, least(pg_temp.s3a_last_dec() + 75, pg_temp.d(-16)), 'ach', 'general',
    pg_temp.s3a_camp(least(pg_temp.s3a_last_dec() + 75, pg_temp.d(-16))), null::uuid, null::text, 'sent',
    pg_temp.s3a_at(least(pg_temp.s3a_last_dec() + 75, pg_temp.d(-16)) + 3, '11:00'), 'email', 'jordan', null::numeric, 'manual',
    'Employee matching gift for ' || c.first_name || ' ' || c.last_name || '''s year-end gift.',
    pg_temp.s3a_at(least(pg_temp.s3a_last_dec() + 75, pg_temp.d(-16)), '12:00'), 'match'
  from mg join public.constituents c on c.id = pg_temp.nb_id('con:' || mg.k)
  where mg.n in (3, 5, 8, 20, 21, 22) and mg.gdate <= pg_temp.d(-15) $$;

-- Paid pledge installments that are not hand-placed above.
create or replace function pg_temp.s3a_pledge_gifts() returns table(
    gkey text, con text, amount numeric, gift_date date, method text, fund text, campaign_id uuid, appeal_id uuid,
    recurring_key text, ack_status text, ack_at timestamptz, ack_channel text, ack_by text, fmv numeric, src text,
    notes text, created_at timestamptz, ev text)
  language sql stable as $$
  select s.gkey, p.con, s.amount, s.due + 1 + s.seq % 3, case when p.k = 'd007' then 'card' else 'check' end, p.fund,
    pg_temp.s3a_camp(s.due + 1 + s.seq % 3), null::uuid, null::text, 'sent',
    pg_temp.s3a_at(s.due + 3 + s.seq % 3, '10:50'), case when s.amount >= 1000 then 'letter' else 'email' end,
    case when s.amount >= 1000 then 'priya' else 'jordan' end, null::numeric, 'pledge',
    'Pledge installment ' || s.seq || ' of ' || p.n || '.', pg_temp.s3a_at(s.due + 1 + s.seq % 3, '12:00'), 'pledge'
  from pg_temp.s3a_pledge_sched() s join pg_temp.s3a_pledges() p on p.k = s.pk
  where s.gkey like 'gift:pl:%' $$;

-- Bulk donors in the common shape.
create or replace function pg_temp.s3a_bulk_gifts_c() returns table(
    gkey text, con text, amount numeric, gift_date date, method text, fund text, campaign_id uuid, appeal_id uuid,
    recurring_key text, ack_status text, ack_at timestamptz, ack_channel text, ack_by text, fmv numeric, src text,
    notes text, created_at timestamptz, ev text)
  language sql stable as $$
  select b.gkey, b.k, b.amount, b.gift_date, b.method, b.fund, b.campaign_id, b.appeal_id, null::text, 'sent', b.ack_at,
    null::text, null::text, b.fmv, b.src, b.note, b.created_at, b.ev
  from pg_temp.s3a_bulk_gifts() b $$;

create or replace function pg_temp.s3a_all_gifts() returns table(
    gkey text, con text, amount numeric, gift_date date, method text, fund text, campaign_id uuid, appeal_id uuid,
    recurring_key text, ack_status text, ack_at timestamptz, ack_channel text, ack_by text, fmv numeric, src text,
    notes text, created_at timestamptz, ev text)
  language sql stable as $$
  select * from pg_temp.s3a_named_gifts()
  union all select * from pg_temp.s3a_monthly_gifts()
  union all select * from pg_temp.s3a_mentor_gifts()
  union all select * from pg_temp.s3a_pledge_gifts()
  union all select * from pg_temp.s3a_bulk_gifts_c() $$;

insert into public.gifts
  (id, org_id, constituent_id, amount, gift_date, method, deductible_amount, fair_market_value, campaign_id, fund_id,
   appeal_id, recurring_plan_id, external_source, external_id, acknowledgment_status, acknowledged_at, notes,
   created_at, updated_at)
select pg_temp.nb_id(g.gkey), pg_temp.nb_org(),
  case when g.con is not null then pg_temp.nb_id('con:' || g.con) end,
  g.amount, g.gift_date, g.method,
  case when g.fmv is not null then g.amount - g.fmv end, g.fmv,
  g.campaign_id, pg_temp.nb_id('fund:' || g.fund), g.appeal_id,
  case when g.recurring_key is not null then pg_temp.nb_id('rp:' || g.recurring_key) end,
  g.src, null, g.ack_status, g.ack_at, g.notes,
  g.created_at, coalesce(g.ack_at, g.created_at)
from pg_temp.s3a_all_gifts() g
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 11. Pledge payments
-- ════════════════════════════════════════════════════════════════════════════
insert into public.pledge_payments (id, org_id, pledge_id, due_date, expected_amount, status, gift_id, paid_at, created_at)
select pg_temp.nb_id('pp:' || s.pk || ':' || s.seq), pg_temp.nb_org(), pg_temp.nb_id('pledge:' || s.pk), s.due, s.amount, s.status,
  case when s.gkey is not null then pg_temp.nb_id(s.gkey) end,
  case when s.gkey is not null then g.created_at end,
  pg_temp.ts(p.since, '15:12')
from pg_temp.s3a_pledge_sched() s
join pg_temp.s3a_pledges() p on p.k = s.pk
left join public.gifts g on g.id = pg_temp.nb_id(s.gkey)
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 12. Soft credits
-- ════════════════════════════════════════════════════════════════════════════
insert into public.soft_credits (id, org_id, gift_id, constituent_id, type, amount, created_at)
select pg_temp.nb_id('sc:' || x.gkey || ':' || x.who), pg_temp.nb_org(), pg_temp.nb_id(x.gkey), pg_temp.nb_id('con:' || x.who),
       x.type, x.amount, x.created_at
from (
  -- household partners
  select g.gkey, 'sp' || substr(g.con, 2) as who, 'household' as type, g.amount, g.created_at
  from pg_temp.s3a_all_gifts() g join pg_temp.s3a_bulk() b on b.k = g.con
  where b.hh and g.amount >= 100
  union all
  select g.gkey, 'chen_david', 'household', g.amount, g.created_at from pg_temp.s3a_all_gifts() g where g.con = 'chen_margaret'
  union all
  select g.gkey, 'alvarez_elena', 'household', g.amount, g.created_at from pg_temp.s3a_all_gifts() g where g.con = 'alvarez_ricardo'
  union all
  -- DAF advisor
  select g.gkey, case when g.gkey = 'gift:nakamura_fy' then 'bd_nakamura' else 'goldberg' end, 'daf_advisor', g.amount, g.created_at
  from pg_temp.s3a_all_gifts() g where g.con = 'legacy_daf'
  union all
  -- board solicitors
  select g.gkey, v.who, 'solicitor', g.amount, g.created_at
  from pg_temp.s3a_all_gifts() g
  join (values ('gift:pacific_summit', 'bd_osei'), ('gift:psb_prev', 'bd_osei'), ('gift:kinetic_1', 'bd_nakamura'),
               ('gift:kinetic_prev', 'bd_nakamura'), ('gift:kinetic_first', 'bd_nakamura'), ('gift:bell_ye_last', 'bd_harrington'),
               ('gift:okafor_last', 'bd_osei'), ('gift:harborlight_gala', 'bd_harrington')) v(gk, who) on v.gk = g.gkey
  union all
  -- employer matches credit the employee
  select g.gkey, substr(g.gkey, length('gift:match:') + 1), 'match_originator', g.amount, g.created_at
  from pg_temp.s3a_all_gifts() g where g.gkey like 'gift:match:%'
) x
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 13. Relationships (board ↔ company, PO ↔ foundation, contacts ↔ employers,
--     households, warm paths)
-- ════════════════════════════════════════════════════════════════════════════
insert into public.relationships (id, org_id, a_id, b_id, kind, notes, created_at)
select pg_temp.nb_id('rel:' || r.k), pg_temp.nb_org(), pg_temp.nb_id('con:' || r.a), pg_temp.nb_id('con:' || r.b), r.kind, r.notes,
       pg_temp.ts(r.since, '10:00')
from (values
  ('osei_psb',          'bd_osei',         'pacific_summit',  'employer',     'SVP, Commercial Banking. Champions the Summer Works sponsorship inside the bank.', -1500),
  ('jackson_harbor',    'bd_jackson',      'harbor',          'employer',     'VP, Community Health. Opened the clinical placements for the healthcare track.', -900),
  ('nakamura_kinetic',  'bd_nakamura',     'kinetic',         'board_contact','Introduced Kinetic Labs; close with their CTO. Mentors two fellows himself.', -700),
  ('lim_corbett',       'bd_lim',          'corp_corbettlim', 'employer',     'Partner at the firm.', -420),
  ('ramos_albright',    'bd_ramos',        'corp_albright',   'knows',        'Co-counsel on our pro bono internship agreements.', -540),
  ('patel_nakamura',    'bd_patel',        'bd_nakamura',     'knows',        'Came to the gala as Ken''s guest; Ken recruited him to the board.', -165),
  ('harrington_bell',   'bd_harrington',   'bell',            'knows',        'Neighbors in Crocker Highlands; Celeste introduced Sarah to Northbridge.', -2000),
  ('harrington_seq',    'bd_harrington',   'po_sequoia',      'knows',        'Served on a museum board together; Celeste made the Sequoia introduction.', -36),
  ('wu_nakamura',       'wu',              'bd_nakamura',     'knows',        'Former colleagues. Ken is the warm path into the ask meeting.', -118),
  ('okafor_osei',       'okafor',          'bd_osei',         'knows',        'Banking colleagues for a decade; Daniel brought Nnamdi to his first gala.', -1000),
  ('goldberg_daf',      'goldberg',        'legacy_daf',      'daf_advisor',  'Recommends grants from the Goldberg family giving account.', -1400),
  ('nakamura_daf',      'bd_nakamura',     'legacy_daf',      'daf_advisor',  'Gives his annual board gift through a donor-advised fund at Bay Legacy.', -400),
  ('chen_spouse',       'chen_margaret',   'chen_david',      'spouse',       null, -1800),
  ('alvarez_spouse',    'alvarez_ricardo', 'alvarez_elena',   'spouse',       null, -770),
  ('po_bayview',        'po_bayview',      'bayview',         'employer',     'Senior Program Officer, Economic Mobility.', -1000),
  ('po_hollis',         'po_hollis',       'hollis',          'employer',     'Trustee and program lead.', -700),
  ('po_meridian',       'po_meridian',     'meridian',        'employer',     'Program Director, Youth Opportunity.', -200),
  ('po_sequoia',        'po_sequoia',      'sequoia',         'employer',     'Executive Director.', -35),
  ('po_eastshore',      'po_eastshore',    'eastshore_wdb',   'employer',     'Contract Manager for the Pathways cost-reimbursement contract.', -365),
  ('reed_freeman',      'pc23',            'bd_freeman',      'knows',        'Worked together at Eastlake for eight years.', -1500),
  ('coleman_freeman',   'pc25',            'bd_freeman',      'knows',        'Dr. Freeman mentored Nia when she was a first-year principal.', -800),
  ('ruiz_alvarez',      'pc28',            'alvarez_ricardo', 'knows',        'Fruitvale neighbors; Hector introduced Ricardo to Northbridge.', -770),
  ('hollis_family',     'pc16',            'po_hollis',       'family',       'Martin''s aunt and a founding trustee.', -500),
  ('elena_mentor',      'alvarez_elena',   'pc28',            'knows',        'Her Mentor Circle meets at the Fruitvale Hub.', -300)
) r(k, a, b, kind, notes, since)
on conflict do nothing;

-- Contacts → the organizations they work for.
insert into public.relationships (id, org_id, a_id, b_id, kind, notes, created_at)
select pg_temp.nb_id('rel:emp:' || v.k), pg_temp.nb_org(), c.id, pg_temp.nb_id('con:' || v.org), 'employer',
       split_part(c.notes, '. ', 1) || '.', c.created_at
from (values
  ('pc01','pacific_summit'),('pc02','pacific_summit'),('pc03','pacific_summit'),('pc04','pacific_summit'),
  ('pc05','kinetic'),('pc06','kinetic'),('pc07','kinetic'),('pc08','kinetic'),
  ('pc09','harbor'),('pc10','harbor'),('pc11','harbor'),('pc12','redline'),('pc13','redline'),('pc14','redline'),
  ('pc15','bayview'),('pc16','hollis'),('pc17','cypress'),('pc18','eastbay'),('pc19','ca_yoi'),('pc20','alder'),
  ('pc21','meridian'),('pc22','sequoia'),('pc29','corp_brightwater'),('pc30','corp_tidewell'),('pc31','corp_copperline'),
  ('pc32','corp_harborlight'),('pc33','corp_mosaic'),('pc34','corp_juniper'),('pc35','corp_quillfeather')
) v(k, org)
join public.constituents c on c.id = pg_temp.nb_id('con:' || v.k)
on conflict do nothing;

-- Mentors → employers (Kinetic's twelve, plus bank, health system, and local firms).
insert into public.relationships (id, org_id, a_id, b_id, kind, notes, created_at)
select pg_temp.nb_id('rel:mt:' || t.k), pg_temp.nb_org(), pg_temp.nb_id('con:' || t.k), pg_temp.nb_id('con:' || t.employer), 'employer',
       case when t.employer = 'kinetic' then 'Kinetic Labs employee mentor (volunteer program).' else 'Employee; volunteers as a Northbridge mentor.' end,
       pg_temp.ts(t.since, '18:20')
from pg_temp.s3a_mentors() t where t.employer is not null
on conflict do nothing;

-- Household partners.
insert into public.relationships (id, org_id, a_id, b_id, kind, notes, created_at)
select pg_temp.nb_id('rel:sp:' || b.k), pg_temp.nb_org(), pg_temp.nb_id('con:' || b.k), pg_temp.nb_id('con:sp' || substr(b.k, 2)), 'spouse', null,
       c.created_at
from pg_temp.s3a_bulk() b join public.constituents c on c.id = pg_temp.nb_id('con:' || b.k)
where b.hh
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 14. Thank-you templates and the stewardship matrix
-- ════════════════════════════════════════════════════════════════════════════
insert into public.ack_templates (id, org_id, name, subject_type, channel, subject, body, is_default, applies_when, created_at, updated_at)
select pg_temp.nb_id('tpl:' || t.k), pg_temp.nb_org(), t.n, t.st, t.ch, t.subj, t.body, t.def, t.aw::jsonb,
       pg_temp.ts(t.since, '11:00'), pg_temp.ts(t.upd, '15:20')
from (values
  ('gift_email', 'Gift thank-you (email)', 'gift', 'email', 'Thank you, {{first_name}}',
   E'Dear {{first_name}},\n\nThank you for your gift to Northbridge. It goes straight to work: stipends for Summer Works interns, certification exam fees for Pathways fellows, and after-school support at three Oakland high schools.\n\nIf you ever want to see it up close, reply to this email and we will set up a visit.\n\nWith gratitude,\nJordan Ellis\nDevelopment & Events Associate',
   true, null, -400, -60),
  ('first_gift_email', 'First gift welcome (email)', 'gift', 'email', 'Welcome to Northbridge, {{first_name}}',
   E'Dear {{first_name}},\n\nYour first gift to Northbridge just arrived, and I wanted you to hear about it from a person. Thank you.\n\nHere is what you are now part of: about 280 young people in Launchpad, Pathways, and Summer Works this year, most of them the first in their family to hold a salaried job.\n\nOver the next few weeks you will hear from a few of them. Reply anytime; a real person reads every email.\n\nWarmly,\nJordan Ellis',
   false, '{"first_gift": true}', -400, -6),
  ('yearend_email', 'Year-end thank-you (email)', 'gift', 'email', 'Thank you for ending the year with us, {{first_name}}',
   E'Dear {{first_name}},\n\nThank you for your year-end gift. Because of you, Northbridge starts the new year ready to place more young people in paid internships and first jobs.\n\nOne example: Amara Johnson finished Pathways in June and now works the IT help desk at Kinetic Labs at $28 an hour. Gifts like yours paid for her certification exam.\n\nWith gratitude,\nRemi Sobomehin\nExecutive Director',
   false, '{"campaign":"year-end"}', -350, -20),
  ('gala_email', 'Gala thank-you (email)', 'gift', 'email', 'Thank you for Northbridge Rising',
   E'Dear {{first_name}},\n\nThank you for joining us at Northbridge Rising and for your generosity in the room. Together the night raised more than our goal, and every dollar of the paddle raise goes to Summer Works stipends.\n\nWe will send photos and the full results next week.\n\nWith gratitude,\nJordan Ellis',
   false, '{"campaign":"gala"}', -200, -170),
  ('gift_letter', 'Gift thank-you letter', 'gift', 'letter', null,
   E'Dear {{first_name}},\n\nThank you for your generous gift to Northbridge Youth Alliance. This year your support helps about 280 Oakland young people build real careers: after-school career exploration at three high schools, seven-week paid internships, and industry certifications with a job at the end.\n\nWe are grateful to have you with us.\n\nWith gratitude,\nPriya Natarajan\nDirector of Development',
   true, null, -400, -90),
  ('major_letter', 'Major gift letter from Remi', 'gift', 'letter', null,
   E'Dear {{first_name}},\n\nThank you. A gift of this size changes what we can promise young people in Oakland next year, and I did not want it to go by without a note from me.\n\nI would love to show you where it goes. The Pathways healthcare lab and the Launchpad room at Eastlake are both open to you anytime.\n\nWith deep gratitude,\nRemi Sobomehin\nExecutive Director',
   false, '{"min_amount":10000}', -380, -100),
  ('call_script', 'Thank-you call script', 'gift', 'call', null,
   'Call {{first_name}} to say thank you. Lead with gratitude, name one specific thing the gift pays for this month, ask what drew them to give, and listen. Log the call and anything worth following up on.',
   true, null, -400, -120),
  ('major_call', 'Major gift call (Remi)', 'gift', 'call', null,
   'A gift this size gets a call from Remi within a day, before the letter. Thank {{first_name}} by name, share one fellow''s story that this gift touches, and offer a visit. Note anything they say about what they want to hear back.',
   false, '{"min_amount":10000}', -380, -100),
  ('daf_letter', 'DAF grant acknowledgment', 'gift', 'letter', null,
   E'Dear {{first_name}},\n\nThank you for recommending a grant to Northbridge Youth Alliance from your donor-advised fund. The grant has arrived, and we have sent the sponsoring fund our confirmation.\n\nBecause the gift came through your fund, this letter is a thank-you rather than a tax receipt. It is no less heartfelt.\n\nWith gratitude,\nRemi Sobomehin',
   false, '{"daf": true}', -300, -40),
  ('mentor_thanks', 'Mentor thank-you', 'volunteer', 'email', 'Thank you for showing up, {{first_name}}',
   E'Dear {{first_name}},\n\nThank you for mentoring this year. Your mentee may not say it, but showing up every month is the thing they will remember.\n\nSee you at the next circle.\n\nSimone Baptiste\nYouth Engagement Coordinator',
   true, null, -300, -45),
  ('anniversary', 'Giving anniversary note', 'milestone', 'email', 'One year of giving, {{first_name}}',
   E'Dear {{first_name}},\n\nA year ago today you made your first gift to Northbridge. Since then, 85 young people finished paid summer internships and Cohort 6 graduated from Pathways. Thank you for a year of showing up for them.\n\nJordan Ellis',
   true, null, -250, -30),
  ('donor_note', 'Donor note (no gift)', 'constituent', 'letter', null,
   E'Dear {{first_name}},\n\nThank you for the time you gave Northbridge this week. It matters as much as any check.\n\nWarmly,\nRemi',
   true, null, -250, -44)
) t(k, n, st, ch, subj, body, def, aw, since, upd)
on conflict do nothing;

-- First match wins (rank order); 'escalate' rules add a task on top of the
-- primary one. No rule auto-sends anything.
insert into public.stewardship_rules (id, org_id, name, rank, conditions, action, channel, template_id, sla_hours, assignee, active, created_at, updated_at)
select pg_temp.nb_id('srule:' || r.k), pg_temp.nb_org(), r.n, r.rk, r.cond::jsonb, r.act, r.ch,
       case when r.tpl is null then null else pg_temp.nb_id('tpl:' || r.tpl) end, r.sla, r.who, r.active,
       pg_temp.ts(-380, '11:30'), pg_temp.ts(r.upd, '11:30')
from (values
  ('imports',  'Imported history: no thank-you needed',               5,   '{"sources":["import"]}',                    'none',                  'email',  null,          48,  null,     true,  -380),
  ('monthly',  'Monthly gifts: covered by the January giving summary', 10,  '{"recurring":true}',                        'none',                  'email',  null,          48,  null,     true,  -380),
  ('first',    'First gift: welcome call within 48 hours',             20,  '{"first_gift":true,"max_age_days":30}',     'create_task_and_draft', 'call',   'call_script', 48,  'jordan', true,  -200),
  ('inkind',   'In-kind gift: letter describing the gift',             30,  '{"methods":["in_kind"],"max_age_days":30}', 'create_task',           'letter', 'gift_letter', 72,  'jordan', true,  -380),
  ('k1',       'Gift $1,000 and up: personal letter from Priya',       40,  '{"min_amount":1000,"max_age_days":30}',     'create_task_and_draft', 'letter', 'gift_letter', 48,  'priya',  true,  -150),
  ('irs',      'Gift $250 and up: thank-you email with receipt',       50,  '{"min_amount":250,"max_age_days":30}',      'create_task',           'email',  'gift_email',  48,  'jordan', true,  -380),
  ('small',    'Smaller recent gift: thank-you email within a week',   60,  '{"min_amount":0.01,"max_age_days":30}',     'create_task',           'email',  'gift_email',  168, 'jordan', true,  -380),
  ('major',    'Major gift: personal call from Remi',                  900, '{"min_amount":10000,"max_age_days":30}',    'escalate',              'call',   'major_call',  24,  'remi',   true,  -150)
) r(k, n, rk, cond, act, ch, tpl, sla, who, active, upd)
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 15. Acknowledgments (one per thanked gift; majors also get Remi's letter)
-- ════════════════════════════════════════════════════════════════════════════
insert into public.acknowledgments
  (id, org_id, gift_id, template, channel, subject, body, sent_by, sent_at, created_at, subject_type, subject_id, subject_label)
select pg_temp.nb_id('ack:' || g.gkey), pg_temp.nb_org(), pg_temp.nb_id(g.gkey),
  case when x.ch = 'email' then 'receipt-v1' else 'manual' end,
  x.ch,
  case when x.ch = 'email' then
    case when g.ev = 'monthly' then 'Welcome to the Monthly Giving Circle'
         else 'Thank you, ' || coalesce(c.first_name, c.org_name) end end,
  case when x.ch = 'email' then
    'Dear ' || coalesce(c.first_name, c.org_name) || E',\n\n' ||
    case when g.ev = 'monthly' then 'Welcome to the Monthly Giving Circle. Your monthly gift is the steady money that keeps Launchpad open every afternoon, all year.'
         when g.ev like 'ye%' then 'Thank you for your year-end gift. Because of you, Northbridge starts the new year ready to place more young people in paid internships and first jobs.'
         when g.ev like 'gt%' then 'Thank you for giving on GivingTuesday. Our board matched every gift that day, so yours went twice as far.'
         when g.ev like 'spring%' then 'Thank you for answering our spring appeal. Your gift helps put a teenager to work this summer, with a real paycheck and a supervisor who shows up.'
         when g.ev like 'gala%' then 'Thank you for joining us at Northbridge Rising and for your generosity in the room.'
         when g.ev = 'match' then 'Thank you for matching your employee''s gift. Partnerships like this are how Northbridge stays steady.'
         else 'Thank you for your gift. It goes straight to work: stipends for Summer Works interns, certification exams for Pathways fellows, and after-school support at three Oakland high schools.' end ||
    E'\n\nWith gratitude,\n' ||
    case x.who when 'remi' then E'Remi Sobomehin\nExecutive Director' when 'priya' then E'Priya Natarajan\nDirector of Development'
               else E'Jordan Ellis\nDevelopment & Events Associate' end ||
    E'\n\nGift amount: ' || to_char(g.amount, 'FM$999,999,990.00') ||
    E'\nDate received: ' || to_char(g.gift_date, 'FMMonth FMDD, YYYY') ||
    case when g.fmv is not null then
      E'\nIn exchange for this contribution, you received goods or services with an estimated fair market value of ' || to_char(g.fmv, 'FM$999,999,990.00') ||
      E'.\nThe tax-deductible portion of your contribution is limited to ' || to_char(g.amount - g.fmv, 'FM$999,999,990.00') || '.'
    else E'\nNo goods or services were provided in exchange for this contribution.' end ||
    E'\nNorthbridge Youth Alliance is a 501(c)(3) nonprofit organization. Please retain this letter as your receipt for tax purposes.'
  else
    case x.ch
      when 'call' then pg_temp.pick(array[
        'Called to say thank you; they picked up and we talked for ten minutes about the fellows.',
        'Called to thank them personally. Left a warm voicemail and followed with the receipt letter.',
        'Thank-you call. Asked what drew them to give; wants to visit Pathways in the spring.',
        'Called to thank them; they asked for a copy of the Summer Works recap.'], 's3a:ackcall:' || g.gkey)
      when 'letter' then case when g.con = 'legacy_daf' then 'Grant confirmation letter to Bay Legacy Giving Fund, plus a personal note to ' || case when g.gkey = 'gift:nakamura_fy' then 'Ken' else 'Aaron' end || ' (no tax receipt for DAF grants).'
                              when g.method = 'in_kind' then 'Letter describing the in-kind gift (no dollar value stated, per IRS rules).'
                              else 'Handwritten letter with the receipt enclosed.' end
      when 'text' then 'Texted a thank-you with a photo from the Cohort 7 lab, then mailed the receipt.'
      else 'Thanked in person, receipt mailed the same day.' end
  end,
  x.who, g.ack_at, g.ack_at, 'gift', pg_temp.nb_id(g.gkey),
  coalesce(c.org_name, c.first_name || ' ' || c.last_name)
from pg_temp.s3a_all_gifts() g
join public.constituents c on c.id = pg_temp.nb_id('con:' || g.con)
cross join lateral (select
    coalesce(g.ack_channel, case when g.con = 'legacy_daf' then 'letter'
                                 when g.amount >= 10000 then 'call'
                                 when g.amount >= 1000 then coalesce(c.preferred_ack_channel, 'letter')
                                 else 'email' end) as ch,
    coalesce(g.ack_by, case when g.amount >= 10000 then 'remi' when g.amount >= 1000 then 'priya' else 'jordan' end) as who) x
where g.ack_status = 'sent'
on conflict do nothing;

-- The letter that follows a major-gift call.
insert into public.acknowledgments
  (id, org_id, gift_id, template, channel, subject, body, sent_by, sent_at, created_at, subject_type, subject_id, subject_label)
select pg_temp.nb_id('ack2:' || g.gkey), pg_temp.nb_org(), pg_temp.nb_id(g.gkey), 'manual', 'letter', null,
       'Personal letter from Remi with the receipt enclosed.', 'remi',
       least(g.ack_at + interval '1 day', pg_temp.ts(-1, '15:00')), least(g.ack_at + interval '1 day', pg_temp.ts(-1, '15:00')),
       'gift', pg_temp.nb_id(g.gkey), coalesce(c.org_name, c.first_name || ' ' || c.last_name)
from pg_temp.s3a_all_gifts() g
join public.constituents c on c.id = pg_temp.nb_id('con:' || g.con)
where g.ack_status = 'sent' and g.amount >= 10000 and g.ack_channel is null and g.con <> 'legacy_daf'
on conflict do nothing;

-- Thank-yous that are not about a gift: time, introductions, mentoring, anniversaries.
insert into public.acknowledgments
  (id, org_id, gift_id, template, channel, subject, body, sent_by, sent_at, created_at, subject_type, subject_id, subject_label)
select pg_temp.nb_id('ackn:' || a.k), pg_temp.nb_org(), null, 'non-gift', a.ch, null, a.body, a.by,
       pg_temp.ts(a.day, a.hhmi), pg_temp.ts(a.day, a.hhmi), a.st, c.id, coalesce(c.org_name, c.first_name || ' ' || c.last_name)
from (values
  ('harrington_board', 'bd_harrington', 'constituent', 'letter',    'remi',   -43, '16:10', 'Note after the board meeting: thank you for chairing a long agenda with grace.'),
  ('nakamura_patel',   'bd_nakamura',   'constituent', 'letter',    'remi',   -90, '15:00', 'Thank-you note for recruiting Ravi Patel to the board.'),
  ('patel_orient',     'bd_patel',      'constituent', 'email',     'remi',   -94, '18:30', 'Thanks for two hours at orientation; packet and bylaws attached.'),
  ('wu_tour',          'wu',            'constituent', 'letter',    'remi',   -29, '14:00', 'Handwritten note after the Pathways healthcare lab tour.'),
  ('lim_audit',        'bd_lim',        'constituent', 'email',     'kwame',  -32, '17:45', 'Thanked Grace for an extra Saturday on the audit schedule.'),
  ('freeman_site',     'bd_freeman',    'constituent', 'letter',    'miguel', -26, '16:30', 'Thank-you card from the Eastlake Launchpad cohort, signed by the students.'),
  ('jackson_tour',     'bd_jackson',    'constituent', 'call',      'priya',  -46, '12:15', 'Called to thank Monique for walking the cohort through the clinical rotation.'),
  ('brooks_panel',     'bd_brooks',     'constituent', 'text',      'andre',  -26, '21:05', 'Texted thanks for speaking on the alumni panel at Cohort 8 info night.'),
  ('osei_showcase',    'bd_osei',       'constituent', 'letter',    'simone', -116, '11:00', 'Thank-you letter from the eight Summer Works interns at the bank.'),
  ('ruiz_venue',       'pc28',          'constituent', 'letter',    'simone', -40, '10:30', 'Thank-you for hosting Mentor Circles all year.'),
  ('sato_mentors',     'pc07',          'volunteer',   'email',     'simone', -33, '09:15', 'Thanks for recruiting four new Kinetic mentors this fall.'),
  ('elena_mentor',     'alvarez_elena', 'volunteer',   'in_person', 'simone', -33, '19:30', 'Thanked her in person at the Mentor Circle; her mentee got into the Laney culinary program.')
) a(k, con, st, ch, by, day, hhmi, body)
join public.constituents c on c.id = pg_temp.nb_id('con:' || a.con)
on conflict do nothing;

-- Mentor thank-yous and giving anniversaries (generated).
insert into public.acknowledgments
  (id, org_id, gift_id, template, channel, subject, body, sent_by, sent_at, created_at, subject_type, subject_id, subject_label)
select pg_temp.nb_id('ackn:mt:' || t.k), pg_temp.nb_org(), null, 'non-gift', 'email', null,
       'Mentor thank-you at the end of the spring circle.', 'simone',
       pg_temp.s3a_at(pg_temp.s3a_spring() + 75, '17:00'), pg_temp.s3a_at(pg_temp.s3a_spring() + 75, '17:00'),
       'volunteer', pg_temp.nb_id('con:' || t.k), t.fn || ' ' || t.ln
from pg_temp.s3a_mentors() t
where t.status in ('Matched', 'Alumni mentor') and t.since < -230
on conflict do nothing;

insert into public.acknowledgments
  (id, org_id, gift_id, template, channel, subject, body, sent_by, sent_at, created_at, subject_type, subject_id, subject_label)
select pg_temp.nb_id('ackn:anniv:' || m.k), pg_temp.nb_org(), null, 'non-gift', 'email', null,
       'One-year giving anniversary note.', 'jordan',
       pg_temp.s3a_at((m.last_charge - make_interval(months => m.months - 13))::date, '09:30'),
       pg_temp.s3a_at((m.last_charge - make_interval(months => m.months - 13))::date, '09:30'),
       'milestone', pg_temp.nb_id('con:' || m.k), m.fn || ' ' || m.ln
from pg_temp.s3a_monthly() m
where m.months >= 13 and m.status = 'active'
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 16. Interactions — a believable timeline for every named constituent,
--     lighter history for the bulk (logged_by = staff handle)
-- ════════════════════════════════════════════════════════════════════════════
insert into public.interactions
  (id, org_id, constituent_id, kind, occurred_at, notes, logged_by, created_at, direction, subject, body_preview)
select pg_temp.nb_id('int:' || i.k), pg_temp.nb_org(), pg_temp.nb_id('con:' || i.con), i.kind,
       pg_temp.s3a_at(i.dt, i.hhmi), i.notes, i.by, pg_temp.s3a_at(i.dt, i.hhmi) + interval '20 minutes',
       i.dir, i.subj, case when i.kind = 'email' then i.notes end
from (values
  -- Board
  ('harr_devlunch', 'bd_harrington', 'meeting', pg_temp.d(-340), '12:30', 'remi', null::text, null::text, 'Development committee planning lunch. Celeste will host the spring donor dinner again and wants a tighter ask list this year.'),
  ('harr_ye',       'bd_harrington', 'call',    pg_temp.s3a_last_dec() + 3, '09:15', 'remi', null, null, 'Year-end check-in. Confirmed the second half of her commitment lands before December 31; she offered to call Sarah Bell herself.'),
  ('harr_gala',     'bd_harrington', 'event',   pg_temp.d(-165), '19:00', 'remi', null, null, 'Gala: Celeste opened the paddle raise at $10K and introduced her table to Amara and two Pathways fellows.'),
  ('harr_devcmte',  'bd_harrington', 'meeting', pg_temp.d(-130), '16:00', 'priya', null, null, 'Development committee: reviewed the gift table. Celeste took three asks: the Okafor renewal, a Wu introduction, and Bell at year-end.'),
  ('harr_thanks',   'bd_harrington', 'call',    pg_temp.d(-101), '17:30', 'remi', null, null, 'Thanked her for the July half of her pledge. She asked for a one-page runway update before the board retreat.'),
  ('harr_chair',    'bd_harrington', 'meeting', pg_temp.d(-60),  '08:00', 'remi', null, null, 'Monthly chair check-in. Board giving is coming in on schedule; Victor and Ravi have not committed yet. She will raise it at the next meeting.'),
  ('harr_email',    'bd_harrington', 'email',   pg_temp.d(-26),  '18:40', 'remi', 'outbound', 'Board giving and the year-end plan', 'Celeste, thank you for offering to nudge Victor and Ravi. Attached is the one-pager on year-end goals and where each board member stands.'),
  ('harr_chair2',   'bd_harrington', 'call',    pg_temp.d(-6),   '08:15', 'remi', null, null, 'Chair check-in: Meridian timeline, year-end launch in two weeks, and the December half of her pledge (confirmed).'),
  ('osei_renew',    'bd_osei',       'meeting', pg_temp.d(-480), '14:00', 'priya', null, null, 'Renewal meeting at the bank: Summer Works presenting sponsorship renewed at $45K.'),
  ('osei_renew2',   'bd_osei',       'meeting', pg_temp.d(-160), '11:00', 'remi', null, null, 'Sponsorship renewal conversation. Daniel expects the bank to come in at $50K again and wants a named intern cohort.'),
  ('osei_showcase', 'bd_osei',       'event',   pg_temp.d(-118), '16:30', 'simone', null, null, 'Summer Works intern showcase at the downtown branch. Daniel introduced all eight interns.'),
  ('osei_gift',     'bd_osei',       'note',    pg_temp.d(-87),  '10:20', 'priya', null, null, 'Daniel''s personal board gift arrived by ACH. Check whether the bank''s matching program covers board service.'),
  ('osei_next',     'bd_osei',       'call',    pg_temp.d(-12),  '12:30', 'priya', null, null, 'Next year''s sponsorship: he is pushing internally for $60K with a financial-literacy add-on. Proposal to him by mid-November.'),
  ('lim_gift',      'bd_lim',        'note',    pg_temp.d(-69),  '09:50', 'kwame', null, null, 'Grace''s annual gift arrived the first week of audit fieldwork. Unrestricted, as she asked.'),
  ('lim_fa',        'bd_lim',        'meeting', pg_temp.d(-33),  '07:30', 'remi', null, null, 'Finance & Audit pre-meeting: fieldwork schedule and the reserve policy language for the board packet.'),
  ('ramos_ty',      'bd_ramos',      'call',    pg_temp.s3a_last_dec() + 23, '11:00', 'jordan', null, null, 'Thank-you call for his December gift.'),
  ('ramos_plan',    'bd_ramos',      'note',    pg_temp.d(-44),  '20:10', 'remi', null, null, 'Victor hasn''t made his gift for this fiscal year. Plan: Remi asks in person after the next board meeting.'),
  ('ramos_email',   'bd_ramos',      'email',   pg_temp.d(-15),  '09:05', 'remi', 'outbound', 'Coffee next week?', 'Victor, could we grab coffee before the board meeting? I want your read on the employer contracts, and to talk about your gift this year.'),
  ('freeman_site',  'bd_freeman',    'meeting', pg_temp.d(-27),  '15:30', 'miguel', null, null, 'Site visit at Eastlake: Dr. Freeman met the new Launchpad cohort and Ms. Reed.'),
  ('freeman_ty',    'bd_freeman',    'call',    pg_temp.d(-23),  '10:00', 'remi', null, null, 'Thanked her for her gift; she wants to underwrite a FAFSA night at the library.'),
  ('nak_kinetic',   'bd_nakamura',   'meeting', pg_temp.d(-640), '12:00', 'remi', null, null, 'Ken introduced Remi to Kinetic Labs'' head of social impact. That conversation became the first $20K partnership gift.'),
  ('nak_gala',      'bd_nakamura',   'event',   pg_temp.d(-165), '19:00', 'remi', null, null, 'Gala: hosted a table with Ravi Patel and two Kinetic engineers.'),
  ('nak_stock',     'bd_nakamura',   'call',    pg_temp.d(-50),  '17:45', 'remi', null, null, 'His DAF grant arrived from Bay Legacy; thanked him. Ken offered to co-host Ravi''s onboarding coffee and to warm up Jennifer Wu before the ask.'),
  ('jackson_tour',  'bd_jackson',    'meeting', pg_temp.d(-48),  '13:00', 'priya', null, null, 'Monique walked Keisha''s cohort through the clinical rotation at Harbor. Her gift came the next day.'),
  ('patel_orient',  'bd_patel',      'meeting', pg_temp.d(-95),  '16:00', 'remi', null, null, 'Board orientation, part one: finances, programs, and the Meridian ask.'),
  ('patel_coffee',  'bd_patel',      'meeting', pg_temp.d(-60),  '08:30', 'remi', null, null, 'Coffee in Piedmont. Ravi wants to help build an employer-paid training line. Explained the board giving expectation; he is thinking about a multi-year gift.'),
  ('patel_email',   'bd_patel',      'email',   pg_temp.d(-9),   '19:20', 'remi', 'outbound', 'Onboarding, part two', 'Ravi, here is the agenda for part two (fundraising and the gift table). Ken has offered to join us.'),
  ('brooks_panel',  'bd_brooks',     'event',   pg_temp.d(-26),  '18:00', 'andre', null, null, 'Theo spoke on the alumni panel at Cohort 8 info night. Three applicants mentioned him in their essays.'),
  -- Program officers and funders
  ('bay_pay',       'po_bayview',    'email',   pg_temp.d(-61),  '11:10', 'lena', 'inbound', 'Payment confirmation: year-two installment', 'Janelle confirmed the year-two general operating payment went out by ACH this morning.'),
  ('bay_call',      'po_bayview',    'call',    pg_temp.d(-30),  '14:00', 'lena', null, null, 'Annual report check-in: Janelle wants outcome data broken out by school site.'),
  ('bay_outline',   'po_bayview',    'email',   pg_temp.d(-7),   '16:25', 'lena', 'outbound', 'Draft outline: annual report', 'Janelle, attached is our outline for the annual report. Site-level outcomes are in section 3.'),
  ('hol_pay',       'po_hollis',     'email',   pg_temp.d(-96),  '09:30', 'lena', 'inbound', 'Installment one is on its way', 'Martin: the first $75K installment was released this morning.'),
  ('hol_visit',     'po_hollis',     'meeting', pg_temp.d(-40),  '10:00', 'lena', null, null, 'Site visit at Pathways with Martin; he met two healthcare fellows. The interim report due in November gates installment two.'),
  ('hol_call',      'po_hollis',     'call',    pg_temp.d(-18),  '15:00', 'lena', null, null, 'Confirmed the interim report format: narrative, budget-to-actual, and three fellow profiles.'),
  ('mer_first',     'po_meridian',   'meeting', pg_temp.d(-180), '09:00', 'remi', null, null, 'First call with Camille. She invited a full proposal for the San Leandro site.'),
  ('mer_sub',       'po_meridian',   'email',   pg_temp.d(-21),  '17:05', 'remi', 'outbound', 'Northbridge proposal submitted', 'Camille, our full proposal is in the portal. Thank you for the guidance on the evaluation section.'),
  ('mer_reply',     'po_meridian',   'email',   pg_temp.d(-14),  '07:40', 'remi', 'inbound', 'Re: Northbridge proposal submitted', 'Received, thank you. The review committee meets the first week of December.'),
  ('seq_intro',     'po_sequoia',    'email',   pg_temp.d(-35),  '13:15', 'remi', 'inbound', 'Introduction via Celeste Harrington', 'Celeste speaks highly of your work. Would you have time for an introductory meeting this fall?'),
  ('seq_confirm',   'po_sequoia',    'email',   pg_temp.d(-4),   '10:45', 'remi', 'outbound', 'Confirming Thursday', 'Arthur, confirming our meeting Thursday at 10. I will bring the Pathways placement numbers and a one-page overview.'),
  ('es_kickoff',    'po_eastshore',  'meeting', pg_temp.d(-90),  '10:00', 'kwame', null, null, 'Contract kickoff: invoice format, allowable costs, and the quarterly reporting template.'),
  ('es_invoice',    'po_eastshore',  'email',   pg_temp.d(-12),  '16:00', 'kwame', 'outbound', 'Q1 invoice submitted', 'Denise, the Q1 invoice ($105K) and backup are uploaded. Payment expected within 30 days.'),
  -- Major donors
  ('chen_visit',    'chen_margaret', 'meeting', pg_temp.d(-335), '18:30', 'remi', null, null, 'Visit at the Chens'' home. Margaret confirmed the three-year pledge: $50K a year, first payment before the holidays.'),
  ('chen_ty',       'chen_margaret', 'call',    pg_temp.d(-318), '10:00', 'remi', null, null, 'Thank-you call for the first pledge installment.'),
  ('chen_gala',     'chen_margaret', 'event',   pg_temp.d(-165), '19:00', 'priya', null, null, 'Gala: Margaret and David at the chair''s table; Margaret raised her paddle for the match.'),
  ('chen_tour',     'chen_margaret', 'meeting', pg_temp.d(-120), '10:30', 'priya', null, null, 'Tour of the Pathways IT lab with David. Ben sent the outcomes one-pager afterward.'),
  ('chen_reminder', 'chen_margaret', 'note',    pg_temp.d(-25),  '14:10', 'jordan', null, null, 'Pledge reminder letter queued for mid-November; installment two is due the first week of December.'),
  ('chen_david',    'chen_david',    'email',   pg_temp.d(-119), '09:40', 'ben', 'outbound', 'Pathways outcomes one-pager', 'David, here are the placement and wage numbers you asked about, by track.'),
  ('ok_ty',         'okafor',        'call',    pg_temp.d(-298), '17:00', 'remi', null, null, 'Called to thank Nnamdi for the $25K stock gift. He asked to hear how the Summer Works interns at the bank did.'),
  ('ok_spring',     'okafor',        'email',   pg_temp.d(-200), '08:45', 'remi', 'outbound', 'Spring update and a gala invitation', 'Nnamdi, a quick spring update and an invitation to Northbridge Rising in May.'),
  ('ok_gala',       'okafor',        'note',    pg_temp.d(-170), '12:00', 'priya', null, null, 'Not attending the gala this year (traveling).'),
  ('ok_checkin',    'okafor',        'email',   pg_temp.d(-45),  '19:10', 'remi', 'outbound', 'Checking in', 'Nnamdi, I would love to catch up this fall and share what your gift did last year.'),
  ('ok_vm',         'okafor',        'call',    pg_temp.d(-20),  '17:30', 'remi', null, null, 'Left a voicemail. He prefers calls to email; try again mid-October.'),
  ('wu_brief',      'wu',            'note',    pg_temp.d(-120), '15:00', 'priya', null, null, 'Prospect research brief: recent liquidity event; gives to workforce and nursing programs.'),
  ('wu_intro',      'wu',            'email',   pg_temp.d(-60),  '09:20', 'remi', 'outbound', 'Introduction through Ken Nakamura', 'Jennifer, Ken suggested we meet. I would love to show you the Pathways healthcare track.'),
  ('wu_tour',       'wu',            'meeting', pg_temp.d(-30),  '11:00', 'remi', null, null, 'Toured the Pathways healthcare lab. Jennifer asked about the CNA pipeline and starting wages.'),
  ('wu_lunch',      'wu',            'meeting', pg_temp.d(-11),  '12:15', 'remi', null, null, 'Lunch. She is ready to talk about a lead gift to the healthcare track. Next step: schedule the ask meeting with Ken.'),
  ('alv_table',     'alvarez_ricardo','call',   pg_temp.d(-530), '15:00', 'jordan', null, null, 'Bought a gala table again; bringing two Summer Works interns from his kitchens.'),
  ('alv_confirm',   'alvarez_ricardo','call',   pg_temp.d(-168), '13:30', 'jordan', null, null, 'Gala table confirmed for ten.'),
  ('alv_ty',        'alvarez_ricardo','call',   pg_temp.d(-163), '11:15', 'remi', null, null, 'Thank-you call after the gala. He wants to hire three interns next summer.'),
  ('elena_mt',      'alvarez_elena', 'meeting', pg_temp.d(-33),  '19:00', 'simone', null, null, 'Mentor check-in: her mentee was accepted to the Laney culinary program.'),
  ('gold_daf',      'goldberg',      'note',    pg_temp.s3a_last_dec() + 21, '10:00', 'jordan', null, null, 'DAF grant arrived through Bay Legacy Giving Fund. Sent Aaron a personal thank-you (no tax receipt for DAF grants).'),
  ('gold_gala',     'goldberg',      'event',   pg_temp.d(-165), '19:00', 'jordan', null, null, 'Gala: Aaron came with his daughter, a first-year teacher in Oakland.'),
  ('gold_email',    'goldberg',      'email',   pg_temp.d(-8),   '18:05', 'remi', 'inbound', 'A grant from our family fund', 'Remi, I asked Bay Legacy to send $20,000 to Northbridge. Use it where you need it most.'),
  ('daf_check',     'legacy_daf',    'note',    pg_temp.d(-9),   '14:10', 'jordan', null, null, 'DAF grant check received ($20,000), advised by Aaron Goldberg. Escalated to Remi for a personal thank-you.'),
  ('bell_ty',       'bell',          'call',    pg_temp.s3a_last_dec() + 19, '16:00', 'priya', null, null, 'Thanked Sarah for her December gift. She loves the alumni stories in the year-end letter.'),
  ('bell_recap',    'bell',          'email',   pg_temp.d(-90),  '10:10', 'priya', 'outbound', 'Summer Works recap', 'Sarah, a quick recap of the summer: 85 interns, 22 employers, and a few photos.'),
  ('bell_plan',     'bell',          'note',    pg_temp.d(-40),  '15:30', 'priya', null, null, 'Plan: year-end letter with a personal note from Remi; ask for $12K.'),
  -- Organizations
  ('psb_signed',    'pacific_summit','meeting', pg_temp.d(-142), '10:00', 'priya', null, null, 'Sponsorship agreement signed with Ian Morales.'),
  ('psb_renewal',   'pacific_summit','email',   pg_temp.d(-20),  '15:45', 'priya', 'outbound', 'Draft renewal proposal', 'Ian, attached is the draft proposal for next summer at $60K, with the financial-literacy add-on Daniel suggested.'),
  ('kin_invoice',   'kinetic',       'email',   pg_temp.d(-35),  '11:00', 'priya', 'outbound', 'Pledge installment one', 'Priscilla, attached is the invoice for installment one of three.'),
  ('kin_received',  'kinetic',       'note',    pg_temp.d(-30),  '10:05', 'kwame', null, null, 'Installment one received: $25,000 by ACH.'),
  ('kin_timing',    'kinetic',       'email',   pg_temp.d(0),    '08:10', 'priya', 'inbound', 'Re: Installment two timing', 'Priya, confirming installment two will process the second week of December. Also, we have four new mentor volunteers.'),
  ('red_site',      'redline',       'meeting', pg_temp.d(-76),  '09:30', 'andre', null, null, 'Job-site visit with the Cohort 7 trades fellows. Rick committed $25K for the trades pathway.'),
  ('har_place',     'harbor',        'meeting', pg_temp.d(-41),  '14:00', 'andre', null, null, 'Clinical placement planning for Cohort 7''s healthcare fellows.'),
  ('cyp_loi',       'cypress',       'call',    pg_temp.d(-14),  '11:30', 'lena', null, null, 'LOI prep call with Gregory Ashford: lead with Launchpad attendance and the San Leandro pilot.'),
  ('ald_coffee',    'alder',         'meeting', pg_temp.d(-90),  '08:30', 'priya', null, null, 'Re-cultivation coffee with Miriam Stokes. Their new strategy includes workforce; open to a conversation next year.'),
  ('eb_final',      'eastbay',       'email',   pg_temp.d(-20),  '16:50', 'lena', 'outbound', 'Final report submitted', 'Rosalind, our final report for the Summer Works stipend grant is in the portal.'),
  ('yoi_tranche',   'ca_yoi',        'email',   pg_temp.d(-45),  '13:20', 'lena', 'inbound', 'Tranche timing', 'Kevin: the second-year tranche is scheduled for late December, pending the progress report.'),
  ('tw_ty',         'corp_tidewell', 'call',    pg_temp.d(-10),  '12:00', 'remi', null, null, 'Thanked Desmond for the $10K sponsorship that opened the Summer Works drive.'),
  ('bw_ty',         'corp_brightwater','call',  pg_temp.d(-3),   '16:20', 'priya', null, null, 'Allison called to confirm the ACH went out. Thank-you letter to follow.'),
  ('hl_present',    'corp_harborlight','meeting', pg_temp.d(-230), '12:00', 'remi', null, null, 'Lunch with Peter Lindgren: Harborlight will present the gala again, at $30K with two tables.'),
  ('qf_match',      'corp_quillfeather','email', pg_temp.d(-61),  '10:30', 'jordan', 'inbound', 'Q3 matching gifts', 'Celia: three employee matches approved this quarter; payment follows by ACH.'),
  ('qf_interns',    'corp_quillfeather','meeting', pg_temp.d(-128), '15:00', 'simone', null, null, 'Summer Works close-out with Quillfeather; both IT-track interns got return offers for next summer.'),
  ('ab_table',      'corp_albright',  'call',    pg_temp.d(-200), '11:00', 'jordan', null, null, 'Gala table confirmed; Victor Ramos is hosting it.'),
  ('cl_table',      'corp_corbettlim','note',    pg_temp.d(-172), '09:30', 'jordan', null, null, 'Gala sponsorship check received; Grace Lim hosting the table.'),
  ('cp_tools',      'corp_copperline','meeting', pg_temp.d(-52),  '08:00', 'andre', null, null, 'Shop visit with Inez Galvan; Copperline covered the tool allowance for the trades fellows.'),
  ('ms_shadow',     'corp_mosaic',    'event',   pg_temp.d(-110), '09:00', 'andre', null, null, 'Dental-assistant shadow day for four healthcare fellows.'),
  ('jl_dessert',    'corp_juniper',   'note',    pg_temp.d(-166), '16:00', 'jordan', null, null, 'Dessert service confirmed for 320 guests; in-kind valuation letter requested.'),
  ('ep_tools',      'corp_eastport',  'note',    pg_temp.d(-88),  '12:00', 'andre', null, null, 'Picked up the donated hand tools and tool belts for Cohort 7.'),
  -- Contacts
  ('pc01_show',     'pc01', 'event',   pg_temp.d(-118), '16:30', 'simone', null, null, 'Summer Works showcase; Marcus asked for ten intern slots next summer.'),
  ('pc02_luis',     'pc02', 'call',    pg_temp.d(-120), '11:00', 'simone', null, null, 'End-of-summer check-in on Luis Ortega: strong evaluation; she offered him a part-time teller role.'),
  ('pc03_renew',    'pc03', 'call',    pg_temp.d(-21),  '10:30', 'priya', null, null, 'Walked through the renewal proposal outline before it goes to Daniel.'),
  ('pc05_plan',     'pc05', 'meeting', pg_temp.d(-300), '13:00', 'priya', null, null, 'Partnership planning for this fiscal year; agreed to a $75K pledge in three installments.'),
  ('pc06_amara',    'pc06', 'call',    pg_temp.d(-40),  '15:30', 'andre', null, null, 'Amara''s 90-day review went well; he wants two more IT fellows in the spring.'),
  ('pc07_mentors',  'pc07', 'meeting', pg_temp.d(-33),  '12:00', 'simone', null, null, 'Mentor recruitment: four new Kinetic volunteers starting orientation.'),
  ('pc09_rot',      'pc09', 'meeting', pg_temp.d(-41),  '14:00', 'andre', null, null, 'Rotation schedule for the healthcare fellows.'),
  ('pc10_keisha',   'pc10', 'call',    pg_temp.d(-22),  '16:00', 'andre', null, null, 'Keisha is on track for the CNA exam; she needs a transit pass renewal.'),
  ('pc12_walk',     'pc12', 'meeting', pg_temp.d(-76),  '08:00', 'andre', null, null, 'Site walk at the Jack London job site before the fellows'' first day.'),
  ('pc13_osha',     'pc13', 'email',   pg_temp.d(-60),  '09:10', 'andre', 'outbound', 'OSHA-10 schedule for Cohort 7', 'Dana, here are the dates for the Cohort 7 OSHA-10 sessions. Ten fellows confirmed.'),
  ('pc14_ty',       'pc14', 'call',    pg_temp.d(-75),  '17:00', 'remi', null, null, 'Thanked Rick for the $25K commitment.'),
  ('pc15_remit',    'pc15', 'email',   pg_temp.d(-61),  '11:30', 'lena', 'inbound', 'Payment remittance detail', 'Theresa sent the remittance detail for the year-two payment.'),
  ('pc17_loi',      'pc17', 'email',   pg_temp.d(-50),  '10:00', 'lena', 'inbound', 'Invitation to submit a renewal LOI', 'Gregory invited a renewal LOI for Launchpad, due in the next cycle.'),
  ('pc18_final',    'pc18', 'call',    pg_temp.d(-20),  '13:00', 'lena', null, null, 'Final report walkthrough; the renewal cycle opens in January.'),
  ('pc20_coffee',   'pc20', 'meeting', pg_temp.d(-90),  '08:30', 'priya', null, null, 'Coffee: the foundation''s new strategy includes workforce. Follow up in the spring.'),
  ('pc22_confirm',  'pc22', 'email',   pg_temp.d(-6),   '14:30', 'remi', 'inbound', 'Meeting confirmation', 'Yvonne confirmed Thursday at 10 with Arthur.'),
  ('pc23_site',     'pc23', 'meeting', pg_temp.d(-6),   '15:45', 'rosa', null, null, 'Weekly site check-in at Eastlake.'),
  ('pc24_bell',     'pc24', 'meeting', pg_temp.d(-3),   '14:30', 'rosa', null, null, 'Attendance plan for the new bell schedule; moving Launchpad to 3:45.'),
  ('pc26_mou',      'pc26', 'call',    pg_temp.d(-8),   '10:00', 'miguel', null, null, 'San Leandro pilot: MOU draft is out for district review.'),
  ('pc27_fafsa',    'pc27', 'meeting', pg_temp.d(-50),  '11:00', 'simone', null, null, 'FAFSA night planning, underwritten by Dr. Freeman.'),
  ('pc28_venue',    'pc28', 'meeting', pg_temp.d(-14),  '17:00', 'simone', null, null, 'Venue walk-through for the November circle.'),
  ('pc29_ty',       'pc29', 'call',    pg_temp.d(-4),   '11:10', 'priya', null, null, 'Thanked Allison for the Summer Works sponsorship; three warehouse interns next summer.'),
  ('pc31_slots',    'pc31', 'meeting', pg_temp.d(-50),  '09:00', 'andre', null, null, 'Pre-apprenticeship slots for two trades fellows.'),
  ('pc32_gala',     'pc32', 'call',    pg_temp.d(-150), '10:15', 'remi', null, null, 'Gala thank-you; Harborlight wants to present again next year.'),
  ('pc35_match',    'pc35', 'email',   pg_temp.d(-60),  '13:45', 'jordan', 'outbound', 'Matching gift forms', 'Celia, here are the receipts for this quarter''s employee matches.'),
  -- Bulk donors worth a closer look
  ('d001_stock',    'd001', 'note',    pg_temp.d(-6),   '13:50', 'jordan', null, null, 'Stock transfer notice from the brokerage: 40 shares. Receipt letter to mail; no email on file.'),
  ('d004_late',     'd004', 'note',    pg_temp.d(-10),  '09:00', 'priya', null, null, 'Third pledge installment is a few days late. Call before sending a reminder.'),
  ('d298_gala',     'd298', 'event',   pg_temp.d(-165), '21:10', 'jordan', null, null, 'Signed in at the gala as a guest; interested in Mentor Circles.'),
  ('d299_tour',     'd299', 'event',   pg_temp.d(-12),  '15:00', 'andre', null, null, 'Toured the Pathways IT lab with a friend from Quillfeather.'),
  ('d300_new',      'd300', 'note',    pg_temp.d(0),    '07:40', 'jordan', null, null, 'New online donor this morning. Found us through the Kinetic Labs story about Amara.'),
  ('m07_card',      'm07',  'email',   pg_temp.d(-2),   '10:00', 'jordan', 'outbound', 'Your monthly gift didn''t go through', 'Your card was declined on the last charge. Here is a secure link to update it whenever you have a minute.'),
  ('m19_card',      'm19',  'email',   pg_temp.d(-6),   '10:00', 'jordan', 'outbound', 'Your card on file has expired', 'The card on your monthly gift expired. Update it anytime and we will pick up where we left off.'),
  ('m33_pause',     'm33',  'call',    pg_temp.d(-71),  '18:00', 'jordan', null, null, 'Asked to pause her monthly gift for three months while between jobs. Check back in January.'),
  ('mt58_app',      'mt58', 'note',    pg_temp.d(0),    '07:50', 'simone', null, null, 'New mentor application overnight; screening call to schedule.')
) i(k, con, kind, dt, hhmi, by, dir, subj, notes)
on conflict do nothing;

-- Generated: thank-you calls on mid-level gifts.
insert into public.interactions (id, org_id, constituent_id, kind, occurred_at, notes, logged_by, created_at)
select pg_temp.nb_id('int:ty:' || b.gkey), pg_temp.nb_org(), pg_temp.nb_id('con:' || b.k), 'call', b.ack_at,
       pg_temp.pick(array[
         'Thank-you call. Left a warm voicemail; got an email back the same day.',
         'Thank-you call. Talked about the Summer Works interns at their company; wants a tour.',
         'Thank-you call. Asked how Cohort 7 is doing; sent the fall update.',
         'Thank-you call. Second year giving at this level; curious about Mentor Circles.',
         'Thank-you call. The gift was in honor of a former teacher.',
         'Thank-you call. Prefers email updates over mail from now on.',
         'Thank-you call. Asked for the Pathways placement numbers; Ben sent them.'], 's3a:tycall:' || b.gkey),
       case when b.amount >= 5000 then 'remi' else 'priya' end, b.ack_at + interval '15 minutes'
from pg_temp.s3a_bulk_gifts() b
where b.tier = 'mid' and b.ev not like 'gala%'
on conflict do nothing;

-- Generated: gala attendance.
insert into public.interactions (id, org_id, constituent_id, kind, occurred_at, notes, logged_by, created_at)
select pg_temp.nb_id('int:gala:' || b.gkey), pg_temp.nb_org(), pg_temp.nb_id('con:' || b.k), 'event',
       pg_temp.s3a_at(b.gift_date, '19:30'),
       'Attended the Northbridge Rising Gala.' || pg_temp.pick(array[
         '', ' Sat with the Kinetic Labs table.', ' Stayed for the paddle raise.', ' First gala; came with a friend from work.',
         ' Asked to meet Amara after her speech.', ' Signed up for a Pathways site visit.'], 's3a:galanote:' || b.gkey),
       'jordan', pg_temp.s3a_at(b.gift_date + 2, '10:00')
from pg_temp.s3a_bulk_gifts() b
where b.ev like 'gala%'
on conflict do nothing;

-- Generated: one cultivation meeting a year for mid-level donors.
insert into public.interactions (id, org_id, constituent_id, kind, occurred_at, notes, logged_by, created_at)
select pg_temp.nb_id('int:cult:' || b.k), pg_temp.nb_org(), pg_temp.nb_id('con:' || b.k), 'meeting',
       pg_temp.ts(-30 - floor(pg_temp.rnd('s3a:cult:' || b.k) * 240)::int, '08:30'),
       pg_temp.pick(array[
         'Coffee to share the Pathways placement numbers; interested in the healthcare track.',
         'Site visit to Launchpad at Bayshore; met two seniors working on college essays.',
         'Lunch; talked about year-end and the possibility of a multi-year commitment.',
         'Walked the Summer Works showcase together; wants to host an intern next summer.',
         'Coffee; asked how the San Leandro expansion would work and what it costs.'], 's3a:cultnote:' || b.k),
       case when pg_temp.rnd('s3a:cultby:' || b.k) < .35 then 'remi' else 'priya' end,
       pg_temp.ts(-30 - floor(pg_temp.rnd('s3a:cult:' || b.k) * 240)::int, '09:15')
from pg_temp.s3a_bulk() b
where b.tier = 'mid' and b.pattern in ('loyal', 'lybunt', 'new') and b.i not in (1)
on conflict do nothing;

-- Generated: year-end outreach to lapsed mid-level donors.
insert into public.interactions (id, org_id, constituent_id, kind, occurred_at, notes, logged_by, created_at, direction, subject, body_preview)
select pg_temp.nb_id('int:lyb:' || b.k), pg_temp.nb_org(), pg_temp.nb_id('con:' || b.k), 'email',
       pg_temp.ts(-8 - floor(pg_temp.rnd('s3a:lyb:' || b.k) * 25)::int, '17:20'),
       'Checking in before year-end with a short update on the fellows your gift supported last year.', 'priya',
       pg_temp.ts(-8 - floor(pg_temp.rnd('s3a:lyb:' || b.k) * 25)::int, '17:21'),
       'outbound', 'A quick update before year-end', 'Checking in before year-end with a short update on the fellows your gift supported last year.'
from pg_temp.s3a_bulk() b
join public.constituents c on c.id = pg_temp.nb_id('con:' || b.k)
where b.tier = 'mid' and b.pattern = 'lybunt' and cardinality(c.emails) > 0 and not c.do_not_contact
on conflict do nothing;

-- Generated: replies to year-end thank-yous.
insert into public.interactions (id, org_id, constituent_id, kind, occurred_at, notes, logged_by, created_at, direction, subject, body_preview)
select pg_temp.nb_id('int:reply:' || b.gkey), pg_temp.nb_org(), pg_temp.nb_id('con:' || b.k), 'email', b.ack_at + interval '1 day 2 hours',
       x.msg, 'jordan', b.ack_at + interval '1 day 2 hours', 'inbound', 'Re: Thank you, ' || c.first_name, x.msg
from pg_temp.s3a_bulk_gifts() b
join public.constituents c on c.id = pg_temp.nb_id('con:' || b.k)
cross join lateral (select pg_temp.pick(array[
  'Thank you for the note. Keep up the great work with the interns.',
  'So glad to help. My nephew did Summer Works years ago and still talks about it.',
  'Happy to give. Could you send a receipt for my employer match?',
  'Thanks, Jordan. Put me down for the spring site visit.',
  'Lovely to hear from a real person. Happy new year to the whole team.'], 's3a:reply:' || b.gkey) as msg) x
where b.tier = 'core' and b.ev = 'ye_last' and pg_temp.rnd('s3a:replyp:' || b.gkey) < .22 and cardinality(c.emails) > 0
on conflict do nothing;

-- Generated: mentor pipeline touches (screening, orientation, match, circles).
create or replace function pg_temp.s3a_circle_day(back int) returns date language sql stable as $$
  select d from (
    select (st + ((2 - extract(isodow from st)::int + 7) % 7) + 7)::date as d
    from (select (date_trunc('month', pg_temp.d(-1)) - make_interval(months => m))::date as st from generate_series(0, 3) m) x) y
  where d <= pg_temp.d(-1) order by d desc offset back limit 1 $$;

insert into public.interactions (id, org_id, constituent_id, kind, occurred_at, notes, logged_by, created_at)
select pg_temp.nb_id('int:mt:' || t.k || ':' || s.step), pg_temp.nb_org(), pg_temp.nb_id('con:' || t.k), s.kind,
       s.at, s.notes, 'simone', s.at + interval '30 minutes'
from pg_temp.s3a_mentors() t
cross join lateral (values
  ('screen', 'call', pg_temp.ts(least(t.since + 2, 0), '12:30'), 'Screening call: works in ' || coalesce(nullif(t.employer, ''), 'the community') || '; available one evening a week.', true),
  ('bg',     'note', pg_temp.ts(least(t.since + 6, 0), '09:00'), 'Background check cleared.', t.status not in ('Applied', 'Background check')),
  ('orient', 'event', pg_temp.ts(least(t.since + 12, -1), '18:00'), 'Completed mentor orientation at the Fruitvale Hub.', t.status not in ('Applied', 'Background check')),
  ('match',  'meeting', pg_temp.ts(least(t.since + 30, -1), '17:30'), 'Match meeting with mentee and family at the Fruitvale Hub.', t.status in ('Matched', 'Alumni mentor')),
  ('circle', 'event', pg_temp.s3a_at(pg_temp.s3a_circle_day(0), '18:00'), 'Mentor Circle (second Tuesday): ' || pg_temp.pick(array['mock interviews','résumé night','college essay workshop','financial aid Q&A','career speed-networking'], 's3a:circ:' || t.k) || '.', t.status = 'Matched'),
  ('circle2','event', pg_temp.s3a_at(pg_temp.s3a_circle_day(1), '18:00'), 'Mentor Circle (second Tuesday).', t.status = 'Matched' and t.n % 3 <> 0)
) s(step, kind, at, notes, ok)
where s.ok and s.at > pg_temp.ts(t.since, '18:15') and s.at <= pg_temp.ts(0, '07:30')
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 17. Segments (saved views / comms audiences)
-- ════════════════════════════════════════════════════════════════════════════
insert into public.segments (id, org_id, name, definition, created_by, created_at, updated_at)
select pg_temp.nb_id('segment:' || s.k), pg_temp.nb_org(), s.n, s.def, s.by, pg_temp.ts(s.since, '10:40'), pg_temp.ts(s.since, '10:40')
from (values
  ('board',   'Board of Directors',                         '{"tag":"board"}'::jsonb,                                  'remi',   -300),
  ('monthly', 'Monthly Giving Circle',                      '{"view":"recurring","tag":"monthly_donor"}'::jsonb,       'jordan', -280),
  ('major',   'Major donors ($10K+ lifetime)',              '{"view":"donors","min_total":"10000"}'::jsonb,            'priya',  -200),
  ('mentors', 'Mentors',                                    '{"tag":"mentor"}'::jsonb,                                 'simone', -150),
  ('lybunt',  'LYBUNT: renew before December 31',           '{"view":"lapsed"}'::jsonb,                                'priya',  -40),
  ('gala',    'Gala guests',                                '{"tag":"gala"}'::jsonb,                                   'jordan', -160),
  ('yearend', 'Year-end mailing: individuals who gave in the last 18 months',
              jsonb_build_object('type', 'person', 'since', to_char(pg_temp.d(-545), 'YYYY-MM-DD')),                         'jordan', -20)
) s(k, n, def, by, since)
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 18. Journeys. BOTH are paused: the hourly cron enrolls into and sends only
--     for ACTIVE journeys, so this demo org can never send a journey email.
--     The welcome series shows people mid-sequence ("sends held").
-- ════════════════════════════════════════════════════════════════════════════
insert into public.journeys (id, org_id, name, trigger, status, created_by, created_at, updated_at)
values
  (pg_temp.nb_id('journey:welcome'), pg_temp.nb_org(), 'New donor welcome series', 'first_gift', 'paused', 'jordan', pg_temp.ts(-300, '14:00'), pg_temp.ts(-6, '16:40')),
  (pg_temp.nb_id('journey:winback'), pg_temp.nb_org(), 'Lapsed donor win-back',    'lapsed',     'paused', 'priya',  pg_temp.ts(-250, '10:30'), pg_temp.ts(-58, '11:15'))
on conflict do nothing;

insert into public.journey_steps (id, org_id, journey_id, step_order, delay_days, subject, body, created_at)
select pg_temp.nb_id('jstep:' || s.j || ':' || s.n), pg_temp.nb_org(), pg_temp.nb_id('journey:' || s.j), s.n, s.delay, s.subj, s.body,
       pg_temp.ts(case s.j when 'welcome' then -300 else -250 end, '14:30')
from (values
  ('welcome', 1, 0,  'Welcome to Northbridge, {{first_name}}',
   E'Hi {{first_name}},\n\nThank you for your first gift. You just joined about 900 people who keep Northbridge going, and we are glad you are here.\n\nOver the next few weeks we will introduce you to a few of the young people you are backing. Reply anytime; a real person reads every email.\n\nJordan Ellis\nNorthbridge Youth Alliance'),
  ('welcome', 2, 7,  'Meet Amara',
   E'Hi {{first_name}},\n\nTwo years ago Amara Johnson was working nights and taking classes when she could. This June she finished the Pathways Fellowship with her CompTIA A+ certification, and today she works the IT help desk at Kinetic Labs at $28 an hour.\n\nThat is what your gift is part of.\n\nJordan'),
  ('welcome', 3, 21, 'Where your gift goes this season',
   E'Hi {{first_name}},\n\nThis fall: 120 high schoolers in Launchpad at three Oakland schools, 36 fellows in Pathways Cohort 7, and applications open for Cohort 8.\n\nYour gift pays for things like certification exam fees, transit passes, and a stipend that lets a teenager say yes to an internship.\n\nJordan'),
  ('welcome', 4, 45, 'Come see it for yourself',
   E'Hi {{first_name}},\n\nThe best way to understand Northbridge is to visit. Join us for a Pathways lab tour or a Mentor Circle night at the Fruitvale Hub; reply with a date that works and we will save you a seat.\n\nJordan'),
  ('winback', 1, 0,  'We miss you, {{first_name}}',
   E'Hi {{first_name}},\n\nLast year you helped put Oakland teenagers to work. We wanted to share what happened next: 85 Summer Works interns, 22 employers, and a Pathways cohort that just graduated.\n\nThank you for being part of it.\n\nPriya Natarajan'),
  ('winback', 2, 14, 'What changed at Northbridge this year',
   E'Hi {{first_name}},\n\nA quick note on what is new: a healthcare track with clinical rotations at Harbor Health, and a fourth Launchpad site taking shape in San Leandro.\n\nPriya'),
  ('winback', 3, 30, 'One gift, one summer paycheck',
   E'Hi {{first_name}},\n\nA $250 gift covers a week of wages for a Summer Works intern. If you are able to give again this year, here is the link. If not, thank you for everything you have already done.\n\nPriya')
) s(j, n, delay, subj, body)
on conflict do nothing;

-- Welcome-series enrollments: first-time donors from this year, each at the
-- step they had reached when the series was paused six days ago.
insert into public.journey_enrollments (id, org_id, journey_id, constituent_id, status, current_step, next_run_at, last_step_at, enrolled_at)
select pg_temp.nb_id('jenroll:welcome:' || e.k), pg_temp.nb_org(), pg_temp.nb_id('journey:welcome'), pg_temp.nb_id('con:' || e.k),
  case when e.dnc then 'cancelled' when e.sent = 4 then 'completed' else 'active' end,
  e.sent,
  case when e.sent < 4 then e.enrolled + make_interval(days => (array[0, 7, 28, 73])[e.sent + 1]) else e.enrolled + interval '73 days' end,
  case when e.sent > 0 then e.enrolled + make_interval(days => (array[0, 7, 28, 73])[e.sent]) end,
  e.enrolled
from (
  select f.k, f.dnc, f.enrolled,
    (select count(*) from unnest(array[0, 7, 28, 73]) cum(dd)
      where f.enrolled + make_interval(days => cum.dd) <= least(pg_temp.ts(-6, '16:40'), case when f.dnc then f.enrolled + interval '10 days' else pg_temp.ts(-6, '16:40') end))::int as sent
  from (
    select b.k, c.do_not_contact as dnc, pg_temp.s3a_at(min(g.gift_date) + 1, '09:05') as enrolled
    from pg_temp.s3a_bulk() b
    join pg_temp.s3a_bulk_gifts() g on g.k = b.k
    join public.constituents c on c.id = pg_temp.nb_id('con:' || b.k)
    where b.pattern in ('new', 'onetime') and cardinality(c.emails) > 0
    group by b.k, c.do_not_contact
    having min(g.gift_date) between pg_temp.d(-200) and pg_temp.d(-8)
  ) f
) e
on conflict do nothing;

-- Win-back enrollments: lapsed donors enrolled last spring, before the pause.
insert into public.journey_enrollments (id, org_id, journey_id, constituent_id, status, current_step, next_run_at, last_step_at, enrolled_at)
select pg_temp.nb_id('jenroll:winback:' || e.k), pg_temp.nb_org(), pg_temp.nb_id('journey:winback'), pg_temp.nb_id('con:' || e.k),
  case when e.rn in (3, 7) then 'cancelled' when e.sent = 3 then 'completed' else 'active' end,
  case when e.rn in (3, 7) then least(e.sent, 1) else e.sent end,
  case when e.sent < 3 then e.enrolled + make_interval(days => (array[0, 14, 44])[e.sent + 1]) else e.enrolled + interval '44 days' end,
  case when e.sent > 0 then e.enrolled + make_interval(days => (array[0, 14, 44])[case when e.rn in (3, 7) then least(e.sent, 1) else e.sent end]) end,
  e.enrolled
from (
  select x.k, x.rn, x.enrolled,
    (select count(*) from unnest(array[0, 14, 44]) cum(dd) where x.enrolled + make_interval(days => cum.dd) <= pg_temp.ts(-58, '11:15'))::int as sent
  from (
    select b.k, row_number() over (order by pg_temp.rnd('s3a:wb:' || b.k)) as rn,
           pg_temp.ts(-200 + floor(pg_temp.rnd('s3a:wbday:' || b.k) * 130)::int, '09:05') as enrolled
    from pg_temp.s3a_bulk() b
    join public.constituents c on c.id = pg_temp.nb_id('con:' || b.k)
    where b.pattern = 'lybunt' and b.tier in ('core', 'mid') and cardinality(c.emails) > 0 and not c.do_not_contact and c.archived_at is null
  ) x where x.rn <= 12
) e
on conflict do nothing;

commit;
