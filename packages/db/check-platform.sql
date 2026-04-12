SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'platform'
  AND table_name IN ('PlatformUser', 'AppAccess')
ORDER BY table_name;
