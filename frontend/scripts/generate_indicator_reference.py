#!/usr/bin/env python3
"""Generate independent reference vectors for OpenTrader indicators.

Reimplements each indicator from its canonical definition, replicating the
JS LCG dataset (including its double-precision quirk) so vectors can be
compared against frontend/src/Indicators outputs.

Usage: cd frontend && python3 scripts/generate_indicator_reference.py
(rewrites src/Indicators/__tests__/referenceVectors.json)
"""
import json, math
from datetime import datetime, timezone

# --- dataset (matches makeData in golden.test.js, JS double arithmetic) ---
seed = 42.0
def rand():
    global seed
    seed = float(seed * 1103515245.0 + 12345.0) % 2147483648.0
    return seed / 2147483648.0

DATA = []
close = 100.0
for i in range(120):
    drift = (rand() - 0.48) * 4
    o = close
    close = max(1.0, close + drift)
    h = max(o, close) + rand() * 2
    l = min(o, close) - rand() * 2
    v = 1000000 + int(rand() * 500000)
    DATA.append(dict(time=1700000000 + i * 86400, open=o, high=h, low=l, close=close, volume=v))

R = {}

def series(pairs):  # list of (index, value) -> [{time, value}]
    return [dict(time=DATA[i]['time'], value=v) for i, v in pairs]

# --- SMA ---
def sma(vals, length):
    out = []
    for i in range(length - 1, len(vals)):
        w = vals[i - length + 1:i + 1]
        if all(x is not None for x in w):
            out.append((i, sum(w) / length))
    return out

cl = [d['close'] for d in DATA]
hlc3 = [(d['high'] + d['low'] + d['close']) / 3 for d in DATA]
vol = [d['volume'] for d in DATA]
R['sma20close'] = series(sma(cl, 20))
R['sma7hlc3'] = series(sma(hlc3, 7))
R['sma10volume'] = series(sma(vol, 10))

# --- RSI (Wilder), smoothing SMA(10), BB(10, 2) population on smoothed ---
def wilder_rsi(vals, length):
    gains, losses = [0.0], [0.0]
    for i in range(1, len(vals)):
        d = vals[i] - vals[i - 1]
        gains.append(max(0.0, d)); losses.append(max(0.0, -d))
    out = []
    ag = sum(gains[1:length + 1]) / length
    al = sum(losses[1:length + 1]) / length
    def rsi_of(ag, al):
        if al != 0: return 100 - 100 / (1 + ag / al)
        return 50.0 if ag == 0 else 100.0
    out.append((length, rsi_of(ag, al)))
    for i in range(length + 1, len(vals)):
        ag = (ag * (length - 1) + gains[i]) / length
        al = (al * (length - 1) + losses[i]) / length
        out.append((i, rsi_of(ag, al)))
    return out

rsi = wilder_rsi(cl, 14)
R['rsi14'] = series(rsi)
rsi_map = dict(rsi)
smoothed = []
for i in range(len(DATA)):
    w = [rsi_map.get(j) for j in range(i - 9, i + 1)]
    if len(w) == 10 and all(x is not None for x in w):
        smoothed.append((i, sum(w) / 10))
R['rsiSmoothed10'] = series(smoothed)
sm_map = dict(smoothed)
bbu, bbl = [], []
for i in range(len(DATA)):
    w = [sm_map.get(j) for j in range(i - 9, i + 1)]
    if len(w) == 10 and all(x is not None for x in w):
        m = sum(w) / 10
        sd = math.sqrt(sum((x - m) ** 2 for x in w) / 10)
        bbu.append((i, m + 2 * sd)); bbl.append((i, m - 2 * sd))
R['rsiBBupper'] = series(bbu)
R['rsiBBlower'] = series(bbl)

# --- Normalized MACD (12,26,9,100) ---
def ema_first_seed(vals, length):
    k = 2 / (length + 1)
    out = [vals[0]]
    for i in range(1, len(vals)):
        out.append((vals[i] - out[-1]) * k + out[-1])
    return out

ef = ema_first_seed(cl, 12); es = ema_first_seed(cl, 26)
macd_raw = [f - s for f, s in zip(ef, es)]
sig_raw = ema_first_seed(macd_raw, 9)
NB = 100
mn, sn, hn = [], [], [(i, 0.0) for i in range(NB - 1)]
for i in range(NB - 1, len(DATA)):
    wm = macd_raw[i - NB + 1:i + 1]; ws = sig_raw[i - NB + 1:i + 1]
    lo, hi = min(wm), max(wm)
    m = 2 * (macd_raw[i] - lo) / (hi - lo) - 1 if hi != lo else 0.0
    lo, hi = min(ws), max(ws)
    s = 2 * (sig_raw[i] - lo) / (hi - lo) - 1 if hi != lo else 0.0
    mn.append((i, m)); sn.append((i, s)); hn.append((i, m - s))
