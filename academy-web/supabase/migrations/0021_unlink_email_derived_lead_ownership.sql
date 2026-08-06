-- 0021_unlink_email_derived_lead_ownership.sql
--
-- Identity Control canonical principal contract: email is a mutable verified
-- attribute, never an ownership key. Earlier Academy code associated an
-- unclaimed waitlist lead with a new user solely when their email matched.
-- Remove every such legacy association while preserving the consent record.
-- This migration is declarative only; production application needs separate
-- authorization and is deliberately out of scope for local preparation.

update academy.leads
set user_id = null
where user_id is not null;

