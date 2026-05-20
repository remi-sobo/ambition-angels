-- Make room: shift every meeting type at or after sort_order 2 up by one.
-- Two-step shift (jump high, then settle back) avoids any transient
-- collisions if a unique constraint is ever added on sort_order.
update meeting_types set sort_order = sort_order + 100 where sort_order >= 2;
update meeting_types set sort_order = sort_order - 99 where sort_order >= 102;

-- Insert "Program Partnership" right after Quick Intro. 45 minutes,
-- aimed at schools, districts, and youth-serving orgs — distinct from
-- the corporate-partnership row (CSR/foundation/talent leads).
insert into meeting_types
  (slug, name, duration_minutes, description, prep_notes, who_its_for,
   color, icon_name, min_notice_hours, sort_order)
values
  ('program-partnership',
   'Program Partnership',
   45,
   'For schools, districts, and orgs exploring partnership.',
   'Bring your population and your goals. We''ll see where we fit.',
   'Schools, districts, youth-serving nonprofits, community partners.',
   '#8B5A3C', 'GraduationCap', 24, 2)
on conflict (slug) do nothing;
