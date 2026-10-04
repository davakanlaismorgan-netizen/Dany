/*
# Add subscriptions, notification_preferences tables + storage buckets

1. New Tables
- `subscriptions` — Tracks user subscription state (plan, status, billing period, payment method).
  - id (uuid, PK)
  - user_id (uuid, FK auth.users, owner)
  - plan (text: free/premium/enterprise)
  - status (text: active/canceled/past_due/trialing)
  - current_period_start (timestamptz)
  - current_period_end (timestamptz)
  - payment_method (text: stripe/mtn_momo/orange_money/wave/airtel_money)
  - payment_ref (text, external payment ID)
  - created_at, updated_at

- `notification_preferences` — Stores per-user notification settings.
  - id (uuid, PK)
  - user_id (uuid, FK auth.users, owner, unique)
  - model_training (boolean, default true)
  - report_generated (boolean, default true)
  - data_quality (boolean, default true)
  - weekly_summary (boolean, default false)
  - team_activity (boolean, default false)
  - channels (jsonb: which delivery channels per notification type)
  - created_at, updated_at

2. Security
- RLS enabled on both tables.
- Owner-scoped CRUD with auth.uid() = user_id.
- DEFAULT auth.uid() on user_id columns.

3. Storage
- Create `datasets` bucket (private) for uploaded data files.
- Create `avatars` bucket (public) for user profile pictures.
- Create `reports` bucket (private) for generated report files.
- Storage policies: users can manage files in their own folder path.
*/

-- ===== SUBSCRIPTIONS =====
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'active',
  current_period_start timestamptz DEFAULT now(),
  current_period_end timestamptz,
  payment_method text,
  payment_ref text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_subscriptions" ON subscriptions;
CREATE POLICY "select_own_subscriptions" ON subscriptions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_subscriptions" ON subscriptions;
CREATE POLICY "insert_own_subscriptions" ON subscriptions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_subscriptions" ON subscriptions;
CREATE POLICY "update_own_subscriptions" ON subscriptions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_subscriptions" ON subscriptions;
CREATE POLICY "delete_own_subscriptions" ON subscriptions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);

-- ===== NOTIFICATION PREFERENCES =====
CREATE TABLE IF NOT EXISTS notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  model_training boolean DEFAULT true,
  report_generated boolean DEFAULT true,
  data_quality boolean DEFAULT true,
  weekly_summary boolean DEFAULT false,
  team_activity boolean DEFAULT false,
  channels jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_notif_prefs" ON notification_preferences;
CREATE POLICY "select_own_notif_prefs" ON notification_preferences FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_notif_prefs" ON notification_preferences;
CREATE POLICY "insert_own_notif_prefs" ON notification_preferences FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_notif_prefs" ON notification_preferences;
CREATE POLICY "update_own_notif_prefs" ON notification_preferences FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_notif_prefs" ON notification_preferences;
CREATE POLICY "delete_own_notif_prefs" ON notification_preferences FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ===== STORAGE BUCKETS =====
INSERT INTO storage.buckets (id, name, public) VALUES ('datasets', 'datasets', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('reports', 'reports', false) ON CONFLICT (id) DO NOTHING;

-- Storage policies: users can CRUD files in their own folder
DROP POLICY IF EXISTS "Users can upload own datasets" ON storage.objects;
CREATE POLICY "Users can upload own datasets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'datasets' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can read own datasets" ON storage.objects;
CREATE POLICY "Users can read own datasets" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'datasets' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can delete own datasets" ON storage.objects;
CREATE POLICY "Users can delete own datasets" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'datasets' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Avatars (public read, owner write)
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
CREATE POLICY "Users can upload own avatar" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Anyone can read avatars" ON storage.objects;
CREATE POLICY "Anyone can read avatars" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
CREATE POLICY "Users can delete own avatar" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Reports (private, owner only)
DROP POLICY IF EXISTS "Users can upload own reports" ON storage.objects;
CREATE POLICY "Users can upload own reports" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'reports' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can read own reports" ON storage.objects;
CREATE POLICY "Users can read own reports" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'reports' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can delete own reports" ON storage.objects;
CREATE POLICY "Users can delete own reports" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'reports' AND (storage.foldername(name))[1] = auth.uid()::text);
