-- Import layer (spec #5, E4): constituents adopt the custom-fields pattern.
--
-- custom_field_defs was built entity-generic in D1 ("only students is wired"
-- — spec #4 §5); E4 wires the second entity so a constituent import can map
-- columns onto per-org fields. Same shape as students: values in a JSONB
-- column (join-free reads), GIN for containment filters, the registry +
-- validateAndMerge as the only integrity gate. Ships dormant — no org has
-- 'constituent' defs until one inserts them. Existing constituents RLS
-- covers the new column.
alter table public.constituents add column if not exists custom_fields jsonb not null default '{}'::jsonb;
create index if not exists constituents_custom_fields_gin on public.constituents using gin (custom_fields);
