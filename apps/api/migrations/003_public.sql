-- Contenido público multilingüe (datos de demostración; edición futura desde el panel).
ALTER TABLE hotels ADD COLUMN public_info jsonb NOT NULL DEFAULT '{}';
ALTER TABLE room_types ADD COLUMN description_i18n jsonb NOT NULL DEFAULT '{}';
ALTER TABLE reservations ADD COLUMN guest_language text CHECK (guest_language IN ('ro','en','es','it','fr'));
GRANT UPDATE (public_info) ON hotels TO botiq_app;
