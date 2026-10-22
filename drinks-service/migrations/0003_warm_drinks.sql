-- Add a category without changing the existing drinks.
INSERT INTO categories(id,label,title,intro,footnote,position) VALUES('warm','Warme dranken','Warme dranken','','',(SELECT COALESCE(MAX(position),-1)+1 FROM categories));
