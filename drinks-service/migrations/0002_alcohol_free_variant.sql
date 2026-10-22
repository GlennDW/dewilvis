-- Preserve the current menu and convert the legacy name marker into a flag.
ALTER TABLE drinks ADD COLUMN alcohol_free_variant INTEGER NOT NULL DEFAULT 0 CHECK(alcohol_free_variant IN (0,1));
UPDATE drinks SET alcohol_free_variant=1,name=rtrim(rtrim(rtrim(name),'*')),version=version+1 WHERE rtrim(name) LIKE '%*';
-- This legend is now derived from the available drinks in each category.
UPDATE categories SET footnote='' WHERE trim(footnote)='* Ook alcoholvrij verkrijgbaar.';
