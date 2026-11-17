-- RECONSTRUCTED CANDIDATE; NOT AUTHENTIC SOURCE; REVIEW ONLY
-- Historical SHA-256: 1944c163d1185e8bf606b411b305f36a0c732d76118934db0a9c57dbb5328f48
-- Legacy observed countries: CN/ID/PK; currencies CNY/IDR/PKR/USD; IDR functional.
BEGIN;
INSERT INTO public.countries (country_code,country_name,is_active) VALUES
 ('CN','China',true),('ID','Indonesia',true),('PK','Pakistan',true)
ON CONFLICT (country_code) DO UPDATE
SET country_name=EXCLUDED.country_name,is_active=true,updated_at=now();
INSERT INTO public.currencies (code,name,is_functional,is_active) VALUES
 ('CNY','Chinese Yuan Renminbi',false,true),
 ('IDR','Indonesian Rupiah',true,true),
 ('PKR','Pakistani Rupee',false,true),
 ('USD','US Dollar',false,true)
ON CONFLICT (code) DO UPDATE
SET name=EXCLUDED.name,is_functional=EXCLUDED.is_functional,
    is_active=true,updated_at=now();
COMMIT;
