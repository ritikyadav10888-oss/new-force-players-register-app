-- Force PostgREST to reload its cached schema after the team_custom_fields /
-- team_custom_values columns were added — the API layer was still serving a
-- stale schema and rejecting requests that referenced the new columns.
NOTIFY pgrst, 'reload schema';
