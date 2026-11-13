// Lists every outlet of the three Merit hotels with table / menu item counts. Run with cwd = merit.
(async () => {
  await import("dotenv/config");
  const { Client } = await import("pg");
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const cols = await c.query(
    "select table_name, column_name from information_schema.columns where table_name in ('outlets','menu_nodes','outlet_tables','hotels') and column_name in ('is_active','hotel_id','outlet_id','kind','qr_token','currency','code')",
  );
  console.log(cols.rows.map((r) => r.table_name + "." + r.column_name).join(" "));
  const r = await c.query(`
    select h.code, o.name, o.type, o.is_active, o.currency,
      (select count(*) from outlet_tables t where t.outlet_id = o.id) as tables,
      (select count(*) from outlet_tables t where t.outlet_id = o.id and t.qr_token is null) as no_qr,
      (select count(*) from menu_nodes n where n.outlet_id = o.id and n.kind = 'OGE') as items,
      (select count(*) from orders x where x.outlet_id = o.id) as orders
    from outlets o join hotels h on h.id = o.hotel_id
    where h.code in ('DIAMOND','ROYAL','PREMIUM') order by h.code, o.name`);
  console.table(r.rows);
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
