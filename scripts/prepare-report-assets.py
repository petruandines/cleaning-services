"""Build immutable PDF resources locally; never sends customer data anywhere.
Requires fonttools and Pillow. Original logo pixels are retained, with alpha on white.
Usage: python scripts/prepare-report-assets.py FONT.ttf FONT-LICENSE OUTPUT
"""
import sys, json, base64, zlib, hashlib
from pathlib import Path
from fontTools.ttLib import TTFont
from PIL import Image

font_path, license_path, output = map(Path, sys.argv[1:])
root = Path(__file__).resolve().parents[1]
font = TTFont(font_path)
cmap = font.getBestCmap()
units = font['head'].unitsPerEm
glyphs = {str(cp): [font.getGlyphID(name), round(font['hmtx'][name][0]*1000/units)] for cp, name in cmap.items() if cp <= 65535}
logo_path = root/'assets/img/logo.png'
logo = Image.open(logo_path).convert('RGBA')
background = Image.new('RGBA', logo.size, 'white')
background.alpha_composite(logo)
data = {'version': 1, 'font': base64.b64encode(zlib.compress(font_path.read_bytes(),9)).decode(), 'fontLength': font_path.stat().st_size, 'glyphs': glyphs,
        'logo': base64.b64encode(zlib.compress(background.convert('RGB').tobytes(), 9)).decode(),
        'logoWidth': logo.width, 'logoHeight': logo.height,
        'originalLogoSHA256': hashlib.sha256(logo_path.read_bytes()).hexdigest()}
output.mkdir(parents=True, exist_ok=True)
(output/'resources.json').write_text(json.dumps(data, separators=(',', ':')))
(output/'FONT-LICENSE.txt').write_bytes(license_path.read_bytes())
