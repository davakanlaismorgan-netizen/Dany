/*
# Security Fixes — Column-Level Restrictions + Audit Integrity

## Problems Fixed
1. profiles.plan and profiles.role were user-writable via Data API → plan/role escalation
2. subscriptions.plan/status were user-writable → free plan self-grant
3. activity_log had UPDATE/DELETE policies → audit trail tampering
4. No updated_at auto-update trigger on any table
5. handle_new_user didn't save company from signup metadata
6. team_members lacked unique constraint on (owner_id, member_email)
*/

-- ===== 1. PROFILES: Restrict UPDATE to safe columns only =====
-- Users can update their own profile, but NOT plan or role
REVOKE UPDATE ON profiles FROM authenticated;
GRANT UPDATE (full_name, avatar_url, company, preferred_language, phone, country, updated_at) ON profiles TO authenticated;

-- ===== 2. SUBSCRIPTIONS: Users can INSERT and SELECT but NOT UPDATE plan/status =====
-- Remove UPDATE and DELETE policies entirely — subscriptions are managed server-side
DROP POLICY IF EXISTS "update_own_subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "delete_own_subscriptions" ON subscriptions;

-- Revoke all UPDATE/DELETE on subscriptions from authenticated
REVOKE UPDATE ON subscriptions FROM authenticated;
REVOKE DELETE ON subscriptions FROM authenticated;

-- ===== 3. ACTIVITY LOG: Remove UPDATE/DELETE (audit integrity) =====
DROP POLICY IF EXISTS "update_own_activity" ON activity_log;
DROP POLICY IF EXISTS "delete_own_activity" ON activity_log;
REVOKE UPDATE ON activity_log FROM authenticated;
REVOKE DELETE ON activity_log FROM authenticated;

-- ===== 4. UPDATED_AT auto-update trigger =====
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at_profiles ON profiles;
CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_projects ON projects;
CREATE TRIGGER set_updated_at_projects
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_datasets ON datasets;
CREATE TRIGGER set_updated_at_datasets
  BEFORE UPDATE ON datasets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_pipelines ON pipelines;
CREATE TRIGGER set_updated_at_pipelines
  BEFORE UPDATE ON pipelines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_models ON models;
CREATE TRIGGER set_updated_at_models
  BEFORE UPDATE ON models
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_visualizations ON visualizations;
CREATE TRIGGER set_updated_at_visualizations
  BEFORE UPDATE ON visualizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_subscriptions ON subscriptions;
CREATE TRIGGER set_updated_at_subscriptions
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_notif_prefs ON notification_preferences;
CREATE TRIGGER set_updated_at_notif_prefs
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_ai_conversations ON ai_conversations;
CREATE TRIGGER set_updated_at_ai_conversations
  BEFORE UPDATE ON ai_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ===== 5. handle_new_user: also save company from metadata =====
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, company)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'company', NULL)
  );
  RETURN NEW;
END;
$$;

-- ===== 6. team_members: unique constraint =====
CREATE UNIQUE INDEX IF NOT EXISTS team_members_owner_email_unique
  ON team_members (owner_id, member_email);
