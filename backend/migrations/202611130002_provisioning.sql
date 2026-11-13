-- Profile provisioning evaluates a CHECK constraint that calls this pure normalizer.
-- This grants no privileged helper/command execution and no writes to task/audit tables.
grant usage on schema private to service_role;
grant execute on function private.trim_text(text) to service_role;
