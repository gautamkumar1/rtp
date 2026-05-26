#!/usr/bin/env python3
"""
Minimal Python reimplementation of MathModel006 Cat 6 base game mechanics.
Only base game (no free spins), no scatter injection.
Just to verify: does the Java cascade mechanic give higher base RTP than our Go code?
"""

import random
import sys

# Symbol IDs
H1, H2, H3, H4 = 1, 2, 3, 4
N1, N2, N3, N4, N5 = 11, 12, 13, 14, 15
F = 31  # scatter
B = 41  # bonus

# From Strips.java (reel 0)
BASE_STRIPS = [
    [12,12,2,2,11,11,4,4,12,12,12,13,13,14,14,14,2,3,3,1,1,1,2,11,11,13,13,12,12,14,13,13,1,1,14,14,2,2,3,12,12,3,1,13,13,13,4,4,1,4,14,13,11,11,4,3,3,4,2,3,2,13,14,14,4,4,3,11,11,14,14,3,3,2,2,11,11,14,13,1,1,15,15,11,11,3,3,4,4,14,15,1,13,14,14,11,15,15,13,13,2,2,14,14,11,11,12,12,15,15,11,11,4,4,12,12,13,13,14,14,14,2,3,15,1,1,1,15,11,11,13,13,12,12,14,13,13],
    [14,1,1,4,13,11,12,12,3,3,14,14,2,2,4,4,14,13,13,2,2,1,13,13,13,2,14,3,11,11,1,3,12,12,12,2,4,1,11,11,1,1,13,13,14,14,11,11,14,1,1,3,14,14,14,1,3,4,14,11,1,12,12,15,15,14,14,12,12,13,13,3,3,11,4,4,11,14,14,15,15,3,2,13,4,4,3,3,12,12,1,13,13,4,4,2,2,15,15,13,14,15,15,14,11,11,11,14,13,13,4,13,11,12,12,3,3,14,14,2,2,4,4,14,13,13,2,2,1,13,13,13,15,14,3,11,11],
    [3,2,2,14,4,12,12,13,13,3,3,3,1,4,4,3,3,2,11,11,1,11,2,2,12,14,14,3,3,11,11,2,1,1,11,12,12,1,14,14,12,1,12,2,11,14,13,1,1,11,4,3,13,13,1,2,3,4,4,2,2,4,4,4,11,14,14,13,13,11,2,2,15,15,12,12,1,13,12,14,14,12,12,14,14,13,11,3,3,11,11,2,2,1,4,12,12,13,13,12,12,4,4,12,15,15,13,1,1,13,3,3,13,13,15,15,11,11,14,14,12,12,15,15,15,1,14,13,15,15,15,4,4,12,15,15,15],
    [14,14,1,1,12,12,3,14,13,13,1,3,11,11,3,3,1,4,4,4,12,12,2,14,2,1,11,2,14,3,3,2,11,11,12,12,11,14,1,1,14,13,12,2,2,12,13,15,14,14,14,2,2,4,4,4,15,15,15,14,14,11,4,4,13,13,13,1,15,11,14,12,11,3,13,3,15,14,11,11,15,15,15,12,12,4,4,13,13,1,1,12,12,15,15,15,13,13,2,2,12,12,14,14,11,11,12,12,3,14,13,13,15,15,11,11,3,3,1,4,4,4,12,12,2,14,15,1,11,2,14,3,3,2,11,11,12],
    [4,12,4,11,4,2,2,1,3,3,3,13,13,1,13,4,13,14,14,4,12,12,14,13,13,2,15,4,4,3,1,1,4,4,12,12,11,12,11,1,14,14,11,1,1,11,11,15,15,14,13,12,11,4,3,2,1,15,15,3,3,12,12,2,2,1,4,11,12,13,14,15,4,4,3,2,2,1,15,15,15,4,14,14,13,13,12,12,2,2,11,11,3,3,14,15,15,15,13,13,11,11,12,12,15,15,15,1,1,3,3,14,13,13,4,12,4,15,4,2,2,1,12,12,12,13,1,13,4,13,14,14,4,12,12,14,13],
    [4,4,11,2,2,1,1,4,12,12,3,3,3,2,4,14,14,4,12,12,12,11,11,1,11,14,13,13,2,1,4,4,3,3,11,1,1,13,13,2,2,2,13,1,13,1,14,14,11,11,14,11,1,3,3,3,1,2,14,14,11,11,4,2,2,1,14,14,15,3,3,12,12,11,13,13,13,12,12,1,3,2,3,4,11,11,13,13,14,14,4,3,3,2,2,12,12,14,14,15,15,3,3,13,13,11,11,4,4,15,2,2,1,1,4,12,12,3,3,3,15,4,14,14,4,12,12,15,15,1,15,14,13,13,15,15,4],
]

