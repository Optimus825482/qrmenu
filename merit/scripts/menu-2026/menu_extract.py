# Dumps the menu documents (xlsx, docx, pdf) of the new menu folder to plain text files. Read-only on the source.
import io, os, re, sys, zipfile, html
import xml.etree.ElementTree as ET

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
S = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def docx_text(path):
    z = zipfile.ZipFile(path)
    root = ET.fromstring(z.read("word/document.xml"))
    body = root.find(W + "body")
    lines = []

    def para(p):
        parts = []
        for el in p.iter():
            if el.tag == W + "t":
                parts.append(el.text or "")
            elif el.tag in (W + "br", W + "cr"):
                parts.append(" ¶ ")
            elif el.tag == W + "tab":
                parts.append(" 	 ")
        return "".join(parts).strip()

    for el in body:
        if el.tag == W + "p":
            t = para(el)
            if t:
                lines.append(t)
        elif el.tag == W + "tbl":
            for tr in el.iter(W + "tr"):
                cells = []
                for tc in tr.findall(W + "tc"):
                    cells.append(" / ".join(x for x in (para(p) for p in tc.iter(W + "p")) if x))
                if any(cells):
                    lines.append(" | ".join(cells))
    images = [n for n in z.namelist() if n.startswith("word/media/")]
    return lines, len(images)


def xlsx_text(path):
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall(S + "si"):
            shared.append("".join(t.text or "" for t in si.iter(S + "t")))
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    names = [s.get("name") for s in wb.iter(S + "sheet")]
    lines = []
    sheets = sorted((n for n in z.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml", n)), key=lambda n: int(re.findall(r"\d+", n)[-1]))
    for i, sn in enumerate(sheets):
        lines.append("### SAYFA: %s" % (names[i] if i < len(names) else sn))
        for row in ET.fromstring(z.read(sn)).iter(S + "row"):
            cells = []
            for c in row.findall(S + "c"):
                v = c.find(S + "v")
                if c.get("t") == "inlineStr":
                    val = "".join(t.text or "" for t in c.iter(S + "t"))
                elif v is None:
                    val = ""
                elif c.get("t") == "s":
                    val = shared[int(v.text)]
                else:
                    val = v.text
                val = (val or "").strip()
                if val:
                    cells.append(val)
            if cells:
                lines.append(" | ".join(cells))
    return lines


def pdf_text(path):
    import fitz
    doc = fitz.open(path)
    lines = []
    for i, page in enumerate(doc):
        lines.append("### SAYFA %d" % (i + 1))
        lines.extend(l.strip() for l in page.get_text().splitlines() if l.strip())
    return lines, len(doc)


seen = {}
for base, _, files in os.walk(src):
    for f in sorted(files):
        if f.startswith("~$"):
            continue
        ext = f.lower().rsplit(".", 1)[-1]
        if ext not in ("docx", "xlsx", "pdf"):
            continue
        p = os.path.join(base, f)
        key = (f, os.path.getsize(p))
        if key in seen:
            print("YINELENEN  %s  == %s" % (os.path.relpath(p, src), seen[key]))
            continue
        seen[key] = os.path.relpath(p, src)
        note = ""
        try:
            if ext == "docx":
                lines, n = docx_text(p)
                note = "gomulu gorsel=%d" % n
            elif ext == "xlsx":
                lines = xlsx_text(p)
            else:
                lines, n = pdf_text(p)
                note = "sayfa=%d" % n
        except Exception as e:  # noqa
            print("HATA %s: %s" % (f, e))
            continue
        name = re.sub(r"[^A-Za-z0-9]+", "_", f.encode("ascii", "ignore").decode())[:60] + ".txt"
        io.open(os.path.join(out, name), "w", encoding="utf8").write("\n".join(lines))
        print("%6d satir  %-10s %s  ->  %s" % (len(lines), note, os.path.relpath(p, src), name))
