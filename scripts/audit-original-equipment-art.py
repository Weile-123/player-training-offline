"""Build a read-only contact sheet/index of every original equipment resource."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / "player-training"
if not (SOURCE / "public/art/products/manifest.json").is_file():
    SOURCE = ROOT
OUT = ROOT / ".tmp" / "original-equipment-art"
OUT.mkdir(parents=True, exist_ok=True)
manifest = json.loads((SOURCE / "public/art/products/manifest.json").read_text(encoding="utf-8"))
runtime = json.loads((SOURCE / "src/game/contract/runtime/equipment.json").read_text(encoding="utf-8"))
originals = {entry["id"]: entry["name"] for entry in runtime["relics"]}
equipment = sorted((entry for entry in manifest["products"] if entry["kind"] == "equipment"), key=lambda entry: entry["id"])
font_path = "C:/Windows/Fonts/msyh.ttc"
font = ImageFont.truetype(font_path, 18)
small = ImageFont.truetype(font_path, 16)
title_font = ImageFont.truetype(font_path, 25)
records = []
missing = []
name_differences = []
for entry in equipment:
    source = SOURCE / entry["path"]
    if not source.is_file():
        missing.append(entry["id"])
        continue
    with Image.open(source) as img:
        width, height = img.size
        img.verify()
    record = {**entry, "originalName": originals[entry["id"]], "width": width, "height": height,
              "bytes": source.stat().st_size, "sha256": hashlib.sha256(source.read_bytes()).hexdigest()}
    current = ROOT / entry["path"]
    record["currentBytes"] = current.stat().st_size if current.is_file() else None
    record["currentSha256"] = hashlib.sha256(current.read_bytes()).hexdigest() if current.is_file() else None
    record["sameFileBytesAsCurrent"] = record["sha256"] == record["currentSha256"]
    if record["name"] != record["originalName"]:
        name_differences.append({"id": entry["id"], "manifestName": record["name"], "runtimeName": record["originalName"]})
    records.append(record)

cols, rows = 6, 4
cell_w, cell_h = 242, 254
for page in range((len(records) + cols * rows - 1) // (cols * rows)):
    canvas = Image.new("RGB", (cols * cell_w + 32, rows * cell_h + 100), "#f6f0df")
    draw = ImageDraw.Draw(canvas)
    draw.text((18, 12), f"原版器材图片与名称  {page + 1}/4", font=title_font, fill="#173342")
    draw.text((18, 48), "共96张器材资源，94件原版在售；2件停用标记单列。未包括消耗品及招募卡。", font=small, fill="#5b6463")
    for slot, record in enumerate(records[page * cols * rows:(page + 1) * cols * rows]):
        x = 16 + slot % cols * cell_w
        y = 86 + slot // cols * cell_h
        draw.rounded_rectangle((x + 3, y + 3, x + cell_w - 8, y + cell_h - 8), radius=9,
                               fill="#ffffff", outline="#bdc7c8", width=1)
        with Image.open(SOURCE / record["path"]) as source:
            thumb = source.convert("RGBA")
            thumb.thumbnail((212, 184), Image.Resampling.LANCZOS)
            canvas.paste(thumb, (x + (cell_w - thumb.width) // 2 - 2, y + 10 + (184 - thumb.height) // 2), thumb)
        draw.text((x + 12, y + 196), record["id"], font=small, fill="#596b74")
        if not record["active"]:
            draw.text((x + 148, y + 196), "停用", font=small, fill="#bd3f2b")
        draw.text((x + 12, y + 219), record["originalName"], font=font, fill="#173342")
    canvas.save(OUT / f"original-equipment-{page + 1:02d}.png")

summary = {"sourceRoot": str(SOURCE), "sourceEquipmentResources": len(records), "sourceActiveEquipment": sum(record["active"] for record in records),
           "sourceInactiveEquipment": [record["id"] for record in records if not record["active"]],
           "excludedProducts": [entry for entry in manifest["products"] if entry["kind"] != "equipment"],
           "missing": missing, "nameDifferences": name_differences, "records": records}
(OUT / "original-equipment-index.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({key: value for key, value in summary.items() if key != "records" and key != "excludedProducts"}, ensure_ascii=False, indent=2))
print(str(OUT))

# Accepted V3 logical IDs stay stable for saves. Art IDs select an original name/image pair.
selected_art_ids = {
    14: 3, 34: 33, 90: 90,
    2: 14, 42: 15, 78: 78,
    17: 7, 37: 40, 85: 85,
    6: 28, 46: 59, 81: 76,
    7: 2, 51: 61, 87: 88,
    28: 17, 65: 63, 77: 72,
    1: 5, 45: 10, 82: 92,
    3: 46, 79: 96,
    24: 32, 96: 37,
    4: 4, 76: 52,
    8: 19, 80: 47,
    12: 30, 84: 49,
    40: 11, 88: 57,
    20: 23, 92: 60,
}
if len(selected_art_ids) != 35 or len(set(selected_art_ids.values())) != 35:
    raise ValueError("Expected 35 unique original image resources")
catalog_path = ROOT / "docs/balance/equipment-v3-catalog.json"
if catalog_path.is_file():
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))["rows"]
    records_by_id = {entry["id"]: entry for entry in records}
    selected = []
    for item in catalog:
        logical_number = int(item["id"].split("_")[1])
        source_id = f"relic_{selected_art_ids[logical_number]:03d}"
        original = records_by_id[source_id]
        if not original["active"]:
            raise ValueError(f"Selected inactive resource {source_id}")
        if "artId" in item and item["artId"] != source_id:
            raise ValueError(f"Accepted resource mapping differs for {item['id']}")
        effects = item["effects"]
        effect_parts = []
        if effects["stamina"]:
            effect_parts.append(f"体力上限 +{effects['stamina']}")
        if effects["recovery"]:
            effect_parts.append(f"恢复间隔 −{effects['recovery']}秒")
        if effects["courseRecovery"]:
            effect_parts.append(f"每课额外回体 +{effects['courseRecovery']}")
        if effects["experience"]:
            effect_parts.append(f"每球经验 +{effects['experience']}")
        if effects["automationExperience"]:
            effect_parts.append(f"自动每球经验 +{effects['automationExperience']}")
        if effects["offlineMinutes"]:
            effect_parts.append(f"离线时长 +{effects['offlineMinutes']}分钟")
        if effects["valuePercent"]:
            effect_parts.append(f"品牌/展示身价 +{effects['valuePercent']}%")
        if effects["cooperationBonus"]:
            effect_parts.append(f"合格合作额外 +{effects['cooperationBonus']}券")
        if effects["focusKey"]:
            effect_parts.append(f"成长倾向 +{effects['focusPower']}")
        selected.append({"logicalId": item["id"], "artId": source_id, "originalName": original["originalName"],
                         "category": item["category"], "grade": item["grade"], "price": item["price"],
                         "effectText": "；".join(effect_parts), "originalSource": str(SOURCE / original["path"]),
                         "sourceSha256": original["sha256"]})
    if len(selected) != 35:
        raise ValueError("Expected the complete 35-item V3 catalog")
    cols, rows = 7, 5
    cell_w, cell_h = 256, 294
    canvas = Image.new("RGB", (cols * cell_w + 32, rows * cell_h + 106), "#f6f0df")
    draw = ImageDraw.Draw(canvas)
    draw.text((18, 12), "新版35件器材  原版名称与图片复用", font=title_font, fill="#173342")
    draw.text((18, 50), "保留逻辑ID与效果，按用途匹配原版资源。每张卡展示原名、类别、档位、价格和加成。", font=small, fill="#5b6463")
    for slot, item in enumerate(selected):
        x = 16 + slot % cols * cell_w
        y = 90 + slot // cols * cell_h
        draw.rounded_rectangle((x + 3, y + 3, x + cell_w - 8, y + cell_h - 8), radius=9,
                               fill="#ffffff", outline="#bdc7c8", width=1)
        with Image.open(item["originalSource"]) as source:
            thumb = source.convert("RGBA")
            thumb.thumbnail((218, 182), Image.Resampling.LANCZOS)
            canvas.paste(thumb, (x + (cell_w - thumb.width) // 2 - 2, y + 8 + (182 - thumb.height) // 2), thumb)
        draw.text((x + 12, y + 194), item["originalName"], font=font, fill="#173342")
        draw.text((x + 12, y + 220), f"{item['category']} · {item['grade']}档 · {item['price']}券", font=small, fill="#4d6068")
        draw.text((x + 12, y + 244), item["effectText"], font=small, fill="#984125")
        draw.text((x + 12, y + 268), f"{item['logicalId']} → {item['artId']}", font=ImageFont.truetype(font_path, 12), fill="#6a7276")
    evidence = ROOT / "docs/evidence/equipment-original-reuse-v3.png"
    evidence.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(evidence)
    (OUT / "selected-v3-mapping.json").write_text(json.dumps(selected, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Selected contact sheet: {evidence}")
