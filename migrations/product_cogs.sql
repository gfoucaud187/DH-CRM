-- product_cogs: tracks COGS history per SKU
CREATE TABLE IF NOT EXISTS product_cogs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sku TEXT NOT NULL,
  cogs NUMERIC(10,4) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_cogs_sku ON product_cogs(sku);
CREATE INDEX IF NOT EXISTS idx_product_cogs_sku_created ON product_cogs(sku, created_at DESC);

ALTER TABLE product_cogs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated users" ON product_cogs FOR ALL TO authenticated USING (true) WITH CHECK (true);
