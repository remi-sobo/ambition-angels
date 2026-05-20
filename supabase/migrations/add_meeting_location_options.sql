-- Feature 1: virtual vs in-person per meeting type
alter table meeting_types
  add column if not exists location_options text[] default '{video}',
  add column if not exists default_in_person_address text;

-- Open in-person on Donor + Corporate, with the office address as the
-- default. When the default is null on a type with in-person enabled,
-- the booking flow asks the attendee "Where works for you?" instead.
update meeting_types
  set location_options = '{video,in_person}',
      default_in_person_address = '380 Portage Ave, Palo Alto, CA'
  where slug in ('donor-conversation', 'corporate-partnership');

-- Each booking remembers which mode it was booked in + the snapshotted
-- address (for in_person) or URL (for video) so future changes to env
-- vars or type defaults don't rewrite history.
alter table bookings
  add column if not exists location_type text default 'video'
    check (location_type in ('video','in_person')),
  add column if not exists location_details text;

-- Feature 2: the column is about to stop being a Google Meet link.
alter table bookings rename column google_meet_url to meeting_url;
