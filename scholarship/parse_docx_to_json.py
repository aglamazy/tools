#!/usr/bin/env python3
"""
Standalone CLI script to convert a scholarship docx (via pandoc markdown) to JSON.
Usage: python parse_docx_to_json.py <input.md> [output.json]

This was the original offline parser. The app now uses mammoth + Gemini LLM
for in-browser conversion (see app/services/scholarshipParserService.ts).
"""
import re
import json
import sys


def clean_markup(text):
    text = re.sub(r'\{[^}]*\}', '', text)
    text = text.replace('\\|', '|')
    text = re.sub(r'\*+', '', text)
    for _ in range(5):
        text = re.sub(r'\[([^\[\]]*)\](?!\()', r'\1', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def extract_links(text):
    links = []
    for m in re.finditer(r'\[([^\]]*(?:\[[^\]]*\][^\]]*)*)\]\((https?://[^)]+)\)', text):
        lt = clean_markup(m.group(1)).strip()
        url = m.group(2).strip()
        if url:
            links.append({"text": lt or url, "url": url})
    seen = set()
    return [l for l in links if l["url"] not in seen and not seen.add(l["url"])]


def parse_entry(name_raw, body, category):
    name = clean_markup(name_raw)
    name = re.sub(r'\[([^\]]*)\]\([^)]*\)', r'\1', name)
    name = clean_markup(name)

    status = "sent" if "SENT" in name else None
    name = name.replace("SENT", "").strip()

    tags = []
    for t in re.finditer(r'\((PO|JF|IO|OP)\)', name + " " + body):
        tag = t.group(1)
        if tag == "OP":
            tag = "PO"
        if tag not in tags:
            tags.append(tag)
    if name.endswith(" PO"):
        name = name[:-3].strip()
        if "PO" not in tags:
            tags.append("PO")

    name = name.rstrip('+').strip()
    if not name:
        return None

    deadline = None
    dm = re.search(r'Deadline:\s*([^\n\]]+)', body)
    if dm:
        d = clean_markup(dm.group(1)).strip()
        rp = re.search(r'\(([^)]+)\)', dm.group(0))
        if rp:
            d += f" ({rp.group(1)})"
        deadline = d

    links = extract_links(name_raw + "\n" + body)

    addr_parts = []
    for line in body.split('\n'):
        s = clean_markup(line.strip().lstrip('>').strip())
        s = re.sub(r'\[([^\]]*)\]\([^)]*\)', '', s).strip()
        if not s or len(s) < 3:
            continue
        if re.search(r'(Deadline|http|fundraiso|Tel\s)', s, re.IGNORECASE):
            continue
        if re.search(r'(Seems|Does not|More research|Worked with|Shiraz|specific|looks like|In liquidation|CHF|PO - Discs)', s):
            continue
        is_addr = bool(
            re.match(r'^c/o\s', s, re.IGNORECASE)
            or re.search(r'CH-\d{4}', s)
            or re.match(r'^\d{4}\s', s)
            or re.search(r'(strasse|str\.|weg\b|platz|gasse|rain\b|acker|Postfach)', s, re.IGNORECASE)
        )
        is_city = (
            len(s) < 35
            and re.match(r'^[A-ZÄÖÜ]', s)
            and not re.search(
                r'(Stiftung|Foundation|Fondation|Ernst|Application|Submitting|Antrag|Über|Willkommen|Förder|Stipend|FAQ|Projekt|Haus der)',
                s,
            )
        )
        if is_addr or is_city:
            addr_parts.append(s)
    address = ", ".join(addr_parts) if addr_parts else None

    notes = []
    for m in re.finditer(r'\(([^)]+)\)', body):
        n = m.group(1).strip()
        if n in ('PO', 'JF', 'IO', 'OP') or 'http' in n or 'Results' in n:
            continue
        if len(n) > 5:
            notes.append(n)
    if 'In liquidation' in body:
        liq = re.search(r'In liquidation[^\n]*', body)
        if liq:
            notes.append(clean_markup(liq.group(0)))
    if re.search(r'CHF\s', body):
        chf = re.search(r"CHF\s*[\d',]+", body)
        if chf:
            notes.append(chf.group(0))

    phone = None
    pm = re.search(r'Tel\s+(\+[\d\s]+)', body)
    if pm:
        phone = pm.group(1).strip()

    entry = {
        "name": name,
        "category": category,
        "deadline": deadline,
        "links": links,
        "address": address,
        "tags": tags,
        "status": status,
        "notes": "; ".join(notes) if notes else None,
    }
    if phone:
        entry["phone"] = phone
    return entry


def parse_markdown_file(input_path):
    with open(input_path, "r", encoding="utf-8") as f:
        content = f.read()

    h1_splits = re.split(r'^# (.+?)(?:\s*\{.*?\})?\s*$', content, flags=re.MULTILINE)

    category_map = {
        "Scholarships with Deadlines": "with_deadline",
        "Scholarships without Deadlines": "without_deadline",
        "Scholarships via Post without Deadlines": "via_post",
    }

    scholarships = []
    id_counter = 1

    for i in range(1, len(h1_splits), 2):
        section_title = h1_splits[i].strip().rstrip(':')
        section_body = h1_splits[i + 1] if i + 1 < len(h1_splits) else ""

        category = None
        for key, val in category_map.items():
            if key in section_title:
                category = val
                break
        if not category:
            continue

        h2_splits = re.split(r'^##\s+(.+?)$', section_body, flags=re.MULTILINE)

        for j in range(1, len(h2_splits), 2):
            heading = h2_splits[j].strip()
            body = h2_splits[j + 1] if j + 1 < len(h2_splits) else ""

            parts = re.split(r'^\d+\.\s+', body, flags=re.MULTILINE)
            if len(parts) > 1:
                entry = parse_entry(heading, parts[0], category)
                if entry:
                    entry["id"] = id_counter
                    id_counter += 1
                    scholarships.append(entry)
                for k in range(1, len(parts)):
                    lines = parts[k].strip().split('\n')
                    ename = lines[0]
                    ebody = '\n'.join(lines[1:])
                    entry = parse_entry(ename, ebody, category)
                    if entry:
                        entry["id"] = id_counter
                        id_counter += 1
                        scholarships.append(entry)
            else:
                entry = parse_entry(heading, body, category)
                if entry:
                    entry["id"] = id_counter
                    id_counter += 1
                    scholarships.append(entry)

    return {
        "legend": {"PO": "Project Oriented", "JF": "Jewish Focused", "IO": "Instrument Oriented"},
        "scholarships": scholarships,
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python parse_docx_to_json.py <input.md> [output.json]")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else input_path.rsplit('.', 1)[0] + '.json'

    result = parse_markdown_file(input_path)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    print(f"Parsed {len(result['scholarships'])} scholarships -> {output_path}")