ROWS = 5

# Paytable: payout[symbolCount-1], 15 entries
PAYTABLE = {
    1:  [0,0,0,0,0,0,0, 200, 200, 500, 500, 1000, 1000, 1000, 1000],
    2:  [0,0,0,0,0,0,0, 50, 50, 200, 200, 500, 500, 500, 500],
    3:  [0,0,0,0,0,0,0, 40, 40, 100, 100, 300, 300, 300, 300],
    4:  [0,0,0,0,0,0,0, 30, 30, 40, 40, 240, 240, 240, 240],
    11: [0,0,0,0,0,0,0, 20, 20, 30, 30, 200, 200, 200, 200],
    12: [0,0,0,0,0,0,0, 16, 16, 24, 24, 160, 160, 160, 160],
    13: [0,0,0,0,0,0,0, 10, 10, 20, 20, 100, 100, 100, 100],
    14: [0,0,0,0,0,0,0, 8, 8, 18, 18, 80, 80, 80, 80],
    15: [0,0,0,0,0,0,0, 5, 5, 15, 15, 40, 40, 40, 40],
    31: [0, 0, 0, 3, 5, 100],  # scatter
}

REEL_COST = 20

def random_positions(strips):
    """Pick random stop positions for each reel."""
    return [random.randrange(len(s)) for s in strips]

def fill_window(strips, stop_positions, rows):
    """Fill window from strips using stop positions (Java-style: bottom-up, backward)."""
    window = []
    result_positions = []
    for i, strip in enumerate(strips):
        n = len(strip)
        col = [None] * rows
        pos_col = [None] * rows
        position = stop_positions[i] + rows - 2
        for j in range(rows - 1, -1, -1):
            position = position % n
            col[j] = strip[position]
            pos_col[j] = position
            position -= 1
        window.append(col)
        result_positions.append(pos_col)
    return window, result_positions

def fill_window_with_elim(strips, stop_positions, rows, eliminate_positions):
    """Fill window skipping eliminated positions."""
    window = []
    result_positions = []
    for i, strip in enumerate(strips):
        n = len(strip)
        col = [None] * rows
        pos_col = [None] * rows
        position = stop_positions[i] + rows - 2
        for j in range(rows - 1, -1, -1):
            position = position % n
            while position in eliminate_positions[i]:
                position -= 1
                if position < 0:
                    position += n
            col[j] = strip[position]
            pos_col[j] = position
            position -= 1
        window.append(col)
        result_positions.append(pos_col)
    return window, result_positions

def evaluate_ways_pays(window):
    """Count symbols and compute pays."""
    counts = {}
    for col in window:
        for sym in col:
            counts[sym] = counts.get(sym, 0) + 1

    total_pay = 0.0
    winning_symbols = []
    cumulative_win = 0.0

    for sym, count in counts.items():
        if sym not in PAYTABLE:
            continue
        payrow = PAYTABLE[sym]
        if count > 7:  # >=8
            pay = payrow[min(count, 12) - 1]  # Java: payout[symbolCount > 12 ? 12 : symbolCount-1]
            if pay > 0:
                total_pay += pay
                cumulative_win += pay
                if sym <= 20:  # only eliminate non-F/B symbols
                    winning_symbols.append(sym)

    return total_pay, winning_symbols, cumulative_win

def simulate_base_spin(strips, stop_positions, rows=5):
    """Run one base spin with cascades."""
    eliminate_positions = [set() for _ in strips]
    result_positions_all = None
    cumulative_win = 0.0
    respin_count = 0

    while True:
        if respin_count == 0:
            window, result_positions_all = fill_window(strips, stop_positions, rows)
        else:
            window, result_positions_all = fill_window_with_elim(
                strips, stop_positions, rows, eliminate_positions)

        pay, win_syms, this_win = evaluate_ways_pays(window)
        cumulative_win += this_win

        if not win_syms:
            # No more wins
            break

        # Eliminate winning positions
        for i, col in enumerate(window):
            for j, sym in enumerate(col):
                if sym in win_syms:
                    pos = result_positions_all[i][j]
                    eliminate_positions[i].add(pos)

        respin_count += 1

    return cumulative_win, respin_count

