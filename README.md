# Map of Chaos (MOC) 🌌

> **Local-first semantic context mapping & personal knowledge capture that welcomes the mess of human thought.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8.x-646cff.svg)](https://vitejs.dev/)
[![Tests](https://img.shields.io/badge/Tests-69%20passed%20(100%25)-brightgreen.svg)]()
[![PWA](https://img.shields.io/badge/PWA-Ready-orange.svg)]()
[![License](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)

---

## 💡 Overview

Traditional Personal Knowledge Management (PKM) systems impose immediate cognitive overhead: creating folders, selecting categories, tagging hierarchies, or connecting graph nodes before a thought is even captured.

**Map of Chaos removes this friction entirely.**

You dump raw, unorganized thoughts in your own words. The system preserves the original text as immutable evidence, extracts semantic mentions and propositions, conservatively resolves persistent entities over time, and projects the accumulated context onto a dynamic spatial map.

> *"The user should be able to dump information first. Map of Chaos should gradually discover what that information is about, recognize when new information refers to something that already exists, accumulate context around persistent entities, and make the resulting context visible as a map."*

---

## ⚡ Core Principles & Architecture DNA

Map of Chaos is built around strict epistemic and architectural invariants:

1. **Dump First, Structure Second**: Writing is sacred and instant. No required fields, dropdowns, or tagging before capture.
2. **Evidence Grounding**: Every extracted mention, attribute, and claim is permanently anchored to character-exact offsets in the original raw dump.
3. **Similarity Is NOT Identity**: Lexical resemblance alone **never** authorizes an automatic entity merge. A company named `Freshbeda` and an Instagram handle `@freshbeda` remain distinct entities until explicit human or relational evidence binds them.
4. **Epistemic Rigor**: Direct user statements are treated as verified truth; machine interpretations are strictly marked provisional or speculative.
5. **Additive Accumulation**: Multiple dumps enrich the same persistent entity over time without duplicating nodes or rewriting past history.
6. **Local-First & Private**: Powered by client-side storage (IndexedDB) with zero telemetry and full offline capability.

---

## 🔄 The Semantic Pipeline

Information flows sequentially through an event-free, verifiable pipeline:

```
┌─────────────────┐
│   1. RAW DUMP   │  Immutable text captured with timestamp & source
└────────┬────────┘
         ▼
┌─────────────────┐
│  2. EVIDENCE    │  Character-exact byte offsets (startOffset, endOffset, textSpan)
└────────┬────────┘
         ▼
┌─────────────────┐
│  3. EXTRACTION  │  Deterministic extraction of Mentions, candidate types & Claims
└────────┬────────┘
         ▼
┌─────────────────┐
│  4. RESOLUTION  │  Decision Gate: matched_existing | new_entity | ambiguous | associated_handle
└────────┬────────┘
         ▼
┌─────────────────┐
│ 5. ACCUMULATION │  Mints new entities, updates aliases/handles, binds claim endpoints
└────────┬────────┘
         ▼
┌─────────────────┐
│ 6. CONTEXT STORE│  Central semantic memory (IndexedDB / in-memory repositories)
└────────┬────────┘
         ▼
┌─────────────────┐
│  7. PROJECTION  │  Deterministic mapping: Entity → ThingNode, Claim → EdgeLink
└────────┬────────┘
         ▼
┌─────────────────┐
│   8. MAP VIEW   │  Interactive D3-force spatial graph canvas
└─────────────────┘
```

---

## 🖥️ User Experience & Surfaces

Map of Chaos provides five unified surfaces to support capture, reflection, and epistemic clarity:

| Surface | Purpose | Key Capabilities |
| :--- | :--- | :--- |
| **🗺️ Map Canvas** | Primary visual workspace | Interactive `d3-force` graph rendering Things (nodes) and verified Claims (edges) with organic repulsion, degree-based radii, drag persistence, and zoom/pan. |
| **📥 Capture Dock** | Unconstrained input | Persistent, distraction-free multiline dock at the bottom of the canvas. Submissions immediately feed the semantic pipeline. |
| **📬 Inbox View** | Epistemic clarification | Dedicated queue for ambiguous entities, unreviewed claims, and items requiring human decision. |
| **💭 Wander View** | Unstructured reflection | Distraction-free scratchpad that surfaces real-time contextual echoes from existing map entities as you type. |
| **🗑️ Erased Shelf** | Soft-delete management | Reversible archive allowing soft-deleted Things to be restored or purged. |
| **🔍 Detail Drawer** | Entity inspection | Slide-out panel detailing canonical names, aliases, associated handles, connected claims, evidence provenance, and review actions. |

---

## 🛠️ Tech Stack

- **Framework**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Styling & UI**: [Tailwind CSS v4](https://tailwindcss.com/) + [Lucide React Icons](https://lucide.dev/) + [Motion](https://motion.dev/)
- **Graph Physics**: [D3 Force Simulation](https://github.com/d3/d3-force) (`d3-force`)
- **Storage Layer**: Local-first [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) via custom typed `ContextStore` repository facade (with in-memory driver for offline and test runs)
- **Bundler & PWA**: [Vite 8](https://vitejs.dev/) + [`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/)
- **Testing**: Node.js test runner executed via [`tsx`](https://github.com/privatenumber/tsx)

---

## 🚀 Quickstart

### Prerequisites
- Node.js 18.0.0 or higher
- npm 9.0.0 or higher

### 1. Clone the repository
```bash
git clone https://github.com/nalakara/map_of_chaos.git
cd map_of_chaos
```

### 2. Install dependencies
```bash
npm install
```

### 3. Start development server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Run the test suite
The project includes a comprehensive 69-test suite verifying domain invariants, state machines, deterministic extraction, entity resolution, and context projection:
```bash
npx tsx --test src/*/__tests__/*.test.ts
```

### 5. Build for production
```bash
npm run build
```

### 6. Preview production build
```bash
npm run preview
```
Runs the production preview server on [http://localhost:5050](http://localhost:5050).

---

## 📁 Repository Structure

```
map_of_chaos/
├── docs/                               # Architecture contracts, audits & specs
│   ├── application_description.md     # Complete functional specification
│   ├── application_dna.md             # Core immutable invariants and DNA
│   ├── product_contract.md            # Product rules & epistemic requirements
│   ├── semantic_extraction_contract.md# Extraction phase contract
│   ├── entity_resolution_contract.md  # Entity resolution decision matrix
│   └── runtime_pipeline_design.md     # Pipeline orchestration spec
├── src/
│   ├── domain/                        # Domain models, invariants & state machines
│   │   ├── types.ts                   # Core entities (Dump, Evidence, Mention, Claim)
│   │   ├── invariants.ts              # Mathematical & epistemic safety assertions
│   │   └── stateMachines.ts           # Claim and Resolution state transitions
│   ├── pipeline/                      # Semantic extraction & resolution engine
│   │   ├── extraction/                # Deterministic text extraction & normalizer
│   │   └── resolution/                # Candidate generator, decision gate & accumulator
│   ├── storage/                       # Local-first persistence layer
│   │   ├── db.ts                      # IndexedDB and Memory storage drivers
│   │   ├── contextStore.ts            # High-level storage facade
│   │   └── *Repo.ts                   # Repositories for dumps, entities, claims, overrides
│   ├── projection/                    # Context-to-graph projection engine
│   │   ├── projector.ts               # Transforms ContextStore into Thing/Edge projections
│   │   └── adapter.ts                 # Adapts projection to Map elements with coordinate caching
│   ├── components/                    # UI components (MapCanvas, Dock, DetailDrawer, etc.)
│   └── App.tsx                        # Root application orchestrator
├── package.json
└── vite.config.ts
```

---

## 📖 Deep Dive Documentation

For in-depth architectural and design documentation, explore the [`docs/`](./docs) directory:
- [**Application Description**](./docs/application_description.md): Full end-to-end breakdown of philosophy, pipelines, storage models, and UI mechanics.
- [**Application DNA**](./docs/application_dna.md): Immutable philosophical principles, core invariants, and design constraints.
- [**Context Model Contract**](./docs/context_model_contract.md): Strict definitions of Entities, Claims, and Evidence relationships.
- [**Entity Resolution Contract**](./docs/entity_resolution_contract.md): Specifications for candidate generation and decision gating.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