R['macdNorm'] = series(mn)
R['macdSignalNorm'] = series(sn)
R['macdHistNorm'] = series(hn)

# --- Bollinger (20, 2, close) ---
bb_b, bb_u, bb_l = [], [], []
for i in range(19, len(DATA)):
    w = cl[i - 19:i + 1]
    m = sum(w) / 20
    sd = math.sqrt(sum((x - m) ** 2 for x in w) / 20)
    bb_b.append((i, m)); bb_u.append((i, m + 2 * sd)); bb_l.append((i, m - 2 * sd))
R['bbBasis'] = series(bb_b)
R['bbUpper'] = series(bb_u)
R['bbLower'] = series(bb_l)

# --- Stochastic (14, 3), JS rounds to 2 decimals ---
kk = {}
for i in range(13, len(DATA)):
    w = DATA[i - 13:i + 1]
    lo = min(d['low'] for d in w); hi = max(d['high'] for d in w)
    kk[i] = 100 * (DATA[i]['close'] - lo) / (hi - lo) if hi != lo else 50.0
dd = {}
for i in sorted(kk):
    w = [kk.get(j) for j in range(i - 2, i + 1)]
    if all(x is not None for x in w):
        dd[i] = sum(w) / 3
R['stochK'] = series(sorted(kk.items()))
R['stochD'] = series(sorted(dd.items()))

# --- ATR (Wilder, 14) and (10) for supertrend ---
def wilder_atr(length):
    trs = []
    for i, d in enumerate(DATA):
        pc = DATA[i - 1]['close'] if i > 0 else d['high']
        trs.append(max(d['high'] - d['low'], abs(d['high'] - pc), abs(d['low'] - pc)))
    a = sum(trs[:length]) / length
    out = [(length - 1, a)]
    for i in range(length, len(DATA)):
        a = (a * (length - 1) + trs[i]) / length
        out.append((i, a))
    return out

R['atr14'] = series(wilder_atr(14))

# --- Supertrend (10, 3), Wilder ATR ---
atr10 = dict(wilder_atr(10))
ub = [0.0] * 120; lb = [0.0] * 120; tr = [0] * 120
st = []
for i in range(120):
    if i not in atr10: continue
    a = atr10[i]
    hl2 = (DATA[i]['high'] + DATA[i]['low']) / 2
    bub, blb = hl2 + 3 * a, hl2 - 3 * a
    if i == 0 or (i - 1) not in atr10:
        ub[i], lb[i], tr[i] = bub, blb, 1
    else:
        pc = DATA[i - 1]['close']
        ub[i] = bub if (bub < ub[i - 1] or pc > ub[i - 1]) else ub[i - 1]
        lb[i] = blb if (blb > lb[i - 1] or pc < lb[i - 1]) else lb[i - 1]
        c = DATA[i]['close']
        if c > ub[i - 1]: tr[i] = 1
        elif c < lb[i - 1]: tr[i] = -1
        else: tr[i] = tr[i - 1] or 1
    st.append((i, lb[i] if tr[i] == 1 else ub[i], tr[i]))
R['supertrend'] = [dict(time=DATA[i]['time'], value=v, trend=t) for i, v, t in st]

# --- ADL ---
adl = 0.0; adl_out = []
for i, d in enumerate(DATA):
    rng = d['high'] - d['low']
    mfm = 0.0 if rng == 0 else ((d['close'] - d['low']) - (d['high'] - d['close'])) / rng
    adl += mfm * d['volume']
    adl_out.append((i, adl))
R['adl'] = series(adl_out)

# --- W52 ---
WEEK = 7 * 86400
def week_start(t):
    d = datetime.fromtimestamp(t, tz=timezone.utc)
    midnight = t - (d.hour * 3600 + d.minute * 60 + d.second)
    return midnight - d.weekday() * 86400

for basis in ('highlow', 'close'):
    use_close = basis == 'close'
    hv = lambda d: d['close'] if use_close else d['high']
    lv = lambda d: d['close'] if use_close else d['low']
    hi_out, lo_out = [], []
    for i, d in enumerate(DATA):
        wstart = week_start(d['time']) - 51 * WEEK
        w = [x for x in DATA[:i + 1] if x['time'] >= wstart]
        hi_out.append((i, max(hv(x) for x in w)))
        lo_out.append((i, min(lv(x) for x in w)))
    R['w52High_' + basis] = series(hi_out)
    R['w52Low_' + basis] = series(lo_out)

