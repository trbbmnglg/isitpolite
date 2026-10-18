-- Unlock codes carry a payment status so a PayPal capture that is still under
-- review ('pending') or later reversed/refunded ('revoked') can't spend credits.
-- Existing codes were all minted from completed captures, so they default to 'active'.
ALTER TABLE licenses ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
