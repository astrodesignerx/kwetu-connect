from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent
SHOTS = ROOT / 'screenshots'
SHEETS = ROOT / 'review'
SHEETS.mkdir(exist_ok=True)
font = ImageFont.truetype('C:/Windows/Fonts/consola.ttf', 14)
routes = ['clients', 'client-detail', 'drafts', 'settings', 'profile', 'mailboxes', 'connect', 'brand-kit', 'templates', 'template-new', 'template-edit', 'admin-users', 'admin-audit', 'login', 'register', 'mail', 'dev-mail']
for route in routes:
    matches = [p for p in SHOTS.glob(route + '-*.png') if any(p.name.startswith(route + '-' + str(w) + '-') for w in [1440, 1280, 390])]
    if not matches:
        continue
    matches.sort(key=lambda p: ('bottom' in p.stem, ['populated', 'empty', 'error', 'loading'].index(p.stem.split('-')[-2] if p.stem.endswith('-bottom') else p.stem.split('-')[-1]), p.name))
    rows = (len(matches) + 5) // 6
    sheet = Image.new('RGB', (6 * 400, rows * 360), '#d8d8d8')
    draw = ImageDraw.Draw(sheet)
    for i, p in enumerate(matches):
        x, y = (i % 6) * 400, (i // 6) * 360
        shot = Image.open(p).convert('RGB')
        shot.thumbnail((388, 326))
        sheet.paste(shot, (x + (400 - shot.width) // 2, y + 28))
        draw.text((x + 5, y + 5), p.stem, fill='#111111', font=font)
    sheet.save(SHEETS / (route + '.jpg'), quality=88)
overlays = [p for p in SHOTS.glob('*.png') if p.stem.split('-')[0] in ['more', 'palette', 'compose', 'popover', 'toast', 'reduced'] or p.stem.startswith(('mail-reader', 'template-fill', 'template-picker'))]
overlays.sort()
if overlays:
    sheet = Image.new('RGB', (2400, ((len(overlays) + 5) // 6) * 360), '#d8d8d8')
    draw = ImageDraw.Draw(sheet)
    for i, p in enumerate(overlays):
        x, y = (i % 6) * 400, (i // 6) * 360
        shot = Image.open(p).convert('RGB')
        shot.thumbnail((388, 326))
        sheet.paste(shot, (x + (400 - shot.width) // 2, y + 28))
        draw.text((x + 5, y + 5), p.stem, fill='#111111', font=font)
    sheet.save(SHEETS / 'overlays.jpg', quality=88)
print('Contact sheets generated for every captured image.')
