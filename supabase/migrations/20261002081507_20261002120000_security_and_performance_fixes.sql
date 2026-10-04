/*
# Security & Performance Fixes

## Security
1. Revoke EXECUTE on handle_new_user from anon and authenticated (trigger function only)
2. Fix search_path on update_updated_at function
3. Revoke all privileges from anon role on all tables (app has sign-in, anon needs no access)

## Performance
4. Add indexes on all foreign key columns
*/

-- =====================================================
-- 1. Restrict handle_new_user — trigger function, not callable by clients
-- =====================================================
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;

-- =====================================================
-- 2. Fix search_path on update_updated_at (ALTER, not DROP — triggers depend on it)
-- =====================================================
ALTER FUNCTION public.update_updated_at() SET search_path = public;

-- =====================================================
-- 3. Revoke all privileges from anon on all authenticated-only tables
-- =====================================================
REVOKE ALL ON TABLE public.profiles FROM anon;
REVOKE ALL ON TABLE public.projects FROM anon;
REVOKE ALL ON TABLE public.datasets FROM anon;
REVOKE ALL ON TABLE public.pipelines FROM anon;
REVOKE ALL ON TABLE public.models FROM anon;
REVOKE ALL ON TABLE public.visualizations FROM anon;
REVOKE ALL ON TABLE public.reports FROM anon;
REVOKE ALL ON TABLE public.activity_log FROM anon;
REVOKE ALL ON TABLE public.ai_conversations FROM anon;
REVOKE ALL ON TABLE public.subscriptions FROM anon;
REVOKE ALL ON TABLE public.notification_preferences FROM anon;

-- =====================================================
-- 4. Add indexes on all foreign key columns
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_datasets_user_id ON public.datasets(user_id);
CREATE INDEX IF NOT EXISTS idx_datasets_project_id ON public.datasets(project_id);

CREATE INDEX IF NOT EXISTS idx_models_user_id ON public.models(user_id);
CREATE INDEX IF NOT EXISTS idx_models_project_id ON public.models(project_id);
CREATE INDEX IF NOT EXISTS idx_models_dataset_id ON public.models(dataset_id);

CREATE INDEX IF NOT EXISTS idx_pipelines_user_id ON public.pipelines(user_id);
CREATE INDEX IF NOT EXISTS idx_pipelines_project_id ON public.pipelines(project_id);

CREATE INDEX IF NOT EXISTS idx_visualizations_user_id ON public.visualizations(user_id);
CREATE INDEX IF NOT EXISTS idx_visualizations_project_id ON public.visualizations(project_id);
CREATE INDEX IF NOT EXISTS idx_visualizations_dataset_id ON public.visualizations(dataset_id);

CREATE INDEX IF NOT EXISTS idx_reports_user_id ON public.reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_project_id ON public.reports(project_id);

CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON public.activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON public.activity_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_id ON public.ai_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_updated_at ON public.ai_conversations(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_id ON public.notification_preferences(user_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON public.projects(created_at DESC);
