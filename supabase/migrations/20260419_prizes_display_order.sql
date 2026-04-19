-- Dugnad+ — prizes.display_order for drag-and-drop sortering
-- Dato: 2026-04-19

ALTER TABLE public.prizes
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.prizes.display_order IS
  'Sorteringsrekkefølge satt av koordinator via drag-and-drop i LotteryAdmin. Lavere = høyere i listen.';
