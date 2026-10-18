"""S0.1: Classify extracted path candidates into semantic geometry primitives.

Inputs: a list of path dicts from run.extract() (each has 'id','kind','bbox',
'length','angle','points'). Outputs: a list of Primitive objects with type
roof/column/support/decoration/curve/unknown plus the paths that compose it.

The classifier is *adaptive*: it uses the length distribution AND the
observed geometric extent of vertical strokes to decide whether the image
is "column-façade" (Greek/Roman temple style) or "non-column" (Chinese
pagoda / pavilion / temple / western façade with no tall pillars).  In the
non-column case, verticals that don't reach from the roof zone to the
ground zone are not promoted to "column" - they are decoration.

  roof       = horizontal stroke whose top edge is in the top 30% of the
               image and whose length is at or above the 70th percentile.
  column     = adaptive - see below.
  support    = remaining horizontal strokes whose length is at or above
               the 50th percentile (lintels, beams, base ledges, ground).
  decoration = strokes whose length is below the 25th percentile
               (handrails, brackets, ornamental marks).
  curve      = remaining curve strokes.
  unknown    = everything else (long verticals that did not reach the
               roof zone, isolated short horizontals mid-image, etc.).

Adaptive column rule:
  - Find the tallest vertical stroke in the image (largest bbox height).
  - If its bbox height covers more than 30% of the image height, the
    image is "column-façade": every vertical whose length is at the
    50th percentile or above is a column.
  - Otherwise, the image is "non-column": no primitive is tagged
    'column', and verticals default to decoration.
"""
from __future__ import annotations
from typing import Dict, List, Sequence, Tuple

ROOF = 'roof'
COLUMN = 'column'
SUPPORT = 'support'
DECORATION = 'decoration'
CURVE = 'curve'
UNKNOWN = 'unknown'

ALL_TYPES = (ROOF, COLUMN, SUPPORT, DECORATION, CURVE, UNKNOWN)

# Threshold for deciding whether the image contains a column-façade.
# A vertical must cover this fraction of the image height (in normalised
# coordinates) to qualify the image as "column-façade".
COLUMN_FACADE_MIN_HEIGHT = 0.30


