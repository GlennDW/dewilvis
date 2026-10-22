-- Keep the public menu, filters and management categories in the requested order.
UPDATE categories SET position=CASE id WHEN 'soft' THEN 0 WHEN 'beer-wine' THEN 1 WHEN 'zero' THEN 2 WHEN 'cocktails' THEN 3 WHEN 'zero-cocktails' THEN 4 WHEN 'spirits' THEN 5 WHEN 'warm' THEN 6 END WHERE id IN ('soft','beer-wine','zero','cocktails','zero-cocktails','spirits','warm');
