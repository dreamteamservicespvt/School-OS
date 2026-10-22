-- Which sensitive fields a role may see (Settings, Users & Permissions, one role:
-- normal, restricted or highly restricted; gap list G45). Every existing role
-- starts empty, which means "as before": each module keeps showing restricted
-- details to the same roles as until now, until a School Admin sets a level.
ALTER TABLE "role" ADD COLUMN "sensitive_fields" TEXT;
ALTER TABLE "role" ADD CONSTRAINT "role_sensitive_fields_level"
  CHECK ("sensitive_fields" IS NULL OR "sensitive_fields" IN ('normal', 'restricted', 'highly-restricted'));
