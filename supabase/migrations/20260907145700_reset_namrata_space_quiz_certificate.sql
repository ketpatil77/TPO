-- Reset Space Quiz certificate of Namrata back to pending proof verification
UPDATE certificates
SET verification_status = 'pending',
    verification_note = NULL,
    verified_at = NULL,
    verified_by = NULL
WHERE id IN (
  SELECT c.id
  FROM certificates c
  JOIN students s ON c.student_id = s.id
  WHERE (s.name ILIKE '%Namrata%' OR c.name ILIKE '%Space Quiz%')
    AND c.name ILIKE '%Space Quiz%'
);

