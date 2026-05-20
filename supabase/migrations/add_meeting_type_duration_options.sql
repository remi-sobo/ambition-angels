-- Allow meeting types to offer the attendee a choice of duration. When
-- non-null, the booking flow shows a duration picker before the date
-- picker; the chosen value must be in this array. When null, the type
-- has a single fixed duration as before.
alter table meeting_types
  add column if not exists duration_options int[];

-- Seed an "Other" / open-ended meeting type so visitors who don't fit
-- one of the seven specific categories can still book.
insert into meeting_types
  (slug, name, duration_minutes, duration_options, description, prep_notes,
   who_its_for, color, icon_name, min_notice_hours, sort_order)
values
  ('something-else',
   'Something Else',
   30,
   '{30,45}',
   'For anything that doesn''t fit the others.',
   'Send a line about what you want to discuss. Helps me show up ready.',
   'When none of the categories above match. Tell me what it''s about.',
   '#6B6960', 'MoreHorizontal', 24, 8)
on conflict (slug) do nothing;
