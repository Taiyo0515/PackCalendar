"""Regenerate the hand-drawn, code-native application icon (optional Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent / 'assets'
scale = 4
im = Image.new('RGB', (512 * scale, 512 * scale), '#263f36')
d = ImageDraw.Draw(im)
def box(values): return tuple(round(x * scale * 4) for x in values)
stroke = '#f3e8c9'
d.arc(box((47,17,81,51)), 180, 360, fill=stroke, width=7 * 4 * scale)
d.line([tuple(box((47,34))), tuple(box((47,44)))], fill=stroke, width=7 * 4 * scale)
d.line([tuple(box((81,34))), tuple(box((81,44)))], fill=stroke, width=7 * 4 * scale)
d.rounded_rectangle(box((31,41,97,105)), radius=15 * 4 * scale, outline=stroke, width=7 * 4 * scale)
d.line([tuple(box((49,75))),tuple(box((59,85))),tuple(box((81,63)))],fill=stroke,width=7*4*scale,joint='curve')
for size in (192,512): im.resize((size,size), Image.Resampling.LANCZOS).save(root / f'icon-{size}.png')
