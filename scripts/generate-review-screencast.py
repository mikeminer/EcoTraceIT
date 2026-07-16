#!/usr/bin/env python3
"""Build the English Shopify review screencast from real EcoTraceIT captures.

The generated video contains an English narration and permanently burned-in
English captions. Source screenshots are captured from the embedded app in the
EcoTraceIT development store; synthetic frames are clearly instructional.
"""

from __future__ import annotations

import argparse
import glob
import math
import shutil
import subprocess
import textwrap
import wave
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


WIDTH = 1600
HEIGHT = 900
GREEN = "#123f32"
GREEN_2 = "#1f6f54"
EARTH = "#d5b36a"
CREAM = "#f5f3eb"
INK = "#17312a"
WHITE = "#ffffff"


@dataclass(frozen=True)
class Slide:
    slug: str
    title: str
    narration: str
    screenshot: str | None = None
    kind: str = "screenshot"


SLIDES = [
    Slide(
        "01-title",
        "EcoTraceIT — complete Shopify review demo",
        "This is the complete EcoTraceIT review demo. It covers installation, initial setup, checkout, carbon estimates, PPWR packaging records, supply-chain evidence, reusable packaging, EPR and CONAI exports, and Shopify-managed billing.",
        kind="title",
    ),
    Slide(
        "02-install",
        "1. Install and open inside Shopify Admin",
        "Install EcoTraceIT from Shopify's review link and approve the requested scopes. The app then opens embedded inside Shopify Admin. There is no separate account, and the Free plan requires no card. Start the setup from Settings.",
        kind="install",
    ),
    Slide(
        "03-settings",
        "2. Complete the initial setup",
        "In Settings, choose English, enable the checkout carbon estimate, optionally enable Carbon Neutral on Pro, select the default carrier, set the offset price, and choose Save. For privacy, EcoTraceIT stores only a postal prefix for calculations and does not persist customer names, email addresses, or full addresses.",
        screenshot="02-settings.png",
    ),
    Slide(
        "04-dashboard",
        "3. Review automated order impact",
        "The dashboard opens immediately after setup. Order-created and order-updated webhooks estimate carbon emissions from order weight, destination prefix, and carrier. Monthly metrics, product and category breakdowns, packaging savings, and the storefront badge are displayed here.",
        screenshot="03-dashboard.png",
    ),
    Slide(
        "05-ppwr",
        "4. Build a traceable PPWR packaging dossier",
        "In PPWR, first enter the responsible economic operator. Then create a packaging dossier with dimensions, empty weight, material layers, recycled content, recyclability evidence, minimization fields, reusable status, and food-contact details where applicable. EcoTraceIT supports operational record keeping and does not replace legal advice.",
        screenshot="04-ppwr.png",
    ),
    Slide(
        "06-supply-chain",
        "5. Link suppliers, laboratory evidence and signatures",
        "The Suppliers and Tests workspace records the manufacturer or authorised responsible signatory, supplier declarations, laboratory test evidence, certificate identifiers, validity dates, and file hashes. These records create a traceable evidence trail for each packaging dossier.",
        screenshot="05-supply-chain.png",
    ),
    Slide(
        "07-reuse",
        "6. Track reusable transport packaging",
        "For reusable transport packaging, register each serialised or QR-coded unit against a declared profile. Then record shipment, return, inspection, cleaning, repair, and end-of-life events. EcoTraceIT counts completed rotations and preserves the reverse-logistics history.",
        screenshot="06-reuse.png",
    ),
    Slide(
        "08-epr",
        "7. Export EPR and CONAI support data",
        "The EPR and CONAI report aggregates packaging placed on the market by material and weight for the selected period. Choose the dates and download the CSV to support the merchant's declaration workflow. The report is supporting data and is not itself a CONAI filing.",
        screenshot="07-epr.png",
    ),
    Slide(
        "09-checkout",
        "8. Show the estimate and Carbon Neutral option",
        "At checkout, the UI extension reads a lightweight estimate and displays the order's kilograms of carbon dioxide equivalent without blocking checkout. When enabled and supported by the merchant's plan, the buyer can select the Carbon Neutral option. Results are saved to app-owned order metafields for the admin view.",
        kind="checkout",
    ),
    Slide(
        "10-pricing",
        "9. Use Shopify-managed pricing",
        "Billing remains inside Shopify. Free includes the base calculation. Pro is twenty-nine euros per month and unlocks advanced reports and offset options. Enterprise supports high volumes and usage-based components. The merchant confirms any charge through Shopify's managed pricing flow.",
        screenshot="08-pricing.png",
    ),
    Slide(
        "11-review-checklist",
        "Setup complete — reviewer test checklist",
        "Setup is complete. To test the full workflow, save the defaults in Settings; create or update a test order with product weights; inspect the dashboard and order block; complete a PPWR dossier; add supply-chain evidence; register a reusable unit; export EPR data; and verify the checkout extension on an eligible checkout.",
        kind="checklist",
    ),
]


