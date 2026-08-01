#!/usr/bin/env python3
"""สร้างไดอะแกรมประกอบบทเรียนเป็น SVG

ทำไมต้องเขียนเอง ไม่ใช้ภาพสำเร็จ: ภาพประกอบที่ไม่ได้อธิบายอะไรคือของประดับ ซึ่งแย่กว่า
ไม่มี — ทั้งสามภาพนี้เลือกจากจุดที่ "ข้อความอธิบายได้แย่กว่าภาพจริงๆ" (ความสัมพันธ์
ระหว่างชั้น · โครงต้นไม้ · ทิศทางการไหลของข้อมูล)

ข้อจำกัดที่คุมดีไซน์: SVG ถูกโหลดผ่าน <img> จึงอ่าน data-theme ของหน้าไม่ได้ ภาพเดียว
ต้องอ่านออกทั้งธีมสว่างและมืด วิธีแก้คือ
  · พื้นหลังโปร่งใส ไม่มีแผ่นสีขาวมาสะท้อนแสงในธีมมืด
  · ข้อความหลักอยู่บนชิปสีแบรนด์ (พื้น #38BDF8 + หมึกเข้ม) ซึ่งพาคอนทราสต์ติดตัวไป
  · ข้อความรองใช้หมึกกลาง #5E7A8A ที่ผ่านทั้งบนพื้นสว่างและพื้นมืด
"""

import pathlib

FILL = '#38BDF8'   # --cs-accent-fill
INK = '#06121C'    # --cs-on-accent
MUTE = '#5E7A8A'   # ผ่านทั้งสองธีม ใช้กับข้อความรองเท่านั้น
LINE = '#7FCDF3'

MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'
SANS = 'Inter, Helvetica, Arial, sans-serif'


def chip(x, y, w, h, label, sub=None, mono=False, r=10):
    """ชิปพื้นสีแบรนด์ — พาคอนทราสต์ติดตัวไป จึงอ่านออกบนพื้นหลังสีใดก็ได้"""
    out = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{FILL}"/>']
    cx = x + w / 2
    fam = MONO if mono else SANS
    if sub:
        out.append(
            f'<text x="{cx}" y="{y + h / 2 - 2}" text-anchor="middle" font-family="{fam}" '
            f'font-size="14" font-weight="600" fill="{INK}">{label}</text>'
        )
        out.append(
            f'<text x="{cx}" y="{y + h / 2 + 15}" text-anchor="middle" font-family="{SANS}" '
            f'font-size="11" fill="{INK}" opacity="0.75">{sub}</text>'
        )
    else:
        out.append(
            f'<text x="{cx}" y="{y + h / 2 + 5}" text-anchor="middle" font-family="{fam}" '
            f'font-size="14" font-weight="600" fill="{INK}">{label}</text>'
        )
    return '\n  '.join(out)


def ghost(x, y, w, h, label, mono=False, r=10):
    """ชิปโครง — ของที่ไม่ใช่พระเอกของภาพ"""
    fam = MONO if mono else SANS
    return (
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="none" '
        f'stroke="{LINE}" stroke-width="1.5"/>\n  '
        f'<text x="{x + w / 2}" y="{y + h / 2 + 4}" text-anchor="middle" font-family="{fam}" '
        f'font-size="12.5" fill="{MUTE}">{label}</text>'
    )


def note(x, y, text, anchor='middle', size=11.5):
    return (
        f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-family="{SANS}" '
        f'font-size="{size}" fill="{MUTE}">{text}</text>'
    )


def arrow(x1, y1, x2, y2):
    return f'<path d="M{x1} {y1} L{x2} {y2}" stroke="{LINE}" stroke-width="2" marker-end="url(#a)"/>'


def elbow(x1, y1, x2, y2):
    """เส้นหักฉาก — ใช้กับโครงต้นไม้ ให้เห็นลำดับชั้นชัดกว่าเส้นตรงเฉียง"""
    return f'<path d="M{x1} {y1} V{y2} H{x2}" stroke="{LINE}" stroke-width="1.5" fill="none"/>'


def svg(w, h, label, body):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-label="{label}">
  <defs>
    <marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0 1 L9 5 L0 9 z" fill="{LINE}"/>
    </marker>
  </defs>
  {body}
