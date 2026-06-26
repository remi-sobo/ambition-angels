-- Move "Pledged" (HubSpot stage 59189578) from Solicitation to Stewardship.
-- A pledge means the donor has committed and the ask succeeded, so it belongs
-- with committed money (steward, 100%), consistent with "Committed" and
-- "Partnership Established". Mirrored in lib/hubspot/stage-map.ts.
--
-- Re-run fr_sync_hubspot_to_spine() after this to re-stage existing pledged
-- opportunities.

create or replace function fr_map_dealstage(hs_stage text)
returns text language sql immutable as $$
  select case hs_stage
    when '68574501' then 'identify'     -- Identified (Sales)
    when '117779885' then 'identify'    -- Prospective Partner
    when '1060753811' then 'identify'   -- Identified (Angel)
    when '1060753814' then 'identify'   -- Big 3 ID'd
    when '1060753815' then 'identify'   -- LinkedIn Mined
    when '3448542949' then 'qualify'    -- Researched
    when '59213864' then 'qualify'      -- Needs Appointment
    when 'appointmentscheduled' then 'cultivate'
    when '3448542951' then 'cultivate'  -- On Hold
    when '117779886' then 'cultivate'   -- Meeting Scheduled
    when '117779887' then 'cultivate'   -- Needs Follow-Up
    when '1060753812' then 'cultivate'  -- Pitched
    when '1060753816' then 'cultivate'  -- Outreach Sent
    when '1060753817' then 'cultivate'  -- Meetings Scheduled w/ Connections
    when '3448504042' then 'solicit'    -- Meeting Complete/Ready for Ask
    when '68574502' then 'solicit'      -- Ask Made
    when '1063539272' then 'solicit'    -- Proposed
    when '1064297317' then 'solicit'    -- Pending MOU Approval
    when '59189578' then 'steward'      -- Pledged — donor has committed
    when '3448542950' then 'steward'    -- AIG Member
    when 'closedwon' then 'steward'
    when '117779888' then 'steward'     -- Partnership Established
    when '117779889' then 'steward'     -- Post-partnership Follow-Up
    when '1060753813' then 'steward'    -- Committed
    when 'closedlost' then 'lost'
    when '117779890' then 'lost'        -- Not Interested
    else 'cultivate'
  end
$$;
