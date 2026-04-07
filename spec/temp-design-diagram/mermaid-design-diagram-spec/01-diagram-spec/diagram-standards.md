# Diagram Standards Specification

Updated: 2026-04-02

## Overview

All workflow and architecture diagrams in this project follow a standardized **XMind-inspired dark-mode** aesthetic. This spec ensures any contributor can produce visually consistent, readable diagrams.

## File Format & Location

- **Format**: Mermaid `.mmd` files
- **Location**: `standalone-scripts/macro-controller/diagrams/`
- **Layout**: Always `flowchart TD` (top-down)

## Init Block (copy-paste)

Every diagram MUST start with this exact init block:

```mermaid
%%{init: {'theme': 'dark', 'themeVariables': {'darkMode': true, 'background': '#222222', 'primaryColor': '#F5A623', 'primaryTextColor': '#1a1a1a', 'lineColor': '#666', 'fontSize': '13px'}}}%%
```

## Color Palette

Use up to 6 branch colors. Each branch gets a **filled heading node** and **dark sub-nodes** with matching thin borders.

| Slot | Name    | Hex       | Heading text | Sub text  | Use for                  |
|------|---------|-----------|--------------|-----------|--------------------------|
| 1    | Emerald | `#10B981` | `#fff`       | `#e0e0e0` | Sources, inputs, triggers |
| 2    | Sky     | `#0EA5E9` | `#fff`       | `#e0e0e0` | Processing, scanning      |
| 3    | Rose    | `#F43F5E` | `#fff`       | `#e0e0e0` | Critical paths, bridges   |
| 4    | Amber   | `#F59E0B` | `#1a1a1a`   | `#e0e0e0` | Outputs, success states   |
| 5    | Violet  | `#8B5CF6` | `#fff`       | `#e0e0e0` | Internal ops, deploy      |
| 6    | Cyan    | `#06B6D4` | `#fff`       | `#e0e0e0` | UI, sync, broadcast       |

**Root node** is always Amber filled: `fill:#F5A623, color:#1a1a1a, stroke-width:0px`.

## Node Hierarchy

### Level 0 — Root
```
classDef root fill:#F5A623,stroke:#F5A623,color:#1a1a1a,stroke-width:0px,font-weight:bold,font-size:15px
ROOT(["Diagram Title"]):::root
```

### Level 1 — Branch Headings (colored fill, white/dark text, bold, 2px stroke)
```
classDef emerald fill:#10B981,stroke:#10B981,color:#fff,stroke-width:2px,font-weight:bold
SRC(["Source Files"]):::emerald
```

### Level 2+ — Sub-nodes (dark fill `#2a2a2a`, thin 1px border inheriting branch color, light text)
```
classDef emeraldSub fill:#2a2a2a,stroke:#10B981,color:#e0e0e0,stroke-width:1px
F1(["01-start-prompt/"]):::emeraldSub
```

## Node Shape

Always use stadium/pill shape: `(["Label text"])` — this creates the rounded rectangle.

## Connections

| Type | Syntax | Use |
|------|--------|-----|
| Structural (parent-child) | `-->` | Hierarchy within a branch |
| Cross-flow (data movement) | `-.->│"label"│` | Links between branches |

- Use `-->` for all parent-to-child relationships
- Use dotted arrows `-.->` only for cross-branch data flow with a label
- Fan-out shorthand: `ROOT --> A & B & C` for root-to-branches

## Naming Conventions

- **Node IDs**: Short uppercase, 2-4 chars (e.g., `SRC`, `T1`, `S0A`)
- **Labels**: Title Case for headings, sentence case for sub-nodes
- **No emojis** in Mermaid syntax (causes lexer errors)

## Complete classDef Block (copy-paste)

