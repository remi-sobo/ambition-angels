-- Feature 1: virtual vs in-person per meeting type
alter table meeting_types
  add column if not exists location_options text[] default '{video}',
  add column if not exists default_in_person_address text;

-- Open in-person on Donor + Corporate. Default address left null on
-- purpose — set via /admin/meet → Types. When null, the booking flow
-- asks the attendee "Where works for you?" as an optional field.
update meeting_types
  set location_options = '{video,in_person}'
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
