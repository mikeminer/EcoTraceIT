# Shopify review screencast — reference 124465

Shopify requested a comprehensive English screencast that starts with installation and explains the setup and testing of every core EcoTraceIT workflow.

## Public review assets

- Video: `https://app.ecotraceit.com/app-store/ecotraceit-review-screencast.mp4`
- English captions: `https://app.ecotraceit.com/app-store/ecotraceit-review-screencast.en.vtt`
- Transcript: `https://app.ecotraceit.com/app-store/ecotraceit-review-screencast-transcript.md`

The historical `ecotraceit-screencast.mp4` path is also replaced during generation so any existing review or listing link receives the complete version.

## Demonstrated workflow

1. Install from the Shopify review link, approve scopes, and open the embedded app.
2. Save checkout estimate, Carbon Neutral, carrier, offset price, language, and privacy settings.
3. Review webhook-generated CO₂e, packaging savings, product/category statistics, and the storefront badge.
4. Create the responsible operator and a structured PPWR packaging dossier.
5. Link manufacturer/signatory data, supplier declarations, laboratory evidence, certificates, validity dates, and hashes.
6. Register reusable transport packaging and reverse-logistics lifecycle events.
7. Export EPR/CONAI support data by period and material.
8. Verify the Checkout UI extension and app-owned order metafields.
9. Review Free, Pro, and Enterprise Shopify-managed pricing.

## Regeneration

Capture the embedded app at 1600×900 into `public/app-store/demo-captures`, then run:

```powershell
python scripts/generate-review-screencast.py --ffmpeg C:\path\to\ffmpeg.exe
```

The generator uses an installed English Windows voice and burns the complete English narration into every frame. Generated MP4 output is H.264/AAC, 1600×900, and optimized for progressive web playback.
