#!/usr/bin/env python3
"""
Step-Free London data pipeline.

Downloads TfL open data into `data-pipeline/.raw/` (gitignored) and writes
`apps/website/public/data/network.json`. Standard library only (Python 3.10+).

    python3 data-pipeline/build_network.py            # use cached downloads
    python3 data-pipeline/build_network.py --refresh  # download again

Sources (Powered by TfL Open Data):
  1. TfL Unified API /Line/{id}/Route/Sequence/{dir}: station order, coordinates, track shapes
  2. TfL station data (tfl-stationdata-detailed.zip): lifts, ramps and level paths in stations
  3. TfL Annual Station Counts 2025: entries + exits per station

How "step-free" is worked out:
  The station data describes each station as a set of points (entrances, halls, platforms)
  joined only by step-free connections: level paths, ramps and lifts. Stairs and escalators are
  not included. Starting from the station's street ("Outside") point, we follow those
  connections (a breadth-first search). If all of a line's platforms are reached the line is
  step-free there (2), if some are it is partly step-free (1), otherwise not (0).
  This is street to platform only; it does not cover the gap between platform and train.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import math
import re
import shutil
import ssl
import subprocess
import sys
import time
import unicodedata
import urllib.error
import urllib.request
import zipfile
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RAW = ROOT / ".raw"
OUT = ROOT.parent / "apps" / "website" / "public" / "data" / "network.json"

API = "https://api.tfl.gov.uk"
STATION_DATA_URL = f"{API}/stationdata/tfl-stationdata-detailed.zip"
USAGE_YEAR = 2025
USAGE_URL = (
    "https://crowding.data.tfl.gov.uk/Annual%20Station%20Counts/2025/"
    "AC2025_AnnualisedEntryExit_public.xlsx"
)

# Lines drawn on the wall. `color` is the official TfL colour; `display` is a brightened variant
# where the official colour has too little contrast on a dark basemap (Northern, Piccadilly...).
LINES = [
    # id, name, mode, official colour, display colour
    ("bakerloo", "Bakerloo", "tube", "#B36305", "#C9741A"),
    ("central", "Central", "tube", "#E32017", "#E8382F"),
    ("circle", "Circle", "tube", "#FFD300", "#E6C200"),
    ("district", "District", "tube", "#00782A", "#1E9A45"),
    ("hammersmith-city", "Hammersmith & City", "tube", "#F3A9BB", "#E99AAE"),
    ("jubilee", "Jubilee", "tube", "#A0A5A9", "#A0A5A9"),
    ("metropolitan", "Metropolitan", "tube", "#9B0056", "#C2246F"),
    ("northern", "Northern", "tube", "#000000", "#B4B4B4"),
    ("piccadilly", "Piccadilly", "tube", "#003688", "#3D6BD6"),
    ("victoria", "Victoria", "tube", "#0098D4", "#0098D4"),
    ("waterloo-city", "Waterloo & City", "tube", "#95CDBA", "#95CDBA"),
    ("elizabeth", "Elizabeth line", "elizabeth-line", "#6950A1", "#8F74D6"),
    ("dlr", "DLR", "dlr", "#00A4A7", "#00B4B7"),
]
LINE_IDS = [line[0] for line in LINES]

# Usage-sheet station names that do not normalise to a station-data name. Values are either a
# normalised station name or (for ambiguous names such as the two Edgware Roads) a station id.
# Note: TfL counts Bank and Monument as one complex, so its total is assigned to Bank.
USAGE_NAME_ALIASES = {
    "bank & monument": "bank",
    "edgware road (bak)": "940GZZLUERB",
    "edgware road (dis)": "940GZZLUERC",
    "hammersmith (dis)": "hammersmith",
    "hammersmith (h&c)": "hammersmith",
    "heathrow terminals 123": "heathrow terminals 2 & 3",
    "norwood jn": "norwood junction",
    "paddington tfl": "paddington",
}

# Stations that share a name in the station data get a suffix so captions are unambiguous.
DISAMBIGUATE = {
    "940GZZLUERB": "Edgware Road (Bakerloo)",
    "940GZZLUERC": "Edgware Road (Circle)",
}


# Download helpers


def fetch(url: str, dest: Path, refresh: bool) -> Path:
    """Download `url` to `dest` unless it is already cached."""
    if dest.exists() and dest.stat().st_size > 0 and not refresh:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"  downloading {url}")
    request = urllib.request.Request(url, headers={"User-Agent": "step-free-london-pipeline"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                dest.write_bytes(response.read())
            return dest
        except urllib.error.URLError as error:
            # python.org macOS builds ship without CA certificates until "Install
            # Certificates.command" is run. The system curl uses the OS trust store, so fall
            # back to it (TLS verification stays on).
            if isinstance(error.reason, ssl.SSLCertVerificationError) and shutil.which("curl"):
                subprocess.run(
                    ["curl", "-fsSL", "--retry", "3", "-A", "step-free-london-pipeline",
                     "-o", str(dest), url],
                    check=True,
                )
                return dest
            if attempt == 3:
                raise
            print(f"    retry after error: {error}")
            time.sleep(2 * (attempt + 1))
    return dest


def read_csv(archive: zipfile.ZipFile, name: str) -> list[dict[str, str]]:
    with archive.open(name) as handle:
        return list(csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8-sig")))


def read_xlsx_rows(path: Path) -> list[dict[str, str]]:
    """Minimal stdlib XLSX reader: first sheet -> list of {column letter: cell text}."""
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    tag = "{%s}" % ns["m"]
    with zipfile.ZipFile(path) as archive:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            for item in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall("m:si", ns):
                shared.append("".join(t.text or "" for t in item.iter(tag + "t")))
        sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
    rows = []
    for row in sheet.iter(tag + "row"):
        cells = {}
        for cell in row.findall("m:c", ns):
            column = re.match(r"[A-Z]+", cell.get("r", "")).group(0)
            value = cell.find("m:v", ns)
            kind = cell.get("t")
            if kind == "inlineStr":
                text = "".join(t.text or "" for t in cell.iter(tag + "t"))
            elif value is None:
                text = ""
            elif kind == "s":
                text = shared[int(value.text)]
            else:
                text = value.text or ""
            cells[column] = text
        rows.append(cells)
    return rows


def normalise_name(name: str) -> str:
    text = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    text = re.sub(r"\s+(underground|dlr|rail|elizabeth line)?\s*station$", "", text)
    # Usage sheet suffixes rows with the operator: "Euston LU", "Euston NR", "Canary Wharf EL".
    text = re.sub(r"\s+(lu|lo|dlr|el|nr|tfl)$", "", text)
    text = text.replace("’", "'").replace(" and ", " & ")
    return re.sub(r"\s+", " ", text).strip()


# Geometry helpers (lon/lat treated as planar after scaling lon by cos(lat): fine at city scale)

COS_LAT = math.cos(math.radians(51.5))


def project_point(point, line):
    """Return (distance, position along polyline) of `point`'s nearest location on `line`."""
    best = (float("inf"), 0.0)
    px, py = point[0] * COS_LAT, point[1]
    for i in range(len(line) - 1):
        ax, ay = line[i][0] * COS_LAT, line[i][1]
        bx, by = line[i + 1][0] * COS_LAT, line[i + 1][1]
        dx, dy = bx - ax, by - ay
        length_sq = dx * dx + dy * dy
        t = 0.0 if length_sq == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length_sq))
        cx, cy = ax + t * dx, ay + t * dy
        distance = math.hypot(px - cx, py - cy)
        if distance < best[0]:
            best = (distance, i + t)
    return best