FREE_STRIPS = [
    [12,12,12,15,11,11,4,4,12,41,12,13,13,14,14,14,2,3,3,1,1,1,11,11,11,13,13,12,12,41,13,13,13,14,14,14,2,2,12,12,12,3,1,13,13,13,4,4,4,14,14,13,11,11,4,3,3,4,4,2,2,13,41,14,4,4,3,11,11,14,14,3,3,2,2,11,11,14,13,1,1,1,11,11,11,3,3,4,4,14,14,13,13,14,14,14,14,13,13,13,2,2,14,14,11,11,31],
    [14,13,13,4,13,11,12,12,3,3,14,14,2,2,4,4,14,13,13,2,2,1,13,13,13,15,14,3,11,11,1,3,12,12,12,12,1,1,11,11,11,11,41,13,14,14,11,11,14,1,1,3,14,14,14,14,14,14,14,11,1,12,12,12,12,41,14,12,12,13,13,3,3,11,4,4,11,14,14,14,3,3,2,13,4,4,3,3,12,12,1,13,13,4,4,2,2,2,13,13,13,14,14,14,11,11,31],
    [3,2,2,14,4,12,12,13,41,15,15,15,1,4,4,3,3,15,11,11,1,15,15,2,12,14,14,3,3,11,11,2,1,1,15,12,12,1,15,15,12,1,12,2,15,15,13,1,1,11,4,3,13,13,15,15,15,4,4,2,2,4,4,4,15,14,41,13,13,11,2,2,2,13,13,12,1,13,14,14,14,12,12,14,14,11,11,3,3,11,11,2,2,1,12,12,12,13,13,12,12,4,4,12,12,13,13,1,1,31],
    [14,14,11,11,12,12,3,14,13,13,15,15,11,11,3,3,1,4,4,4,12,12,2,14,15,1,11,2,14,3,3,2,11,11,12,12,11,14,1,1,14,13,12,2,2,12,13,15,41,14,14,2,2,4,4,4,15,15,15,14,14,11,4,4,13,13,13,1,15,11,14,12,11,13,3,3,15,15,11,11,41,15,15,12,12,4,4,13,13,1,1,12,12,15,15,15,13,13,2,2,12,12,12,31],
    [4,12,4,15,4,2,2,1,12,15,12,13,41,1,13,4,13,14,14,4,12,12,14,13,13,2,15,4,4,3,1,1,4,4,12,12,11,12,11,1,14,14,11,1,1,11,11,15,41,14,13,12,11,4,3,2,1,1,3,3,3,12,12,2,2,1,4,11,12,13,14,14,4,4,3,2,2,1,1,4,4,4,14,14,13,13,12,12,2,2,11,11,3,3,15,14,14,13,13,13,11,11,12,12,12,12,1,1,1,31],
    [4,4,15,2,2,1,1,4,12,12,3,3,3,4,4,14,14,4,41,12,12,12,1,1,14,14,41,13,13,4,4,4,3,3,11,1,1,13,13,2,2,2,13,1,13,1,14,14,11,11,14,11,1,3,3,3,1,14,14,14,12,12,4,2,2,1,14,41,3,3,3,12,12,11,13,13,13,12,12,12,3,3,3,4,11,11,13,13,14,14,4,3,3,2,2,12,12,14,14,14,3,3,3,13,13,11,31],
]

BONUS_WEIGHTS = [(2,105),(3,105),(5,105),(8,25),(10,13),(12,8),(15,4),(18,3),(20,2),(25,1),(30,1),(35,1),(50,1),(100,1)]
BONUS_SYMBOL = 41

def draw_bonus_multiplier():
    total = sum(w for _,w in BONUS_WEIGHTS)
    r = random.randint(0, total-1)
    for v,w in BONUS_WEIGHTS:
        if r < w:
            return v
        r -= w
    return BONUS_WEIGHTS[-1][0]

