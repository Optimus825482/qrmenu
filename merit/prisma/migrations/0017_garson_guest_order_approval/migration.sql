-- Garson roles may approve guest QR orders from their assigned outlet's order queue.
UPDATE role_screen_permissions p
SET can_approve = true
FROM roles r, app_screens s
WHERE p.role_id = r.id
  AND p.screen_id = s.id
  AND r.code = 'R-GAR'
  AND s.code = 'QS-KUY';
