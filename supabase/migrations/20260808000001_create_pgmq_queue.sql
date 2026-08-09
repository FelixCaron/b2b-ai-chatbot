-- Create PGMQ Queue for ingestion pipeline
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pgmq.meta WHERE queue_name = 'ingestion_queue'
    ) THEN
        PERFORM pgmq.create('ingestion_queue');
    END IF;
END $$;
