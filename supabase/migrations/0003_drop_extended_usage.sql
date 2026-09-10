-- Remove the "may this be used beyond the film" flag.
--
-- The material is collected for the Abifilm only. Keeping a column nobody
-- fills would leave a field that could later be reinterpreted as permission
-- for the Abizeitung or social media, which is exactly the ambiguity the
-- decision was meant to remove. Consent that was never asked for cannot be
-- misread.

alter table submissions drop column if exists extended_usage;
