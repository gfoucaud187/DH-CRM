-- =============================================================
-- CMS MULTILINGUAL MIGRATION
-- =============================================================

-- 1. Tables
CREATE TABLE IF NOT EXISTS languages (
  code        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  is_default  BOOLEAN DEFAULT false,
  is_active   BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS cms_labels (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace   TEXT NOT NULL,
  key         TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(namespace, key)
);

CREATE TABLE IF NOT EXISTS cms_translations (
  label_id          UUID REFERENCES cms_labels(id) ON DELETE CASCADE,
  lang_code         TEXT REFERENCES languages(code) ON DELETE CASCADE,
  value             TEXT NOT NULL,
  is_auto_translated BOOLEAN DEFAULT false,
  updated_at        TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (label_id, lang_code)
);

-- preferred_lang on user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS preferred_lang TEXT REFERENCES languages(code) DEFAULT 'fr';

-- 2. RLS
ALTER TABLE languages ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_translations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "languages_read" ON languages;
DROP POLICY IF EXISTS "cms_labels_read" ON cms_labels;
DROP POLICY IF EXISTS "cms_translations_read" ON cms_translations;
DROP POLICY IF EXISTS "cms_labels_write" ON cms_labels;
DROP POLICY IF EXISTS "cms_translations_write" ON cms_translations;

CREATE POLICY "languages_read"          ON languages         FOR SELECT USING (true);
CREATE POLICY "cms_labels_read"         ON cms_labels        FOR SELECT USING (true);
CREATE POLICY "cms_translations_read"   ON cms_translations  FOR SELECT USING (true);
CREATE POLICY "cms_labels_write"        ON cms_labels        FOR ALL    USING (true);
CREATE POLICY "cms_translations_write"  ON cms_translations  FOR ALL    USING (true);

-- 3. Seed languages
INSERT INTO languages (code, name, is_default, is_active) VALUES
  ('fr', 'Français', true,  true),
  ('en', 'English',  false, true),
  ('es', 'Español',  false, true),
  ('de', 'Deutsch',  false, true)
ON CONFLICT (code) DO NOTHING;

-- 4. Seed labels
INSERT INTO cms_labels (namespace, key, description) VALUES
  -- common
  ('common', 'save',           'Save button'),
  ('common', 'cancel',         'Cancel button'),
  ('common', 'delete',         'Delete button'),
  ('common', 'edit',           'Edit button'),
  ('common', 'add',            'Add button'),
  ('common', 'close',          'Close button or modal dismiss'),
  ('common', 'search',         'Search input placeholder'),
  ('common', 'loading',        'Loading state text'),
  ('common', 'error',          'Generic error message'),
  ('common', 'new',            'New item button label'),
  ('common', 'export',         'Export action'),
  ('common', 'import',         'Import action'),
  ('common', 'actions',        'Actions dropdown label'),
  ('common', 'active',         'Active status badge'),
  ('common', 'inactive',       'Inactive status badge'),
  ('common', 'name',           'Name field label'),
  ('common', 'email',          'Email field label'),
  ('common', 'phone',          'Phone field label'),
  ('common', 'address',        'Address field label'),
  ('common', 'city',           'City field label'),
  ('common', 'country',        'Country field label'),
  ('common', 'notes',          'Notes field label'),
  ('common', 'status',         'Status field label'),
  ('common', 'date',           'Date field label'),
  ('common', 'total',          'Total amount label'),
  ('common', 'yes',            'Yes confirmation'),
  ('common', 'no',             'No confirmation'),
  ('common', 'confirm_delete', 'Confirm delete dialog message'),
  ('common', 'no_results',     'Empty search results message'),
  ('common', 'required',       'Required field indicator'),
  ('common', 'optional',       'Optional field indicator'),
  ('common', 'filters',        'Filters section label'),
  ('common', 'clear',          'Clear filters or input'),
  ('common', 'save_changes',   'Save changes button'),
  ('common', 'back',           'Back navigation'),
  ('common', 'next',           'Next step'),
  ('common', 'previous',       'Previous step'),
  ('common', 'view',           'View details button'),
  ('common', 'duplicate',      'Duplicate item action'),
  ('common', 'download',       'Download file action'),
  ('common', 'upload',         'Upload file action'),
  ('common', 'print',          'Print action'),
  ('common', 'preview',        'Preview action'),
  ('common', 'quantity',       'Quantity field label'),
  ('common', 'price',          'Price field label'),
  ('common', 'currency',       'Currency field label'),
  -- nav
  ('nav', 'dashboard',        'Dashboard nav item'),
  ('nav', 'products',         'Products nav item'),
  ('nav', 'clients',          'Clients nav item'),
  ('nav', 'retailers',        'Retailers nav item'),
  ('nav', 'partners',         'Partners nav item'),
  ('nav', 'price_lists',      'Price Lists nav item'),
  ('nav', 'orders',           'Orders nav item'),
  ('nav', 'purchase_orders',  'Purchase Orders nav item'),
  ('nav', 'inventory',        'Inventory nav item'),
  ('nav', 'finance',          'Finance nav item'),
  ('nav', 'documents',        'Documents nav item'),
  ('nav', 'reports',          'Reports nav item'),
  ('nav', 'targets',          'Targets nav item'),
  ('nav', 'tracking',         'Tracking Log nav item'),
  ('nav', 'settings',         'Settings nav item'),
  ('nav', 'cms',              'Content Management nav item')
ON CONFLICT (namespace, key) DO NOTHING;

-- 5. Seed FR translations
INSERT INTO cms_translations (label_id, lang_code, value)
SELECT l.id, 'fr', v.val
FROM cms_labels l
JOIN (VALUES
  ('common','save',           'Enregistrer'),
  ('common','cancel',         'Annuler'),
  ('common','delete',         'Supprimer'),
  ('common','edit',           'Modifier'),
  ('common','add',            'Ajouter'),
  ('common','close',          'Fermer'),
  ('common','search',         'Rechercher...'),
  ('common','loading',        'Chargement...'),
  ('common','error',          'Une erreur s''est produite'),
  ('common','new',            'Nouveau'),
  ('common','export',         'Exporter'),
  ('common','import',         'Importer'),
  ('common','actions',        'Actions'),
  ('common','active',         'Actif'),
  ('common','inactive',       'Inactif'),
  ('common','name',           'Nom'),
  ('common','email',          'Email'),
  ('common','phone',          'Téléphone'),
  ('common','address',        'Adresse'),
  ('common','city',           'Ville'),
  ('common','country',        'Pays'),
  ('common','notes',          'Notes'),
  ('common','status',         'Statut'),
  ('common','date',           'Date'),
  ('common','total',          'Total'),
  ('common','yes',            'Oui'),
  ('common','no',             'Non'),
  ('common','confirm_delete', 'Êtes-vous sûr de vouloir supprimer cet élément ?'),
  ('common','no_results',     'Aucun résultat'),
  ('common','required',       'Requis'),
  ('common','optional',       'Optionnel'),
  ('common','filters',        'Filtres'),
  ('common','clear',          'Effacer'),
  ('common','save_changes',   'Enregistrer les modifications'),
  ('common','back',           'Retour'),
  ('common','next',           'Suivant'),
  ('common','previous',       'Précédent'),
  ('common','view',           'Voir'),
  ('common','duplicate',      'Dupliquer'),
  ('common','download',       'Télécharger'),
  ('common','upload',         'Téléverser'),
  ('common','print',          'Imprimer'),
  ('common','preview',        'Aperçu'),
  ('common','quantity',       'Quantité'),
  ('common','price',          'Prix'),
  ('common','currency',       'Devise'),
  ('nav','dashboard',         'Tableau de bord'),
  ('nav','products',          'Produits'),
  ('nav','clients',           'Clients'),
  ('nav','retailers',         'Revendeurs'),
  ('nav','partners',          'Partenaires'),
  ('nav','price_lists',       'Tarifs'),
  ('nav','orders',            'Commandes'),
  ('nav','purchase_orders',   'Bons de commande'),
  ('nav','inventory',         'Inventaire'),
  ('nav','finance',           'Finance'),
  ('nav','documents',         'Documents'),
  ('nav','reports',           'Rapports'),
  ('nav','targets',           'Objectifs'),
  ('nav','tracking',          'Journal de suivi'),
  ('nav','settings',          'Paramètres'),
  ('nav','cms',               'Gestion de contenu')
) AS v(ns, k, val) ON l.namespace = v.ns AND l.key = v.k
ON CONFLICT (label_id, lang_code) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- 6. Seed EN translations
INSERT INTO cms_translations (label_id, lang_code, value)
SELECT l.id, 'en', v.val
FROM cms_labels l
JOIN (VALUES
  ('common','save',           'Save'),
  ('common','cancel',         'Cancel'),
  ('common','delete',         'Delete'),
  ('common','edit',           'Edit'),
  ('common','add',            'Add'),
  ('common','close',          'Close'),
  ('common','search',         'Search...'),
  ('common','loading',        'Loading...'),
  ('common','error',          'An error occurred'),
  ('common','new',            'New'),
  ('common','export',         'Export'),
  ('common','import',         'Import'),
  ('common','actions',        'Actions'),
  ('common','active',         'Active'),
  ('common','inactive',       'Inactive'),
  ('common','name',           'Name'),
  ('common','email',          'Email'),
  ('common','phone',          'Phone'),
  ('common','address',        'Address'),
  ('common','city',           'City'),
  ('common','country',        'Country'),
  ('common','notes',          'Notes'),
  ('common','status',         'Status'),
  ('common','date',           'Date'),
  ('common','total',          'Total'),
  ('common','yes',            'Yes'),
  ('common','no',             'No'),
  ('common','confirm_delete', 'Are you sure you want to delete this item?'),
  ('common','no_results',     'No results found'),
  ('common','required',       'Required'),
  ('common','optional',       'Optional'),
  ('common','filters',        'Filters'),
  ('common','clear',          'Clear'),
  ('common','save_changes',   'Save changes'),
  ('common','back',           'Back'),
  ('common','next',           'Next'),
  ('common','previous',       'Previous'),
  ('common','view',           'View'),
  ('common','duplicate',      'Duplicate'),
  ('common','download',       'Download'),
  ('common','upload',         'Upload'),
  ('common','print',          'Print'),
  ('common','preview',        'Preview'),
  ('common','quantity',       'Quantity'),
  ('common','price',          'Price'),
  ('common','currency',       'Currency'),
  ('nav','dashboard',         'Dashboard'),
  ('nav','products',          'Products'),
  ('nav','clients',           'Clients'),
  ('nav','retailers',         'Retailers'),
  ('nav','partners',          'Partners'),
  ('nav','price_lists',       'Price Lists'),
  ('nav','orders',            'Orders'),
  ('nav','purchase_orders',   'Purchase Orders'),
  ('nav','inventory',         'Inventory'),
  ('nav','finance',           'Finance'),
  ('nav','documents',         'Documents'),
  ('nav','reports',           'Reports'),
  ('nav','targets',           'Targets'),
  ('nav','tracking',          'Tracking Log'),
  ('nav','settings',          'Settings'),
  ('nav','cms',               'Content Management')
) AS v(ns, k, val) ON l.namespace = v.ns AND l.key = v.k
ON CONFLICT (label_id, lang_code) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
