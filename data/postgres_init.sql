-- Runs once when the Postgres container is first created (mounted into
-- /docker-entrypoint-initdb.d/). Creates the dedicated read-only role used
-- by the query executor as a second guardrail layer, independent of the
-- application-level SQL safety middleware.

CREATE ROLE safesql_reader LOGIN PASSWORD 'safesql_reader_pw';
GRANT CONNECT ON DATABASE safesql TO safesql_reader;
GRANT USAGE ON SCHEMA public TO safesql_reader;

-- Tables don't exist yet at initdb time (data/seed.py creates them after
-- startup), so grant SELECT on anything the app role creates from now on.
ALTER DEFAULT PRIVILEGES FOR ROLE safesql_app IN SCHEMA public
    GRANT SELECT ON TABLES TO safesql_reader;

-- Also cover the case where seed.py has already run against this volume.
DO $$
BEGIN
    EXECUTE 'GRANT SELECT ON ALL TABLES IN SCHEMA public TO safesql_reader';
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
