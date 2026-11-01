UPDATE app_screens
SET name = CASE code
  WHEN 'QS-KUY' THEN 'Outlet Garson Ekranı'
  WHEN 'QS-KAS' THEN 'Outlet Kasa Ekranı'
  WHEN 'QS-KDS' THEN 'Outlet Mutfak Ekranı'
END
WHERE code IN ('QS-KUY', 'QS-KAS', 'QS-KDS');