def font_path(*names: str) -> str | None:
    candidates: list[Path] = []
    windows_fonts = Path("C:/Windows/Fonts")
    for name in names:
        candidates.extend([windows_fonts / name, Path("/usr/share/fonts/truetype/dejavu") / name])
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    return None


REGULAR = font_path("segoeui.ttf", "DejaVuSans.ttf")
SEMIBOLD = font_path("seguisb.ttf", "DejaVuSans-Bold.ttf") or REGULAR
BOLD = font_path("segoeuib.ttf", "DejaVuSans-Bold.ttf") or SEMIBOLD


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    path = BOLD if bold else REGULAR
    return ImageFont.truetype(path, size) if path else ImageFont.load_default()


def text_width(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont) -> float:
    box = draw.textbbox((0, 0), text, font=font)
    return box[2] - box[0]


def wrap_pixels(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = word if not current else f"{current} {word}"
        if text_width(draw, candidate, font) <= width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def contain(image: Image.Image, width: int, height: int) -> Image.Image:
    source = image.convert("RGB")
    ratio = min(width / source.width, height / source.height)
    size = (round(source.width * ratio), round(source.height * ratio))
    return source.resize(size, Image.Resampling.LANCZOS)


def add_caption(canvas: Image.Image, slide: Slide, index: int) -> None:
    overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.rounded_rectangle((36, 26, 750, 92), radius=20, fill=(18, 63, 50, 244))
    step = f"{index + 1:02d} / {len(SLIDES):02d}"
    draw.text((62, 45), step, font=load_font(22, True), fill=EARTH)
    draw.text((160, 42), slide.title, font=load_font(26, True), fill=WHITE)

    caption_top = 635
    draw.rounded_rectangle((36, caption_top, WIDTH - 36, HEIGHT - 30), radius=24, fill=(12, 47, 38, 246))
    caption_size = 29
    caption_font = load_font(caption_size)
    lines = wrap_pixels(draw, slide.narration, caption_font, WIDTH - 152)
    while len(lines) > 6 and caption_size > 23:
        caption_size -= 1
        caption_font = load_font(caption_size)
        lines = wrap_pixels(draw, slide.narration, caption_font, WIDTH - 152)
    line_height = caption_size + 10
    total_height = len(lines) * line_height
    y = caption_top + max(28, ((HEIGHT - 30 - caption_top) - total_height) // 2)
    for line in lines:
        draw.text((76, y), line, font=caption_font, fill=WHITE)
        y += line_height
    canvas.alpha_composite(overlay)


def draw_brand_mark(draw: ImageDraw.ImageDraw, x: int, y: int, size: int) -> None:
    draw.rounded_rectangle((x, y, x + size, y + size), radius=size // 4, fill=GREEN_2)
    leaf = [(x + size * 0.25, y + size * 0.64), (x + size * 0.48, y + size * 0.23), (x + size * 0.78, y + size * 0.28), (x + size * 0.70, y + size * 0.62)]
    draw.polygon(leaf, fill=CREAM)
    draw.line((x + size * 0.34, y + size * 0.70, x + size * 0.66, y + size * 0.35), fill=GREEN, width=max(3, size // 20))


def base_branded_frame() -> Image.Image:
    canvas = Image.new("RGBA", (WIDTH, HEIGHT), CREAM)
    draw = ImageDraw.Draw(canvas)
    for y in range(HEIGHT):
        blend = y / HEIGHT
        color = (
            round(245 - 17 * blend),
            round(243 - 24 * blend),
            round(235 - 22 * blend),
            255,
        )
        draw.line((0, y, WIDTH, y), fill=color)
    draw.ellipse((1120, -210, 1740, 410), fill=(31, 111, 84, 28))
    draw.ellipse((-260, 590, 420, 1270), fill=(213, 179, 106, 35))
    return canvas


def render_custom(slide: Slide) -> Image.Image:
    canvas = base_branded_frame()
    draw = ImageDraw.Draw(canvas)
    draw_brand_mark(draw, 100, 80, 92)
    draw.text((218, 98), "EcoTraceIT", font=load_font(48, True), fill=GREEN)

    if slide.kind == "title":
        draw.text((100, 255), "Complete Shopify", font=load_font(70, True), fill=GREEN)
        draw.text((100, 340), "App Review Demo", font=load_font(70, True), fill=GREEN_2)
        draw.text((104, 455), "Installation → setup → checkout → PPWR → reporting", font=load_font(34), fill=INK)
        draw.rounded_rectangle((100, 548, 770, 620), radius=25, fill=GREEN)
        draw.text((135, 565), "English narration + burned-in captions", font=load_font(28, True), fill=WHITE)
    elif slide.kind == "install":
        draw.text((100, 220), "Install in three steps", font=load_font(58, True), fill=GREEN)
        items = [
            ("1", "Open the Shopify review installation link"),
            ("2", "Approve the requested Shopify scopes"),
            ("3", "EcoTraceIT opens embedded in Shopify Admin"),
        ]
        for row, (number, label) in enumerate(items):
            y = 340 + row * 118
            draw.ellipse((108, y, 172, y + 64), fill=GREEN_2)
            draw.text((130, y + 12), number, font=load_font(28, True), fill=WHITE)
            draw.text((205, y + 8), label, font=load_font(32, row == 2), fill=INK)
        draw.text((105, 704), "No separate account  •  Free plan: no card required", font=load_font(27, True), fill=GREEN)
    elif slide.kind == "checkout":
        draw.text((100, 198), "EcoTraceIT at checkout", font=load_font(54, True), fill=GREEN)
        draw.rounded_rectangle((104, 292, 1010, 640), radius=28, fill=WHITE, outline=(202, 213, 207), width=3)
        draw.text((150, 330), "Environmental impact", font=load_font(34, True), fill=INK)
        draw.rounded_rectangle((150, 402, 480, 478), radius=22, fill=(227, 244, 235), outline=(31, 111, 84), width=2)
        draw.text((182, 421), "1.84 kg CO₂e", font=load_font(31, True), fill=GREEN)
        draw.rounded_rectangle((150, 520, 192, 562), radius=8, fill=WHITE, outline=(50, 80, 67), width=3)
        draw.text((222, 518), "Make this order Carbon Neutral", font=load_font(30, True), fill=INK)
        draw.text((222, 565), "Optional merchant-configured contribution", font=load_font(24), fill=(82, 96, 89))
        draw.rounded_rectangle((1080, 300, 1490, 620), radius=28, fill=GREEN)
        draw.text((1140, 354), "Fast by design", font=load_font(34, True), fill=WHITE)
        bullets = ["Lightweight UI extension", "Non-blocking estimate", "App-owned metafields", "No customer PII stored"]
        for idx, bullet in enumerate(bullets):
            y = 430 + idx * 50
            draw.ellipse((1138, y + 7, 1152, y + 21), fill=EARTH)
            draw.text((1170, y), bullet, font=load_font(24), fill=WHITE)
    elif slide.kind == "checklist":
        draw.text((100, 205), "Reviewer test path", font=load_font(58, True), fill=GREEN)
        checks = [
            "Save Settings",
            "Create or update a weighted test order",
            "Inspect Dashboard and Admin order block",
            "Create a PPWR dossier and evidence records",
            "Register reuse events and export EPR / CONAI CSV",
            "Verify the Checkout UI extension",
        ]
        for idx, label in enumerate(checks):
            column = 0 if idx < 3 else 1
            row = idx if idx < 3 else idx - 3
            x = 110 + column * 750
            y = 330 + row * 108
            draw.ellipse((x, y, x + 48, y + 48), fill=GREEN_2)
            draw.line((x + 13, y + 25, x + 22, y + 35, x + 38, y + 14), fill=WHITE, width=5, joint="curve")
            wrapped = textwrap.wrap(label, width=37)
            for line_index, line in enumerate(wrapped):
                draw.text((x + 70, y - 1 + line_index * 31), line, font=load_font(25, True), fill=INK)
        draw.rounded_rectangle((100, 700, 920, 770), radius=22, fill=GREEN)
        draw.text((135, 716), "All core workflows remain inside Shopify Admin", font=load_font(28, True), fill=WHITE)
    return canvas


def render_screenshot(slide: Slide, captures_dir: Path) -> Image.Image:
    source_path = captures_dir / str(slide.screenshot)
    if not source_path.exists():
        raise FileNotFoundError(f"Missing capture: {source_path}")
    source = Image.open(source_path)
    fitted = contain(source, WIDTH, HEIGHT)
    canvas = Image.new("RGBA", (WIDTH, HEIGHT), (224, 230, 226, 255))
    canvas.paste(fitted, ((WIDTH - fitted.width) // 2, (HEIGHT - fitted.height) // 2))
    return canvas


def find_ffmpeg(explicit: str | None) -> str:
    candidates = [explicit, shutil.which("ffmpeg")]
    candidates.extend(glob.glob(str(Path.home() / "AppData/Local/ms-playwright/ffmpeg-*/ffmpeg-win64.exe")))
    candidates.extend(["C:/tmp/ecotraceit-ffmpeg.exe", "C:/tmp/ecotraceit-video-tools/node_modules/ffmpeg-static/ffmpeg.exe"])
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return str(Path(candidate))
    raise FileNotFoundError("FFmpeg not found. Pass --ffmpeg with the absolute binary path.")


def timestamp(seconds: float) -> str:
    milliseconds = round(seconds * 1000)
    hours, milliseconds = divmod(milliseconds, 3_600_000)
    minutes, milliseconds = divmod(milliseconds, 60_000)
    secs, milliseconds = divmod(milliseconds, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{milliseconds:03d}"


def quote_concat(path: Path) -> str:
    return str(path.resolve()).replace("\\", "/").replace("'", "'\\''")


def synthesize(slides_dir: Path, repo_root: Path) -> tuple[list[float], Path]:
    pwsh = shutil.which("pwsh") or shutil.which("powershell")
    if not pwsh:
        raise FileNotFoundError("PowerShell is required for the local English narration.")
    synth_script = repo_root / "scripts/synthesize-review-narration.ps1"
    wav_paths: list[Path] = []
    for slide in SLIDES:
        text_path = slides_dir / f"{slide.slug}.txt"
        wav_path = slides_dir / f"{slide.slug}.wav"
        text_path.write_text(slide.narration, encoding="utf-8")
        subprocess.run(
            [pwsh, "-NoProfile", "-File", str(synth_script), "-TextPath", str(text_path), "-OutputPath", str(wav_path)],
            check=True,
        )
        wav_paths.append(wav_path)

    combined_path = slides_dir / "narration.wav"
    durations: list[float] = []
    output_wave: wave.Wave_write | None = None
    try:
        for wav_path in wav_paths:
            with wave.open(str(wav_path), "rb") as source:
                params = source.getparams()
                frames = source.readframes(params.nframes)
                if output_wave is None:
                    output_wave = wave.open(str(combined_path), "wb")
                    output_wave.setparams(params)
                elif (
                    output_wave.getnchannels() != params.nchannels
                    or output_wave.getsampwidth() != params.sampwidth
                    or output_wave.getframerate() != params.framerate
                ):
                    raise RuntimeError("Narration WAV formats do not match")
                output_wave.writeframes(frames)
                padding_seconds = 1.35
                padding_frames = math.ceil(params.framerate * padding_seconds)
                silence = b"\x00" * padding_frames * params.nchannels * params.sampwidth
                output_wave.writeframes(silence)
                durations.append(params.nframes / params.framerate + padding_seconds)
    finally:
        if output_wave is not None:
            output_wave.close()
    return durations, combined_path


def write_accessibility_files(output_dir: Path, durations: list[float]) -> None:
    cursor = 0.0
    vtt = ["WEBVTT", ""]
    transcript = ["# EcoTraceIT Shopify review screencast transcript", ""]
    for index, (slide, duration) in enumerate(zip(SLIDES, durations, strict=True), start=1):
        end = cursor + duration
        vtt.extend([f"{timestamp(cursor)} --> {timestamp(end)}", slide.narration, ""])
        transcript.extend([f"## {index}. {slide.title}", "", slide.narration, ""])
        cursor = end
    (output_dir / "ecotraceit-review-screencast.en.vtt").write_text("\n".join(vtt), encoding="utf-8")
    (output_dir / "ecotraceit-review-screencast-transcript.md").write_text("\n".join(transcript), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ffmpeg", help="Absolute path to FFmpeg")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    output_dir = repo_root / "public/app-store"
    captures_dir = output_dir / "demo-captures"
    slides_dir = captures_dir / "rendered"
    slides_dir.mkdir(parents=True, exist_ok=True)

    rendered: list[Path] = []
    for index, slide in enumerate(SLIDES):
        canvas = render_custom(slide) if slide.kind != "screenshot" else render_screenshot(slide, captures_dir)
        add_caption(canvas, slide, index)
        path = slides_dir / f"{slide.slug}.png"
        canvas.convert("RGB").save(path, quality=94)
        rendered.append(path)

    durations, narration_path = synthesize(slides_dir, repo_root)
    write_accessibility_files(output_dir, durations)

    concat_path = slides_dir / "slides.txt"
    lines: list[str] = []
    for image_path, duration in zip(rendered, durations, strict=True):
        lines.extend([f"file '{quote_concat(image_path)}'", f"duration {duration:.3f}"])
    lines.append(f"file '{quote_concat(rendered[-1])}'")
    concat_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    ffmpeg = find_ffmpeg(args.ffmpeg)
    review_output = output_dir / "ecotraceit-review-screencast.mp4"
    command = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "warning",
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(concat_path),
        "-i",
        str(narration_path),
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-vf",
        "fps=30,format=yuv420p",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "21",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        "-shortest",
        str(review_output),
    ]
    subprocess.run(command, check=True)
    shutil.copy2(review_output, output_dir / "ecotraceit-screencast.mp4")
    print(f"Generated {review_output}")
    print(f"Duration: {sum(durations):.1f} seconds")


if __name__ == "__main__":
    main()
