-- The four standard waiter-call options were seeded before French, Greek and Italian joined the guest
-- languages, so those guests still saw the Turkish label. Fills the three languages in with the same text
-- new outlets get (DEFAULT_CALL_OPTIONS). Options the hotel renamed or already translated are left untouched.
UPDATE "outlet_call_options" SET "translations" = jsonb_build_object(
    'fr', 'Des serviettes, s''il vous plaît', 'el', 'Χαρτοπετσέτες, παρακαλώ', 'it', 'Tovaglioli, per favore') || "translations"
  WHERE "label" = 'Peçete istiyorum' AND NOT ("translations" ?& array['fr', 'el', 'it']);
UPDATE "outlet_call_options" SET "translations" = jsonb_build_object(
    'fr', 'Je voudrais commander', 'el', 'Θα ήθελα να παραγγείλω', 'it', 'Vorrei ordinare') || "translations"
  WHERE "label" = 'Sipariş vereceğim' AND NOT ("translations" ?& array['fr', 'el', 'it']);
UPDATE "outlet_call_options" SET "translations" = jsonb_build_object(
    'fr', 'De l''eau, s''il vous plaît', 'el', 'Νερό, παρακαλώ', 'it', 'Acqua, per favore') || "translations"
  WHERE "label" = 'Su istiyorum' AND NOT ("translations" ?& array['fr', 'el', 'it']);
UPDATE "outlet_call_options" SET "translations" = jsonb_build_object(
    'fr', 'L''addition, s''il vous plaît', 'el', 'Το λογαριασμό, παρακαλώ', 'it', 'Il conto, per favore') || "translations"
  WHERE "label" = 'Hesap' AND NOT ("translations" ?& array['fr', 'el', 'it']);
