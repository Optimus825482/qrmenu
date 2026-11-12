-- Portuguese (pt) joins the guest languages: the four standard waiter-call options get their
-- Portuguese text. Options the hotel renamed or already translated are left untouched.
UPDATE "outlet_call_options" SET "translations" = "translations" || jsonb_build_object('pt', 'Guardanapos, por favor')
  WHERE "label" = 'Peçete istiyorum' AND NOT ("translations" ? 'pt');
UPDATE "outlet_call_options" SET "translations" = "translations" || jsonb_build_object('pt', 'Gostaria de fazer o pedido')
  WHERE "label" = 'Sipariş vereceğim' AND NOT ("translations" ? 'pt');
UPDATE "outlet_call_options" SET "translations" = "translations" || jsonb_build_object('pt', 'Água, por favor')
  WHERE "label" = 'Su istiyorum' AND NOT ("translations" ? 'pt');
UPDATE "outlet_call_options" SET "translations" = "translations" || jsonb_build_object('pt', 'A conta, por favor')
  WHERE "label" = 'Hesap' AND NOT ("translations" ? 'pt');