def slice_polyline(line, start: float, end: float):
    """Sub-polyline between fractional vertex positions `start` and `end`."""
    reverse = start > end
    lo, hi = (end, start) if reverse else (start, end)

    def at(position):
        i = min(int(position), len(line) - 2)
        t = position - i
        a, b = line[i], line[i + 1]
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

    points = [at(lo)] + [line[i] for i in range(int(lo) + 1, int(math.ceil(hi)))] + [at(hi)]
    return points[::-1] if reverse else points


def simplify(points, tolerance=0.00004):
    """Douglas-Peucker simplification; tolerance ~4 m keeps the JSON small."""
    if len(points) < 3:
        return points
    ax, ay = points[0]
    bx, by = points[-1]
    dx, dy = bx - ax, by - ay
    norm = math.hypot(dx, dy) or 1e-12
    index, max_distance = 0, 0.0
    for i in range(1, len(points) - 1):
        distance = abs(dy * points[i][0] - dx * points[i][1] + bx * ay - by * ax) / norm
        if distance > max_distance:
            index, max_distance = i, distance
    if max_distance <= tolerance:
        return [points[0], points[-1]]
    return simplify(points[: index + 1], tolerance)[:-1] + simplify(points[index:], tolerance)


def r5(value: float) -> float:
    return round(value, 5)