# --- TSI (25, 13, 13) ---
def ema_null_seed(vals, length):
    a = 2 / (length + 1)
    out = [None] * len(vals)
    fi = next((i for i, v in enumerate(vals) if v is not None), None)
    if fi is None: return out
    out[fi] = vals[fi]
    for i in range(fi + 1, len(vals)):
        out[i] = a * vals[i] + (1 - a) * out[i - 1] if vals[i] is not None else None
    return out

pc = [None] + [DATA[i]['close'] - DATA[i - 1]['close'] for i in range(1, 120)]
apc = [None if v is None else abs(v) for v in pc]
e1 = ema_null_seed(pc, 25); e2 = ema_null_seed(e1, 13)
a1 = ema_null_seed(apc, 25); a2 = ema_null_seed(a1, 13)
tsi = [100 * (m / a) if (m is not None and a) else None for m, a in zip(e2, a2)]
sig = ema_null_seed(tsi, 13)
warmup = 25 + 13 + 13
R['tsi'] = series([(i, v) for i, v in enumerate(tsi) if v is not None and i >= warmup])
R['tsiSignal'] = series([(i, v) for i, v in enumerate(sig) if v is not None and i >= warmup])

# --- Ichimoku (9, 26, 52, 26) ---
def roll_hl2(idx, length):
    if idx < length - 1: return None
    w = DATA[idx - length + 1:idx + 1]
    return (max(d['high'] for d in w) + min(d['low'] for d in w)) / 2

tenkan = [roll_hl2(i, 9) for i in range(120)]
kijun = [roll_hl2(i, 26) for i in range(120)]
spanA = [(tenkan[i - 26] + kijun[i - 26]) / 2 if i >= 26 and tenkan[i - 26] is not None and kijun[i - 26] is not None else None for i in range(120)]
spanB = [roll_hl2(i - 26, 52) if i >= 26 else None for i in range(120)]
chikou = [DATA[i + 26]['close'] if i < 120 - 26 else None for i in range(120)]
R['ichimokuTenkan'] = series([(i, v) for i, v in enumerate(tenkan) if v is not None])
R['ichimokuKijun'] = series([(i, v) for i, v in enumerate(kijun) if v is not None])
R['ichimokuSpanA'] = series([(i, v) for i, v in enumerate(spanA) if v is not None])
R['ichimokuSpanB'] = series([(i, v) for i, v in enumerate(spanB) if v is not None])
R['ichimokuChikou'] = series([(i, v) for i, v in enumerate(chikou) if v is not None])

# --- Volume Profile (40 bins) ---
tp = [(d['high'] + d['low'] + d['close']) / 3 for d in DATA]
pmin, pmax = min(tp), max(tp)
bsz = (pmax - pmin) / 40
bins = [dict(low=pmin + i * bsz, high=pmin + (i + 1) * bsz, volume=0) for i in range(40)]
for i, p in enumerate(tp):
    bi = int((p - pmin) / bsz)
    bi = min(max(bi, 0), 39)
    bins[bi]['volume'] += DATA[i]['volume']
mx = max(b['volume'] for b in bins)
R['volumeProfile'] = [dict(low=b['low'], high=b['high'], volume=b['volume'],
                           normalizedVolume=b['volume'] / mx,
                           center=(b['low'] + b['high']) / 2) for b in bins]

# --- Market Index (halves as in golden test) ---
half = 60
aapl = DATA[:half]
msft = [dict(d, time=DATA[i]['time']) for i, d in enumerate(DATA[half:])]
times = sorted(set([b['time'] for b in aapl] + [b['time'] for b in msft]))
prev = {'A': None, 'M': None}
amap = {b['time']: b['close'] for b in aapl}
mmap = {b['time']: b['close'] for b in msft}
idx = 100.0; smi = []
for t in times:
    ws = 0.0; started = False
    for key, mp in (('A', amap), ('M', mmap)):
        c = mp.get(t)
        if c is not None:
            if prev[key] is not None:
                ws += ((c / prev[key]) - 1) * 0.5
                started = True
            prev[key] = c
    if not started: continue
    idx *= 1 + ws
    smi.append(dict(time=t, value=idx))
R['smi'] = smi

with open('src/Indicators/__tests__/referenceVectors.json', 'w') as f:
    json.dump(R, f)
print('wrote', sum(len(v) for v in R.values()), 'points across', len(R), 'series')
