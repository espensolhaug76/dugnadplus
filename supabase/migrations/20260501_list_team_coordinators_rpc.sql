-- =============================================================
-- list_team_coordinators(p_team_id) — SECURITY DEFINER RPC
-- =============================================================
-- RLS-policyen `team_members_select_own` (Steg F) begrenser SELECT
-- til auth_user_id = auth.uid(). Det betyr at en koordinator kan
-- ikke se andre koordinatorer på samme lag via direkte SELECT —
-- TeamCoordinatorsPage trenger derfor en SECURITY DEFINER-RPC for
-- å liste opp alle med coordinator/club_admin-rolle for et gitt
-- team_id, joined med auth.users for å få e-post + visningsnavn.
--
-- Tilgang: Funksjonen sjekker at caller selv har coordinator/
-- club_admin-rolle for laget før den returnerer noe. Dette gjør
-- at vi trygt kan eksponere e-post (samme team-medlemmer skal
-- uansett kunne kommunisere med hverandre).
--
-- Kjør i Supabase SQL Editor.
-- =============================================================

CREATE OR REPLACE FUNCTION public.list_team_coordinators(p_team_id TEXT)
RETURNS TABLE (
  team_member_id UUID,
  auth_user_id UUID,
  email TEXT,
  display_name TEXT,
  role TEXT,
  joined_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  SELECT tm.role INTO v_caller_role
  FROM public.team_members tm
  WHERE tm.team_id = p_team_id
    AND tm.auth_user_id = auth.uid()
    AND tm.role IN ('coordinator', 'club_admin')
  LIMIT 1;

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Not authorized to list coordinators for this team';
  END IF;

  RETURN QUERY
  SELECT
    tm.id,
    tm.auth_user_id,
    u.email::TEXT,
    COALESCE(
      u.raw_user_meta_data->>'full_name',
      u.email
    )::TEXT AS display_name,
    tm.role,
    tm.created_at
  FROM public.team_members tm
  LEFT JOIN auth.users u ON u.id = tm.auth_user_id
  WHERE tm.team_id = p_team_id
    AND tm.role IN ('coordinator', 'club_admin')
  ORDER BY tm.created_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_team_coordinators(TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.list_team_coordinators(TEXT) TO authenticated;