# Pipeline stages


def load_routes(refresh: bool):
    """Per line: ordered stop lists, stop coordinates and track polylines."""
    routes = {}
    for line_id in LINE_IDS:
        sequences, stops, polylines = [], {}, []
        for direction in ("outbound", "inbound"):
            path = fetch(
                f"{API}/Line/{line_id}/Route/Sequence/{direction}",
                RAW / "routes" / f"{line_id}-{direction}.json",
                refresh,
            )
            payload = json.loads(path.read_text())
            # Stop ids in stopPointSequences match orderedLineRoutes (NaPTAN 940G/910G codes).
            # The top-level `stations` list sometimes uses HUB ids instead, so it is only a
            # coordinate fallback.
            for sequence in payload.get("stopPointSequences", []):
                for stop in sequence.get("stopPoint", []):
                    stops.setdefault(stop["id"], (stop["lon"], stop["lat"], stop["name"]))
            fallback = {s["id"]: (s["lon"], s["lat"], s["name"]) for s in payload.get("stations", [])}
            for route in payload.get("orderedLineRoutes", []):
                if route.get("naptanIds"):
                    sequences.append(route["naptanIds"])
                    for naptan in route["naptanIds"]:
                        if naptan not in stops and naptan in fallback:
                            stops[naptan] = fallback[naptan]
            for encoded in payload.get("lineStrings", []):
                for polyline in json.loads(encoded):
                    if len(polyline) >= 2:
                        polylines.append(polyline)
        routes[line_id] = {"sequences": sequences, "stops": stops, "polylines": polylines}
        print(f"  {line_id:18s} {len(sequences):2d} routes, {len(stops):3d} stops")
    return routes


def load_step_free(refresh: bool):
    """BFS street->platform over TfL's step-free station graph. Returns lookup tables."""
    path = fetch(STATION_DATA_URL, RAW / "tfl-stationdata-detailed.zip", refresh)
    with zipfile.ZipFile(path) as archive:
        stations = {row["UniqueId"]: row for row in read_csv(archive, "Stations.csv")}
        platforms = {row["UniqueId"]: row for row in read_csv(archive, "Platforms.csv")}
        services = read_csv(archive, "PlatformServices.csv")
        same_level = read_csv(archive, "SameLevelPaths.csv")
        ramps = read_csv(archive, "RampRoutes.csv")
        lifts = read_csv(archive, "Lifts.csv")
        feed = read_csv(archive, "FeedInfo.csv")

    graph: dict[str, set[str]] = defaultdict(set)
    for row in same_level + ramps:
        graph[row["From"]].add(row["To"])
    for lift in lifts:
        # A lift links every area in one stage to every area in the next; lifts run both ways.
        stages = [
            [area for area in lift[key].split("|") if area]
            for key in ("FromAreas", "IntermediateAreas", "IntermediateAreas2", "ToAreas")
            if lift[key]
        ]
        for here, there in zip(stages, stages[1:]):
            for a in here:
                for b in there:
                    graph[a].add(b)
                    graph[b].add(a)

    def reachable_from_street(station_id: str) -> set[str]:
        start = stations[station_id]["OutsideStationUniqueId"]
        seen, queue = {start}, [start]
        while queue:
            node = queue.pop()
            for nxt in graph[node]:
                if nxt not in seen:
                    seen.add(nxt)
                    queue.append(nxt)
        return seen

    naptan_to_station: dict[str, str] = {}
    platforms_by_station_line: dict[tuple[str, str], list[str]] = defaultdict(list)
    for service in services:
        platform = platforms.get(service["PlatformUniqueId"])
        if not platform:
            continue
        station_id = platform["StationUniqueId"]
        if service["StopAreaNaptanCode"]:
            naptan_to_station[service["StopAreaNaptanCode"]] = station_id
        line = "elizabeth" if service["Line"] == "elizabeth" else service["Line"]
        platforms_by_station_line[(station_id, line)].append(service["PlatformUniqueId"])

    reach_cache: dict[str, set[str]] = {}
    status: dict[tuple[str, str], int] = {}  # 2 = all platforms, 1 = some, 0 = none
    for (station_id, line), platform_ids in platforms_by_station_line.items():
        if station_id not in stations:
            continue
        reached = reach_cache.setdefault(station_id, reachable_from_street(station_id))
        hits = sum(platform_id in reached for platform_id in set(platform_ids))
        total = len(set(platform_ids))
        status[(station_id, line)] = 2 if hits == total else (1 if hits else 0)

    feed_date = feed[0].get("FeedStartDate", "")[:10] if feed else ""
    return stations, naptan_to_station, status, feed_date