```mermaid
classDef root fill:#F5A623,stroke:#F5A623,color:#1a1a1a,stroke-width:0px,font-weight:bold,font-size:15px
classDef emerald fill:#10B981,stroke:#10B981,color:#fff,stroke-width:2px,font-weight:bold
classDef emeraldSub fill:#2a2a2a,stroke:#10B981,color:#e0e0e0,stroke-width:1px
classDef sky fill:#0EA5E9,stroke:#0EA5E9,color:#fff,stroke-width:2px,font-weight:bold
classDef skySub fill:#2a2a2a,stroke:#0EA5E9,color:#e0e0e0,stroke-width:1px
classDef rose fill:#F43F5E,stroke:#F43F5E,color:#fff,stroke-width:2px,font-weight:bold
classDef roseSub fill:#2a2a2a,stroke:#F43F5E,color:#e0e0e0,stroke-width:1px
classDef amber fill:#F59E0B,stroke:#F59E0B,color:#1a1a1a,stroke-width:2px,font-weight:bold
classDef amberSub fill:#2a2a2a,stroke:#F59E0B,color:#e0e0e0,stroke-width:1px
classDef violet fill:#8B5CF6,stroke:#8B5CF6,color:#fff,stroke-width:2px,font-weight:bold
classDef violetSub fill:#2a2a2a,stroke:#8B5CF6,color:#e0e0e0,stroke-width:1px
classDef cyan fill:#06B6D4,stroke:#06B6D4,color:#fff,stroke-width:2px,font-weight:bold
classDef cyanSub fill:#2a2a2a,stroke:#06B6D4,color:#e0e0e0,stroke-width:1px
```

## Color Legend (Required)

Every diagram MUST include a legend subgraph as its final element. The legend maps each color used in that diagram to its branch meaning.

### Template (copy-paste and customise labels)

```mermaid
    %% Legend — place at end of diagram, after all flow links
    subgraph LEGEND ["Color Legend"]
        direction LR
        L1(["Emerald = Branch 1 Label"]):::emerald
        L2(["Sky = Branch 2 Label"]):::sky
        L3(["Rose = Branch 3 Label"]):::rose
        L4(["Amber = Branch 4 Label"]):::amber
        L5(["Violet = Branch 5 Label"]):::violet
        L6(["Cyan = Branch 6 Label"]):::cyan
    end
    style LEGEND fill:#1a1a1a,stroke:#555,color:#e0e0e0,stroke-width:1px
```

### Rules

- **Position**: Always the last block in the file, after all cross-flow links
- **Direction**: `direction LR` (horizontal layout inside the subgraph)
- **Entries**: Include only the colors actually used in the diagram — omit unused slots
- **Labels**: Format as `Color = Branch Meaning` (e.g., `Emerald = Auth Bridge`)
- **Node shape**: Stadium `(["..."])` consistent with the rest of the diagram
- **Styling**: The `LEGEND` subgraph itself uses `fill:#1a1a1a,stroke:#555,color:#e0e0e0`
- **Classes**: Legend entries reuse the existing branch `classDef` (e.g., `:::emerald`), not the `legendBox` class

## Checklist Before Committing

- [ ] Uses `flowchart TD`
- [ ] Has the standard init block
- [ ] Root node uses `:::root` class
- [ ] Each branch has a unique color from the palette
- [ ] Sub-nodes use the matching `*Sub` class
- [ ] All nodes use stadium shape `(["..."])`
- [ ] Cross-flow links use dotted arrows with labels
- [ ] No emojis in syntax
- [ ] Max 6 branches per diagram (split if more needed)
- [ ] Color legend subgraph is present with correct branch labels

## Diagram Index

All diagrams live in `standalone-scripts/macro-controller/diagrams/`.

| File | Description |
|------|-------------|
| `master-architecture-overview.mmd` | High-level map linking all five flows together with cross-system relationships |
| `auth-bridge-waterfall.mmd` | 4-tier token recovery strategy — localStorage, Supabase JWT, Extension Bridge, Cookie fallback |
| `macro-controller-build.mmd` | Vite IIFE build pipeline — source → compile → dist artifacts → extension deploy |
| `script-injection-pipeline.mmd` | 6-stage injection lifecycle — dependency resolution through IIFE execution with CSP fallbacks |
| `prompts-pipeline.mmd` | Prompt file processing — source folders → JSON build → SQLite seeding → UI render |
| `credit-monitoring-flow.mmd` | Credit fetch flow — auth pre-flight → API polling with timeout → UI success/error states |
| `data-storage-schema.mmd` | Data storage schema — SQLite, IndexedDB, localStorage, chrome.storage with cross-layer sync |
| `extension-lifecycle.mmd` | Full extension lifecycle — install → page injection → runtime execution → user interaction |
| `run-script-flow.mmd` | Run Script end-to-end flow — UI click → dependency resolution → bootstrap/seed → wrap/execute → diagnostics output |
