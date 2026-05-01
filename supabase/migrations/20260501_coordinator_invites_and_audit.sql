-- =============================================================
-- Klubbansvarlig-rolle, medkoordinator-invitasjoner, overdragelse,
-- og bootstrap-fix for første koordinator
-- =============================================================
-- Denne migreringen legger til:
--   1) coordinator_invites — invitasjons-tokens (UUID, 7 dagers
--      utløpstid, engangsbruk) for å invitere medkoordinatorer
--      eller klubbansvarlige.
--   2) role_changes — audit-trail. Insert kun via SECURITY DEFINER-
--      funksjoner; ingen INSERT-policy.
--   3) bootstrap_first_coordinator(team_id, club_id) — løser
--      chicken-and-egg-problemet for første koordinator på et lag.
--      Tabellen team_members har RLS som krever eksisterende rolle
--      for INSERT, så vi trenger SECURITY DEFINER for det aller
--      første rolle-tildelingen.
--   4) bootstrap_first_club_admin(club_id) — samme for klubbnivå-
--      bindingen. Bruker syntetisk team_id 'club:<uuid>' fordi
--      team_members.team_id er NOT NULL.
--   5) accept_coordinator_invite(token) — markerer invitasjon
--      akseptert og oppretter tilhørende team_members-rad.
--   6) remove_coordinator(team_id, target_user) — fjerner rolle.
--      Avviser sletting hvis det blir 0 koordinatorer igjen på
--      laget. Også brukt av "self_removed" når en koordinator
--      overdrar sin egen rolle.
--
-- Kjør i Supabase SQL Editor som éin transaksjon.
-- =============================================================

-- ------------------------------------------------------------
-- 1. coordinator_invites
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.coordinator_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token UUID NOT NULL DEFAULT gen_random_uuid(),
  team_id TEXT NOT NULL,
  club_id UUID,
  invite_type TEXT NOT NULL CHECK (invite_type IN ('coordinator', 'club_admin')),
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  invited_email TEXT NOT NULL,
  invited_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT coordinator_invites_unique_token UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS idx_coordinator_invites_token
  ON public.coordinator_invites(token);
CREATE INDEX IF NOT EXISTS idx_coordinator_invites_team
  ON public.coordinator_invites(team_id);
CREATE INDEX IF NOT EXISTS idx_coordinator_invites_club
  ON public.coordinator_invites(club_id);
CREATE INDEX IF NOT EXISTS idx_coordinator_invites_email
  ON public.coordinator_invites(invited_email);

ALTER TABLE public.coordinator_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coordinator_invites_select_inviter
  ON public.coordinator_invites;
CREATE POLICY coordinator_invites_select_inviter
  ON public.coordinator_invites FOR SELECT TO authenticated
  USING (invited_by = auth.uid());

DROP POLICY IF EXISTS coordinator_invites_select_team_member
  ON public.coordinator_invites;
CREATE POLICY coordinator_invites_select_team_member
  ON public.coordinator_invites FOR SELECT TO authenticated
  USING (team_id = ANY (auth_user_team_ids()));

DROP POLICY IF EXISTS coordinator_invites_select_by_token
  ON public.coordinator_invites;
CREATE POLICY coordinator_invites_select_by_token
  ON public.coordinator_invites FOR SELECT TO anon
  USING (status = 'pending' AND expires_at > now());

COMMENT ON POLICY coordinator_invites_select_by_token
  ON public.coordinator_invites IS
  'Intentionally permissive: enables anonymous lookup of pending invites by token for accept flow.';

DROP POLICY IF EXISTS coordinator_invites_insert_coordinator
  ON public.coordinator_invites;
CREATE POLICY coordinator_invites_insert_coordinator
  ON public.coordinator_invites FOR INSERT TO authenticated
  WITH CHECK (
    invited_by = auth.uid() AND
    (
      (invite_type = 'coordinator' AND team_id = ANY (auth_user_team_ids()))
      OR
      (invite_type = 'club_admin' AND club_id IN (
        SELECT tm.club_id FROM public.team_members tm
        WHERE tm.auth_user_id = auth.uid() AND tm.role = 'club_admin'
      ))
    )
  );

