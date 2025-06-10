-- postgres-init.sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Funkcje pomocnicze
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$ language 'plpgsql';

-- Indeksy dla wydajności
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_created_at ON automation_jobs(created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_status_created ON automation_jobs(status, created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_interactions_job_created ON form_interactions(job_id, created_at);

-- Partycjonowanie dla dużych wolumenów
CREATE TABLE IF NOT EXISTS automation_jobs_archive (LIKE automation_jobs INCLUDING ALL);

-- Funkcja archiwizacji starych zadań
CREATE OR REPLACE FUNCTION archive_old_jobs()
RETURNS void AS $
BEGIN
    INSERT INTO automation_jobs_archive
    SELECT * FROM automation_jobs
    WHERE created_at < NOW() - INTERVAL '30 days';

    DELETE FROM automation_jobs
    WHERE created_at < NOW() - INTERVAL '30 days';
END;
$ LANGUAGE plpgsql;

-- Harmonogram archiwizacji (wymaga pg_cron)
-- SELECT cron.schedule('archive-jobs', '0 2 * * *', 'SELECT archive_old_jobs();');