</svg>
'''


# ── 1. ระบบปฏิบัติการนั่งอยู่ตรงไหน ────────────────────────────────────────────
# ข้อความบอก "หน้าที่สี่อย่าง" ได้ แต่บอก "อยู่ระหว่างอะไรกับอะไร" ได้แย่มาก
def diagram_os_layers():
    b = [
        note(360, 22, 'Everything you run asks the operating system first'),
        ghost(60, 40, 130, 40, 'Your browser'),
        ghost(205, 40, 130, 40, 'A text editor'),
        ghost(350, 40, 130, 40, 'A shell command', mono=True),
        ghost(495, 40, 145, 40, 'A background service'),
        arrow(350, 88, 350, 108),
        f'<rect x="60" y="115" width="580" height="122" rx="16" fill="none" stroke="{FILL}" stroke-width="2"/>',
        note(350, 137, 'The operating system does four jobs, all the time'),
        chip(78, 150, 130, 62, 'Runs things', 'shares the CPU'),
        chip(222, 150, 130, 62, 'Remembers', 'hands out memory'),
        chip(366, 150, 130, 62, 'Stores', 'files and folders'),
        chip(510, 150, 112, 62, 'Decides', 'who may do what'),
        arrow(350, 245, 350, 265),
        ghost(60, 272, 130, 40, 'CPU'),
        ghost(205, 272, 130, 40, 'Memory'),
        ghost(350, 272, 130, 40, 'Disk'),
        ghost(495, 272, 145, 40, 'Network card'),
        note(350, 334, 'Hardware — none of it is touched directly by your programs'),
    ]
    return svg(700, 350, 'Programs sit above the operating system, hardware sits below it', '\n  '.join(b))


# ── 2. โครงต้นไม้ของ filesystem ────────────────────────────────────────────────
# ย่อหน้าที่ไล่ชื่อไดเรกทอรีทีละอันคือสิ่งที่ต้นไม้ทำได้ดีกว่าทันที
def diagram_filesystem():
    rows = [
        ('/etc', 'configuration — text files that decide how things behave'),
        ('/var/log', 'things that grow — this is where you look when something broke'),
        ('/home/you', 'your own files; nobody else needs write access here'),
        ('/usr/bin', 'the programs themselves'),
        ('/tmp', 'scratch space, wiped on reboot'),
    ]
    b = [
        chip(40, 24, 64, 34, '/', mono=True),
        note(120, 46, 'one tree, one root — there is no C: drive', anchor='start'),
    ]
    y = 82
    for i, (path, desc) in enumerate(rows):
        b.append(elbow(58, 58 if i == 0 else 58, 84, y + 17))
        b.append(f'<path d="M58 58 V{y + 17} H84" stroke="{LINE}" stroke-width="1.5" fill="none"/>')
        b.append(chip(84, y, 120, 34, path, mono=True, r=8))
        b.append(note(218, y + 21, desc, anchor='start'))
        y += 48
    b.append(note(40, y + 14, 'Everything else hangs off the same root — including other disks.', anchor='start'))
    return svg(700, y + 30, 'The Linux filesystem is one tree hanging off a single root', '\n  '.join(b))


# ── 3. ทิศทางการไหลของ pipe ────────────────────────────────────────────────────
# หัวใจของ pipe คือ "ทิศทาง" ซึ่งข้อความบรรยายได้ช้ากว่าลูกศรมาก
def diagram_pipeline():
    steps = [
        ('cat access.log', 'every line'),
        ("grep ' 404 '", 'only the failures'),
        ("cut -d' ' -f7", 'just the path'),
        ('sort | uniq -c', 'counted'),
    ]
    # กว้างเท่าไรต้องคำนวณจาก layout ไม่ใช่เดาแล้วตั้งเลขไว้ — ตอนแรกตั้ง 700 ไว้เฉยๆ
    # ชิปสุดท้ายเลยยื่นออกไป 34px แล้วโดนตัดหายไปครึ่งตัว
    pad, w, gap = 24, 158, 26
    total = pad * 2 + w * len(steps) + gap * (len(steps) - 1)
    mid = total / 2
    b = [note(mid, 22, 'Each step reads what the step before it printed — nothing is saved in between')]
    x = pad
    for i, (cmd, out) in enumerate(steps):
        b.append(chip(x, 44, w, 58, cmd, out, mono=True))
        if i < len(steps) - 1:
            b.append(arrow(x + w + 4, 73, x + w + gap - 4, 73))
        x += w + gap
    b.append(note(mid, 132, 'One long line of text goes in; a short answer comes out.'))
    b.append(ghost(mid - 120, 148, 240, 40, '12  /admin/login', mono=True))
    b.append(note(mid, 208, 'Stop at any point and look — that is how you debug a pipeline.'))
    return svg(total, 226, 'A shell pipeline passes text from one command to the next', '\n  '.join(b))


def main():
    out = pathlib.Path(__file__).resolve().parent.parent / 'public' / 'media' / 'diagrams'
    out.mkdir(parents=True, exist_ok=True)
    for name, fn in [
        ('os-layers', diagram_os_layers),
        ('filesystem-tree', diagram_filesystem),
        ('shell-pipeline', diagram_pipeline),
    ]:
        path = out / f'{name}.svg'
        path.write_text(fn(), encoding='utf-8')
        print(f'wrote {path.relative_to(out.parent.parent.parent)}')


if __name__ == '__main__':
    main()