DROP POLICY IF EXISTS coordinator_invites_delete_own
  ON public.coordinator_invites;
CREATE POLICY coordinator_invites_delete_own
  ON public.coordinator_invites FOR DELETE TO authenticated
  USING (invited_by = auth.uid() AND status = 'pending');

-- ------------------------------------------------------------
-- 2. role_changes (audit-trail)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.role_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id TEXT NOT NULL,
  club_id UUID,
  action TEXT NOT NULL CHECK (action IN ('invited', 'accepted', 'transferred', 'removed', 'self_removed')),
  from_user UUID REFERENCES auth.users(id),
  to_user UUID REFERENCES auth.users(id),
  performed_by UUID NOT NULL REFERENCES auth.users(id),
  role TEXT NOT NULL CHECK (role IN ('coordinator', 'club_admin')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_role_changes_team
  ON public.role_changes(team_id);
CREATE INDEX IF NOT EXISTS idx_role_changes_club
  ON public.role_changes(club_id);
CREATE INDEX IF NOT EXISTS idx_role_changes_performed_by
  ON public.role_changes(performed_by);

ALTER TABLE public.role_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS role_changes_select_team_member
  ON public.role_changes;
CREATE POLICY role_changes_select_team_member
  ON public.role_changes FOR SELECT TO authenticated
  USING (
    team_id = ANY (auth_user_team_ids())
    OR club_id IN (
      SELECT tm.club_id FROM public.team_members tm
      WHERE tm.auth_user_id = auth.uid() AND tm.role = 'club_admin'
    )
  );

-- Ingen INSERT-policy: insert kun via SECURITY DEFINER-funksjoner.

-- ------------------------------------------------------------
-- 3. bootstrap_first_coordinator
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.bootstrap_first_coordinator(
  p_team_id TEXT,
  p_club_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_existing_count INT;
  v_new_member_id UUID;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated to bootstrap coordinator';
  END IF;

  SELECT COUNT(*) INTO v_existing_count
  FROM public.team_members
  WHERE team_id = p_team_id
    AND role IN ('coordinator', 'club_admin');

  IF v_existing_count > 0 THEN
    RAISE EXCEPTION 'Team already has at least one coordinator';
  END IF;

  INSERT INTO public.team_members (team_id, club_id, auth_user_id, role)
  VALUES (p_team_id, p_club_id, v_user_id, 'coordinator')
  RETURNING id INTO v_new_member_id;

  INSERT INTO public.role_changes (team_id, club_id, action, to_user, performed_by, role, notes)
  VALUES (p_team_id, p_club_id, 'accepted', v_user_id, v_user_id, 'coordinator',
          'Bootstrap: first coordinator on team creation');

  RETURN v_new_member_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bootstrap_first_coordinator(TEXT, UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_coordinator(TEXT, UUID) TO authenticated;

-- ------------------------------------------------------------
-- 4. bootstrap_first_club_admin
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.bootstrap_first_club_admin(
  p_club_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_existing_count INT;
  v_new_member_id UUID;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  SELECT COUNT(*) INTO v_existing_count
  FROM public.team_members
  WHERE club_id = p_club_id AND role = 'club_admin';

  IF v_existing_count > 0 THEN
    RAISE EXCEPTION 'Club already has a club_admin';
  END IF;

  -- Syntetisk team_id på klubbnivå: 'club:<uuid>'.
  -- team_members.team_id er NOT NULL, og club_admin er en klubb-
  -- skopet rolle som ikke binder seg til ett konkret lag.
  INSERT INTO public.team_members (team_id, club_id, auth_user_id, role)
  VALUES ('club:' || p_club_id::text, p_club_id, v_user_id, 'club_admin')
  RETURNING id INTO v_new_member_id;

  INSERT INTO public.role_changes (team_id, club_id, action, to_user, performed_by, role, notes)
  VALUES ('club:' || p_club_id::text, p_club_id, 'accepted', v_user_id, v_user_id,
          'club_admin', 'Bootstrap: first club_admin on club creation');

  RETURN v_new_member_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bootstrap_first_club_admin(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_club_admin(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 5. accept_coordinator_invite
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.accept_coordinator_invite(
  p_token UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.coordinator_invites%ROWTYPE;
  v_user_id UUID;
  v_team_id_for_log TEXT;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated to accept invite';
  END IF;

  SELECT * INTO v_invite FROM public.coordinator_invites
  WHERE token = p_token AND status = 'pending' AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found, expired, or already used';
  END IF;

  IF v_invite.invite_type = 'coordinator' THEN
    INSERT INTO public.team_members (team_id, club_id, auth_user_id, role)
    VALUES (v_invite.team_id, v_invite.club_id, v_user_id, 'coordinator')
    ON CONFLICT (team_id, auth_user_id, role) DO NOTHING;
    v_team_id_for_log := v_invite.team_id;
  ELSE
    INSERT INTO public.team_members (team_id, club_id, auth_user_id, role)
    VALUES ('club:' || v_invite.club_id::text, v_invite.club_id, v_user_id, 'club_admin')
    ON CONFLICT (team_id, auth_user_id, role) DO NOTHING;
    v_team_id_for_log := 'club:' || v_invite.club_id::text;
  END IF;

  UPDATE public.coordinator_invites
  SET status = 'accepted', accepted_at = now(), accepted_by = v_user_id
  WHERE id = v_invite.id;

  INSERT INTO public.role_changes (team_id, club_id, action, from_user, to_user, performed_by, role, notes)
  VALUES (v_team_id_for_log, v_invite.club_id, 'accepted',
          v_invite.invited_by, v_user_id, v_user_id,
          v_invite.invite_type, 'Invite accepted');

  RETURN jsonb_build_object(
    'success', true,
    'team_id', v_invite.team_id,
    'club_id', v_invite.club_id,
    'role', v_invite.invite_type
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_coordinator_invite(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.accept_coordinator_invite(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 6. remove_coordinator
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.remove_coordinator(
  p_team_id TEXT,
  p_target_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_caller_role TEXT;
  v_remaining_count INT;
  v_target_club_id UUID;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  SELECT role INTO v_caller_role FROM public.team_members
  WHERE team_id = p_team_id AND auth_user_id = v_user_id
    AND role IN ('coordinator', 'club_admin')
  LIMIT 1;

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Not authorized to remove coordinator from this team';
  END IF;

  SELECT COUNT(*) INTO v_remaining_count
  FROM public.team_members
  WHERE team_id = p_team_id AND role IN ('coordinator', 'club_admin')
    AND auth_user_id <> p_target_user_id;

  IF v_remaining_count < 1 THEN
    RAISE EXCEPTION 'Cannot remove last coordinator from team';
  END IF;

  SELECT club_id INTO v_target_club_id FROM public.team_members
  WHERE team_id = p_team_id AND auth_user_id = p_target_user_id
    AND role IN ('coordinator', 'club_admin')
  LIMIT 1;

  DELETE FROM public.team_members
  WHERE team_id = p_team_id
    AND auth_user_id = p_target_user_id
    AND role IN ('coordinator', 'club_admin');

  INSERT INTO public.role_changes (team_id, club_id, action, from_user, performed_by, role, notes)
  VALUES (
    p_team_id,
    v_target_club_id,
    CASE WHEN p_target_user_id = v_user_id THEN 'self_removed' ELSE 'removed' END,
    p_target_user_id,
    v_user_id,
    'coordinator',
    'Removed via remove_coordinator()'
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.remove_coordinator(TEXT, UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.remove_coordinator(TEXT, UUID) TO authenticated;