def simulate_free_spin(strips, stop_positions, rows=5):
    """Run one free spin with cascades."""
    eliminate_positions = [set() for _ in strips]
    cumulative_win = 0.0

    while True:
        window, result_positions_all = fill_window_with_elim(
            strips, stop_positions, rows, eliminate_positions) if any(eliminate_positions) else fill_window(strips, stop_positions, rows)

        pay, win_syms, this_win = evaluate_ways_pays(window)
        cumulative_win += this_win

        if not win_syms:
            # Apply bonus multiplier if cumulative > 0
            if cumulative_win > 0:
                total_mult = 0
                for col in window:
                    for sym in col:
                        if sym == BONUS_SYMBOL:
                            total_mult += draw_bonus_multiplier()
                if total_mult > 0:
                    # Java: cumulative * totalMult via: cumulativeWin * (totalMult-1) added
                    # Equivalent to: cumulative *= totalMult
                    cumulative_win *= total_mult
            break

        for i, col in enumerate(window):
            for j, sym in enumerate(col):
                if sym in win_syms:
                    pos = result_positions_all[i][j]
                    eliminate_positions[i].add(pos)

    return cumulative_win

def run_simulation_full(n_spins, mode=0):
    """Full simulation including scatter injection and free spins."""
    # Scatter weights for mode 0
    if mode == 0:
        scatter_weights = [(1,6),(0,29)]
    elif mode == 1:
        scatter_weights = [(1,10),(0,47)]
    elif mode == 2:
        scatter_weights = [(1,7),(0,32)]

    base_total = 0.0
    free_total = 0.0
    triggers = 0
    total_scatter = 0.0

    def weighted_draw():
        total = sum(w for _,w in scatter_weights)
        r = random.randint(0, total-1)
        for v,w in scatter_weights:
            if r < w: return v
            r -= w
        return scatter_weights[-1][0]

    for _ in range(n_spins):
        stop_positions = random_positions(BASE_STRIPS)
        base_win, respin_count = simulate_base_spin(BASE_STRIPS, stop_positions)
        base_total += base_win

        scatter_count = 0
        # Inject scatter only if no cascade wins
        if base_win == 0:
            # Per-column scatter injection
            window, _ = fill_window(BASE_STRIPS, stop_positions, ROWS)
            for c in range(len(BASE_STRIPS)):
                if weighted_draw() == 1:
                    row = random.randint(0, ROWS - 1)
                    scatter_count += 1  # just count, don't need to update window for counting

            # Count scatter pay
            if scatter_count > 3:  # threshold=3, so need >3 = >=4
                scatter_pays_tbl = [0, 0, 0, 3, 5, 100]  # scatter payout[0..5], index = count-1
                s_pay = scatter_pays_tbl[min(scatter_count, 6) - 1] * REEL_COST
                total_scatter += s_pay
                base_total += s_pay

                # Trigger free spins
                triggers += 1
                total_free_spins = 10
                fs = 0
                while fs < total_free_spins:
                    fs_stop = random_positions(FREE_STRIPS)
                    fs_win = simulate_free_spin(FREE_STRIPS, fs_stop)
                    free_total += fs_win

                    # Retrigger check: scatter count >= 2 in free strips?
                    # Count scatters in free window
                    free_window, _ = fill_window(FREE_STRIPS, fs_stop, ROWS)
                    free_scatter = sum(1 for col in free_window for sym in col if sym == 31)
                    if free_scatter > 2:  # threshold=2
                        s_pay2 = [0, 0, 3, 5, 100][min(free_scatter, 5) - 2] * REEL_COST if free_scatter >= 3 else 0  # simplified
                        free_total += s_pay2
                        total_free_spins += 5
                    fs += 1

    total_bet = n_spins * REEL_COST
    print(f"Mode {mode}, N={n_spins}: BaseRTP={base_total/total_bet:.4f} FreeRTP={free_total/total_bet:.4f} TotalRTP={(base_total+free_total)/total_bet:.4f} Triggers={triggers} ScatterRTP={total_scatter/total_bet:.4f}")

def run_simulation(n_spins):
    base_total = 0.0
    hits = 0

    for _ in range(n_spins):
        stop_positions = random_positions(BASE_STRIPS)
        win, respin_count = simulate_base_spin(BASE_STRIPS, stop_positions)
        base_total += win
        if win > 0:
            hits += 1

    base_rtp = base_total / (n_spins * REEL_COST)
    hit_rate = hits / n_spins
    print(f"N={n_spins}: BaseWin={base_total:.0f} BaseRTP={base_rtp:.4f} HitRate={hit_rate:.4f}")

if __name__ == "__main__":
    random.seed(42)
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 100000
    run_simulation(n)
    run_simulation_full(n, mode=0)
