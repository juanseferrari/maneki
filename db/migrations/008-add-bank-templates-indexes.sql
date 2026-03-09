-- Migration: 008-add-bank-templates-indexes.sql
-- Índices adicionales de performance para bank_templates

-- Índice compuesto para búsqueda por banco + tasa de éxito
CREATE INDEX idx_bank_templates_bank_success
  ON bank_templates(bank_id, success_rate DESC, usage_count DESC);

-- Índice para ordenar por última vez usado
CREATE INDEX idx_bank_templates_last_used
  ON bank_templates(last_used_at DESC NULLS LAST);

-- Índice parcial para templates activos (usados recientemente)
-- Nota: No podemos usar NOW() en índice parcial porque no es IMMUTABLE
-- En su lugar, filtramos en las queries cuando sea necesario

-- Función para limpiar templates con bajo rendimiento
CREATE OR REPLACE FUNCTION cleanup_poor_templates()
RETURNS void AS $$
BEGIN
  -- Eliminar templates con success_rate < 30% y más de 5 usos
  DELETE FROM bank_templates
  WHERE success_rate < 30.0
    AND usage_count >= 5
    AND last_used_at < NOW() - INTERVAL '7 days';

  RAISE NOTICE 'Cleaned up poor performing templates';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_poor_templates() IS 'Limpia templates con bajo rendimiento. Ejecutar manualmente: SELECT cleanup_poor_templates();';