def load_usage(refresh: bool):
    path = fetch(USAGE_URL, RAW / f"usage-{USAGE_YEAR}.xlsx", refresh)
    rows = read_xlsx_rows(path)
    header_index = next(i for i, row in enumerate(rows) if row.get("D") == "Station")
    header = rows[header_index]
    annual_column = next(col for col, text in header.items() if text == "Annualised")
    usage = []
    for row in rows[header_index + 2 :]:
        name, value = row.get("D", "").strip(), row.get(annual_column, "")
        if not name or not value:
            continue
        try:
            usage.append((row.get("A", ""), name, float(value)))
        except ValueError:
            continue
    return usage


def build(refresh: bool):
    print("1/4 Line routes (TfL Unified API)")
    routes = load_routes(refresh)
    print("2/4 Step-free station graph (TfL station data)")
    station_rows, naptan_to_station, sf_status, feed_date = load_step_free(refresh)
    print("3/4 Annual station counts")
    usage_rows = load_usage(refresh)

    print("4/4 Joining")
    # Stations: one node per TfL station (an interchange such as Bank + its DLR platforms is one node)
    def station_key(naptan: str) -> str:
        return naptan_to_station.get(naptan, naptan)

    nodes: dict[str, dict] = {}
    unmatched_naptans = set()
    for line_id, route in routes.items():
        for naptan, (lon, lat, name) in route["stops"].items():
            key = station_key(naptan)
            if key not in station_rows:
                unmatched_naptans.add((line_id, naptan, name))
            node = nodes.setdefault(key, {"coords": [], "lines": set(), "names": set()})
            node["coords"].append((lon, lat))
            node["names"].add(name)
    for line_id, route in routes.items():
        for sequence in route["sequences"]:
            for naptan in sequence:
                if naptan in route["stops"]:
                    nodes[station_key(naptan)]["lines"].add(line_id)

    # Drop nodes that no ordered route actually serves.
    nodes = {key: node for key, node in nodes.items() if node["lines"]}

    def display_name(key: str, node: dict) -> str:
        if key in DISAMBIGUATE:
            return DISAMBIGUATE[key]
        if key in station_rows:
            return station_rows[key]["Name"].strip()
        name = sorted(node["names"], key=len)[0]
        return re.sub(r"\s+(Underground|DLR|Rail)?\s*Station$", "", name).strip()

    # Usage join by normalised name (counts are published per station name)
    name_to_key = {}
    for key, node in nodes.items():
        name_to_key.setdefault(normalise_name(display_name(key, node)), key)
        for name in node["names"]:
            name_to_key.setdefault(normalise_name(name), key)
    usage_by_key: dict[str, float] = defaultdict(float)
    unmatched_usage = []
    for mode, name, value in usage_rows:
        if mode == "LO":
            continue  # Overground is not drawn, so its passengers are not counted either.
        normalised = normalise_name(name)
        normalised = USAGE_NAME_ALIASES.get(normalised, normalised)
        key = normalised if normalised in nodes else name_to_key.get(normalised)
        if key is None:
            unmatched_usage.append((mode, name, round(value)))
            continue
        usage_by_key[key] += value

    # Emit stations
    keys = sorted(nodes, key=lambda k: display_name(k, nodes[k]))
    index_of = {key: i for i, key in enumerate(keys)}
    stations_out = []
    for key in keys:
        node = nodes[key]
        lon = sum(c[0] for c in node["coords"]) / len(node["coords"])
        lat = sum(c[1] for c in node["coords"]) / len(node["coords"])
        lines = sorted(node["lines"], key=LINE_IDS.index)
        # Unknown = no platform record for that line. Treated as not step-free (conservative).
        sf = [sf_status.get((key, line), 0) for line in lines]
        usage = usage_by_key.get(key)
        stations_out.append(
            {
                "id": key,
                "name": display_name(key, node),
                "lon": r5(lon),
                "lat": r5(lat),
                "lines": lines,
                "sf": sf,
                "usage": round(usage) if usage else None,
            }
        )

    # Segments: consecutive stops on each ordered route, sliced from real track geometry
    segments_out = []
    straight_fallbacks = 0
    for line_id, route in routes.items():
        pairs = set()
        for sequence in route["sequences"]:
            idx = [index_of[station_key(n)] for n in sequence if n in route["stops"]]
            for a, b in zip(idx, idx[1:]):
                if a != b:
                    pairs.add((min(a, b), max(a, b)))
        for a, b in sorted(pairs):
            pa = (stations_out[a]["lon"], stations_out[a]["lat"])
            pb = (stations_out[b]["lon"], stations_out[b]["lat"])
            path = None
            best_score = 0.004  # ~300 m tolerance for station-to-track snapping
            for polyline in route["polylines"]:
                da, ta = project_point(pa, polyline)
                db, tb = project_point(pb, polyline)
                if max(da, db) < best_score and abs(ta - tb) > 1e-9:
                    best_score = max(da, db)
                    path = slice_polyline(polyline, ta, tb)
            if path is None:
                straight_fallbacks += 1
                path = [list(pa), list(pb)]
            else:
                path = [list(pa)] + simplify(path)[1:-1] + [list(pb)]
            segments_out.append(
                {
                    "line": line_id,
                    "a": a,
                    "b": b,
                    "path": [[r5(x), r5(y)] for x, y in path],
                }
            )

    # Validation & report
    tube_lines = {line[0] for line in LINES if line[2] == "tube"}
    tube = [s for s in stations_out if tube_lines & set(s["lines"])]

    def tube_sf(station):
        values = [v for line, v in zip(station["lines"], station["sf"]) if line in tube_lines]
        return 2 if all(v == 2 for v in values) else (1 if any(values) else 0)

    full = sum(tube_sf(s) == 2 for s in tube)
    partial = sum(tube_sf(s) == 1 for s in tube)
    print(f"  stations: {len(stations_out)} ({len(tube)} tube: {full} full, {partial} partial)")
    print(f"  segments: {len(segments_out)} ({straight_fallbacks} straight-line fallbacks)")
    print(f"  usage: matched {len(usage_by_key)} stations, unmatched rows: {len(unmatched_usage)}")
    for row in unmatched_usage[:40]:
        print("    unmatched usage", row)
    for row in sorted(unmatched_naptans)[:20]:
        print("    naptan not in station data", row)
    missing_usage = [s["name"] for s in tube if s["usage"] is None]
    if missing_usage:
        print(f"  tube stations without usage: {missing_usage}")

    output = {
        "version": 1,
        "generated": date.today().isoformat(),
        "sources": {
            "routes": f"{API}/Line/{{id}}/Route/Sequence/{{direction}}",
            "stepFree": STATION_DATA_URL,
            "stepFreeFeedDate": feed_date,
            "usage": USAGE_URL,
            "usageYear": USAGE_YEAR,
            "attribution": "Powered by TfL Open Data. Contains OS data (c) Crown copyright and "
            "database rights 2016 and Geomni UK Map data (c) and database rights 2019.",
        },
        "lines": [
            {"id": i, "name": n, "mode": m, "color": c, "display": d} for i, n, m, c, d in LINES
        ],
        "stations": stations_out,
        "segments": segments_out,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(output, separators=(",", ":"), ensure_ascii=False))
    print(f"  wrote {OUT.relative_to(ROOT.parent)} ({OUT.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--refresh", action="store_true", help="re-download all raw data")
    arguments = parser.parse_args()
    try:
        build(arguments.refresh)
    except Exception as error:  # noqa: BLE001
        print(f"pipeline failed: {error}", file=sys.stderr)
        raise
