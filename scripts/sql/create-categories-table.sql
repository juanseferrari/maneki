-- =============================================
-- Categories Table for User-Defined Categories
-- =============================================

-- Create categories table (sin foreign key a auth.users para compatibilidad)
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#9CA3AF',
  icon TEXT, -- Optional, for future use
  description TEXT, -- Optional description
  parent_id UUID REFERENCES categories(id) ON DELETE SET NULL, -- For subcategories (future)
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_system BOOLEAN NOT NULL DEFAULT false, -- True for default categories
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure unique category names per user
  CONSTRAINT unique_category_name_per_user UNIQUE (user_id, name)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);

-- Enable RLS
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view their own categories" ON categories;
CREATE POLICY "Users can view their own categories" ON categories
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own categories" ON categories;
CREATE POLICY "Users can create their own categories" ON categories
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own categories" ON categories;
CREATE POLICY "Users can update their own categories" ON categories
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own categories" ON categories;
CREATE POLICY "Users can delete their own categories" ON categories
  FOR DELETE USING (auth.uid() = user_id);

-- Function to create default categories for a new user
CREATE OR REPLACE FUNCTION create_default_categories_for_user(p_user_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO categories (user_id, name, color, sort_order, is_system)
  VALUES
    (p_user_id, 'Sin categoría', '#9CA3AF', 0, true),
    (p_user_id, 'Alimentación', '#F59E0B', 1, true),
    (p_user_id, 'Transporte', '#3B82F6', 2, true),
    (p_user_id, 'Servicios', '#8B5CF6', 3, true),
    (p_user_id, 'Entretenimiento', '#EC4899', 4, true),
    (p_user_id, 'Salud', '#10B981', 5, true),
    (p_user_id, 'Educación', '#6366F1', 6, true),
    (p_user_id, 'Hogar', '#F97316', 7, true),
    (p_user_id, 'Impuestos', '#EF4444', 8, true),
    (p_user_id, 'Transferencias', '#14B8A6', 9, true),
    (p_user_id, 'Ingresos', '#22C55E', 10, true)
  ON CONFLICT (user_id, name) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger function to create default categories when a user profile is created
CREATE OR REPLACE FUNCTION trigger_create_default_categories()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM create_default_categories_for_user(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS on_user_created_create_categories ON users;

-- Create trigger on users table (fires when a new user is added)
CREATE TRIGGER on_user_created_create_categories
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION trigger_create_default_categories();

-- Grant access to service role for admin operations
GRANT ALL ON categories TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON categories TO authenticated;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS categories_updated_at ON categories;
CREATE TRIGGER categories_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW
  EXECUTE FUNCTION update_categories_updated_at();

-- =============================================
-- Insert default categories for your user directly
-- =============================================
INSERT INTO categories (user_id, name, color, sort_order, is_system)
VALUES
  ('f2aed59f-54dd-4d7b-91e0-8070b78eeb55', 'Sin categoría', '#9CA3AF', 0, true),
  ('f2aed59f-54dd-4d7b-91e0-8070b78eeb55', 'Alimentación', '#F59E0B', 1, true),
  ('f2aed59f-54dd-4d7b-91e0-8070b78eeb55', 'Transporte', '#3B82F6', 2, true),
  ('f2aed59f-54dd-4d7b-91e0-8070b78eeb55', 'Servicios', '#8B5CF6', 3, true),
  ('f2aed59f-54dd-4d7b-91e0-8070b78eeb55', 'Entretenimiento', '#EC4899', 4, true),
  ('f2aed59f-54dd-4d7b-91e0-8070b78eeb55', 'Salud', '#10B981', 5, true),
  ('f2aed59f-54dd-4d7b-91e0-8070b78eeb55', 'Educación', '#6366F1', 6, true),
  ('f2aed59f-54dd-4d7b-91e0-8070b78eeb55', 'Hogar', '#F97316', 7, true),
  ('f2aed59f-54dd-4d7b-91e0-8070b78eeb55', 'Impuestos', '#EF4444', 8, true),
  ('f2aed59f-54dd-4d7b-91e0-8070b78eeb55', 'Transferencias', '#14B8A6', 9, true),
  ('f2aed59f-54dd-4d7b-91e0-8070b78eeb55', 'Ingresos', '#22C55E', 10, true)
ON CONFLICT (user_id, name) DO NOTHING;
