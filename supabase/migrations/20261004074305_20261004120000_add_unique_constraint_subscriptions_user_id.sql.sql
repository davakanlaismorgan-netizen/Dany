/*
# Add UNIQUE constraint on subscriptions.user_id

1. Changes
- Add UNIQUE constraint on `subscriptions.user_id` so that upsert (ON CONFLICT user_id) works correctly.
- This ensures each user has at most one subscription record, which is the expected behavior for the billing system.

2. Security
- No RLS policy changes. Existing owner-scoped policies remain intact.
*/

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_user_id_unique ON subscriptions(user_id);