def _percentile(values: Sequence[float], q: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    k = (len(s) - 1) * q
    f = int(k)
    c = min(f + 1, len(s) - 1)
    if f == c:
        return s[f]
    return s[f] + (s[c] - s[f]) * (k - f)


def _bbox_center(bbox: Sequence[float]) -> Tuple[float, float]:
    return (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2


def _bbox_height(bbox: Sequence[float]) -> float:
    return max(bbox[3] - bbox[1], 0.0)


def _is_column_facade(verticals: Sequence[dict]) -> Tuple[bool, float]:
    """Decide whether the image is "column-façade" based on the tallest
    vertical.  Returns (is_facade, max_vertical_height_fraction)."""
    if not verticals:
        return False, 0.0
    max_h = max(_bbox_height(p['bbox']) for p in verticals)
    return max_h >= COLUMN_FACADE_MIN_HEIGHT, max_h


def _make_primitive(p_type: str, paths: List[dict]) -> dict:
    """Build a primitive dict from a list of path dicts."""
    xs0 = min(p['bbox'][0] for p in paths)
    ys0 = min(p['bbox'][1] for p in paths)
    xs1 = max(p['bbox'][2] for p in paths)
    ys1 = max(p['bbox'][3] for p in paths)
    lengths = [p['length'] for p in paths]
    return dict(
        type=p_type,
        paths=paths,
        bbox=[xs0, ys0, xs1, ys1],
        count=len(paths),
        avg_length=round(sum(lengths) / len(lengths), 2),
        max_length=round(max(lengths), 2),
    )


def classify(paths: Sequence[dict]) -> Tuple[List[dict], List[dict], dict]:
    """Split paths into Primitive groups.  Returns (primitives, leftovers)."""
    paths = list(paths)
    if not paths:
        return [], [], dict(is_column_facade=False, max_vertical_height_fraction=0.0)

    lengths = [float(p.get('length', 0.0)) for p in paths]
    p25 = _percentile(lengths, 0.25)
    p50 = _percentile(lengths, 0.50)
    p70 = _percentile(lengths, 0.70)

    horizontals = [p for p in paths if p['kind'] == 'horizontal']
    verticals = [p for p in paths if p['kind'] == 'vertical']
    curves = [p for p in paths if p['kind'] == 'curve']

    is_facade, max_vh = _is_column_facade(verticals)

    used = set()
    prims: List[dict] = []

    # ---------- ROOF ----------
    # The roof is the highest (lowest y-centre) long horizontal stroke(s).
    # We pick strokes whose y-centre is at or above the 70th-percentile of
    # horizontal-stroke y-centres, and whose length is at the 50th-percentile
    # of horizontal-stroke lengths.  Greedy: include any horizontal within
    # 8% of the first accepted y-centre so layered roof structures combine.
    if horizontals:
        ys = sorted(_bbox_center(p['bbox'])[1] for p in horizontals)
        y_threshold = _percentile(ys, 0.30)  # top 30% of horizontals
        horiz_lens = sorted(p['length'] for p in horizontals)
        l_threshold = _percentile(horiz_lens, 0.50)
        roof_pool = [p for p in horizontals
                     if _bbox_center(p['bbox'])[1] <= y_threshold
                     and p['length'] >= l_threshold]
        roof_pool.sort(key=lambda p: -p['length'])
        if roof_pool:
            accepted_roof: List[dict] = [roof_pool[0]]
            accepted_roof_y = _bbox_center(roof_pool[0]['bbox'])[1]
            for p in roof_pool[1:]:
                yc = _bbox_center(p['bbox'])[1]
                if abs(yc - accepted_roof_y) <= 0.08 and p['length'] >= l_threshold * 0.6:
                    accepted_roof.append(p)
                    accepted_roof_y = (
                        accepted_roof_y * (len(accepted_roof) - 1) + yc
                    ) / len(accepted_roof)
            prims.append(_make_primitive(ROOF, accepted_roof))
            used.update(id(p) for p in accepted_roof)

    # ---------- COLUMN (adaptive) ----------
    if is_facade:
        # Column-façade: every vertical above p50 in length is a column.
        col_pool = [p for p in verticals if p['length'] >= p50]
        if col_pool:
            prims.append(_make_primitive(COLUMN, col_pool))
            used.update(id(p) for p in col_pool)
    # If not a column-façade, we skip the COLUMN primitive entirely;
    # verticals will be picked up by the decoration rule below.

    # ---------- SUPPORT ----------
    support_pool = [p for p in horizontals
                    if id(p) not in used and p['length'] >= p50]
    if support_pool:
        prims.append(_make_primitive(SUPPORT, support_pool))
        used.update(id(p) for p in support_pool)

    # ---------- DECORATION ----------
    # Below 25th-percentile length, regardless of kind.
    deco_pool = [p for p in paths
                 if id(p) not in used and p['length'] < p25]
    if deco_pool:
        prims.append(_make_primitive(DECORATION, deco_pool))
        used.update(id(p) for p in deco_pool)

    # ---------- CURVE (remaining) ----------
    curve_pool = [p for p in curves if id(p) not in used]
    if curve_pool:
        prims.append(_make_primitive(CURVE, curve_pool))
        used.update(id(p) for p in curve_pool)

    # ---------- UNKNOWN ----------
    leftovers = [p for p in paths if id(p) not in used]
    if leftovers:
        prims.append(_make_primitive(UNKNOWN, leftovers))

    # Attach the façade decision as metadata so downstream code can
    # surface it in logs.
    facade_meta = dict(
        is_column_facade=is_facade,
        max_vertical_height_fraction=round(max_vh, 4),
    )
    for pr in prims:
        pr['is_column_facade'] = is_facade
        pr['max_vertical_height_fraction'] = round(max_vh, 4)
    return prims, leftovers, facade_meta


def summarise(prims: List[dict]) -> dict:
    """Cheap summary for logs and tests."""
    by_type: Dict[str, int] = {t: 0 for t in ALL_TYPES}
    for pr in prims:
        by_type[pr['type']] = by_type.get(pr['type'], 0) + pr['count']
    return {
        'primitive_count': len(prims),
        'paths_by_type': by_type,
        'total_paths': sum(by_type.values()),
    }
