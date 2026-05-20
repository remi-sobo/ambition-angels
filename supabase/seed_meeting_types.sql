-- Seeds the seven Phase-1 meeting types. Idempotent via on conflict (slug).
-- Edit copy here, or via the admin UI once Phase 2 ships.
insert into meeting_types
  (slug, name, duration_minutes, description, prep_notes, who_its_for,
   color, icon_name, min_notice_hours, sort_order)
values
  ('quick-intro',
   'Quick Intro',
   15,
   'Fifteen minutes. No agenda required.',
   'Just bring your question or your context.',
   'People who got introduced, want to say hi, have one quick question.',
   '#6B6960', 'MessageCircle', 12, 1),

  ('donor-conversation',
   'Donor Conversation',
   30,
   'For people thinking through where their giving belongs.',
   'Bring what you care about. We''ll see if Ambition Angels fits.',
   'Philanthropists, family offices, individual donors.',
   '#2F5D7E', 'Heart', 24, 2),

  ('corporate-partnership',
   'Corporate Partnership',
   30,
   'For CSR, foundation, and talent leads exploring partnership.',
   'Think about what your team is trying to accomplish this year. We''ll start there.',
   'Corporate teams evaluating workforce development partners.',
   '#E8500A', 'Building2', 24, 3),

  ('advisor',
   'Advisor or Mentor',
   30,
   'For people already in the corner, or coming into it.',
   'Bring what''s on your mind.',
   'Existing advisors, board members, active mentors.',
   '#3F7D58', 'Compass', 12, 4),

  ('press',
   'Press or Media',
   20,
   'For journalists, podcasters, and writers covering this space.',
   'Send your angle in advance if you can. Helps me show up ready.',
   'Media folks working on tech ed, workforce, or youth development stories.',
   '#6B4E8C', 'Mic', 48, 5),

  ('for-guides',
   'For Guides',
   20,
   'For adults exploring the upcoming Guide portal.',
   'Tell me how you''d want to use it. That''s the conversation.',
   'Parents, mentors, teachers thinking about how they''d use it.',
   '#2F7B7B', 'Sparkles', 24, 6),

  ('strategy',
   'Strategy Session',
   45,
   'For longer working conversations. Board, accelerator, deep dives.',
   'Send an agenda or pre-read. We''ll get the most out of the time.',
   'Board, accelerator cohort, partners in active project mode.',
   '#1A2B5C', 'Target', 48, 7)
on conflict (slug) do nothing;
