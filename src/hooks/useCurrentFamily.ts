import { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';

// useCurrentFamily — kanonisk oppslag av innlogget forelders familie
// via family_members.auth_user_id. Erstatter det gamle mønsteret
// som antok families.id = auth.uid() (som ikke lenger er tilfelle
// etter /claim-family-redesignet i commit a3b6fad + data-wipe i
// team_id-normaliseringsrunden).
//
// Tidligere hadde flere parent-komponenter hver sin kopi av denne
// lookup-logikken — inklusive en legacy-fallback som queryet
// families.id = user.id. Fallbacken er fjernet fordi ingen rader
// har det mønsteret etter wipen, og å beholde utestet kode bare
// skjuler eventuelle bugs.
//
// Bruk:
//   const fam = useCurrentFamily();
//   if (fam.loading) return <LoadingScreen />;
//   if (fam.unauthenticated) { window.location.href = '/login'; return null; }
//   if (fam.noFamily) { window.location.href = '/claim-family'; return null; }
//   // fam.familyId, fam.parentName er nå garantert satt
//
// Hook-en kjører kun én gang ved mount. Hvis du trenger å refreshe
// etter en mutasjon (f.eks. claim-flow), gjør en hard navigasjon
// eller lift state til parent — ikke kall useCurrentFamily flere
// ganger i samme komponent.

export interface CurrentFamilyState {
  /** Sant til oppslag er fullført. */
  loading: boolean;
  /** Sant hvis supabase.auth.getUser() returnerte null. */
  unauthenticated: boolean;
  /** Sant hvis bruker er innlogget men ikke har noen parent-rad i family_members. */
  noFamily: boolean;
  /** UUID til brukerens families-rad. Null før loading er ferdig eller hvis noFamily. */
  familyId: string | null;
  /** Navnet fra parent-raden (name-kolonne på family_members). Brukes til "Hei, {navn}"-hilsen. */
  parentName: string | null;
  /** UUID til selve parent-raden i family_members. Brukes av komponenter som vil oppdatere parent-rad (kontaktinfo osv). */
  parentRowId: string | null;
}

const INITIAL_STATE: CurrentFamilyState = {
  loading: true,
  unauthenticated: false,
  noFamily: false,
  familyId: null,
  parentName: null,
  parentRowId: null,
};

export function useCurrentFamily(): CurrentFamilyState {
  const [state, setState] = useState<CurrentFamilyState>(INITIAL_STATE);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;

      if (!user) {
        setState({
          loading: false,
          unauthenticated: true,
          noFamily: false,
          familyId: null,
          parentName: null,
          parentRowId: null,
        });
        return;
      }

      const { data: parentRow } = await supabase
        .from('family_members')
        .select('id, family_id, name')
        .eq('auth_user_id', user.id)
        .eq('role', 'parent')
        .maybeSingle();

      if (cancelled) return;

      if (!parentRow?.family_id) {
        setState({
          loading: false,
          unauthenticated: false,
          noFamily: true,
          familyId: null,
          parentName: null,
          parentRowId: null,
        });
        return;
      }

      setState({
        loading: false,
        unauthenticated: false,
        noFamily: false,
        familyId: parentRow.family_id,
        parentName: parentRow.name || null,
        parentRowId: parentRow.id,
      });
    })();

    return () => { cancelled = true; };
  }, []);

  return state;
}
