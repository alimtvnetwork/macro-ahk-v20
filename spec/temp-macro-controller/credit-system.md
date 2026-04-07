# 06 — Credit System Specification

**Version**: v7.17
**Last Updated**: 2026-02-25

---

## Credit Pools

Each Lovable workspace has 5 credit pools:

| Pool | Emoji | Label | Description |
|------|-------|-------|-------------|
| **Granted** | 🎁 | Bonus | Promotional one-time credits |
| **Billing Period** | 💰 | Monthly | Credits from subscription plan |
| **Rollover** | 🔄 | Rollover | Unused credits carried from previous billing period |
| **Daily Free** | 📅 | Free | Free credits refreshed daily (typically 5) |
| **Topup** | — | Topup | Purchased top-up credits |

---

## Formulas

```
Total Credits     = credits_granted + daily_credits_limit + billing_period_credits_limit
                    + topup_credits_limit + rollover_credits_limit

Available Credits = Total Credits - rollover_credits_used - daily_credits_used
                    - billing_period_credits_used

Free Credit Avail = daily_credits_limit - daily_credits_used
```

**Implementation**: Shared helper functions `calcTotalCredits()`, `calcAvailableCredits()`, `calcFreeCreditAvailable()` in both controllers. **No inline arithmetic allowed** (Engineering Standard #14).

---

## Progress Bar Specification

### Segment Order (left to right)

| Position | Pool | Color Gradient | Label Color | Text Label |
|----------|------|---------------|-------------|------------|
| 1st | 🎁 Bonus (Granted) | `#7c3aed` → `#a78bfa` (purple) | `#a78bfa` | `🎁{value}` |
| 2nd | 💰 Monthly (Billing) | `#22c55e` → `#4ade80` (green) | `#4ade80` | `💰{value}` |
| 3rd | 🔄 Rollover | `#6b7280` → `#9ca3af` (gray) | `#9ca3af` | `🔄{value}` |
| 4th | 📅 Free (Daily) | `#d97706` → `#facc15` (yellow) | `#facc15` | `📅{value}` |

### Visual Styling

- **Bar height**: 14px (combo), 12px (macro workspace items)
- **Background**: `rgba(239,68,68,0.25)` (reddish tint = used credits)
- **Border**: `1px solid rgba(255,255,255,0.12)` with `inset box-shadow`
- **Width**: 300px max (combo), 260px max (macro)
- **Label format**: `⚡{available}/{total}` where available is cyan bold, total is gray dimmed

### Segment Rules

- Each segment width = `max(2%, value/total * 100%)` — minimum 2% ensures visibility
- Segments only render if value > 0
- The 🎁 Bonus segment only appears if `freeRemaining > 0`
- Every credit type in the Total Credits formula MUST have a bar segment (Standard #9 — Bar Segment Completeness)

### Rendering Sites

All 3 sites MUST use identical segment order, colors, and formulas:

1. **MacroLoop workspace items** — `renderLoopWorkspaceList()` in `macro-looping.js`
2. **MacroLoop top-level status bar** — `updateStatus()` in `macro-looping.js`
3. **ComboSwitch workspace items** — workspace rendering IIFE in `combo.js`

### Text Labels (next to progress bar)

```
🎁{bonus} 💰{monthly} 🔄{rollover} 📅{free} ⚡{available}/{total}
```

Each label has a tooltip explaining what the credit type means.

---

## Loop Trigger Logic

The MacroLoop auto-move is triggered when `dailyFree == 0` (not total available). This means the loop moves to a new workspace when free daily credits are depleted, even if billing/rollover credits remain.

**Smart switching**: `moveToAdjacentWorkspace()` fetches fresh data, walks in the requested direction, and finds the first workspace with `dailyFree > 0`, skipping depleted ones.

---

## CSV Export

The 📋 CSV button exports all workspace credit data:
- Sorted ascending by workspace name (case-insensitive)
- 17 columns: Name, Daily Used, Daily Limit, Daily Free, Rollover Used, Rollover Limit, Rollover Available, Billing Used, Billing Limit, Billing Available, Granted, Granted Used, Granted Remaining, Topup Limit, Total Credits, Available Credits, Subscription Status
- File name: `workspaces-credits-YYYY-MM-DD.csv`
