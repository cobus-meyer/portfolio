---
title: "Generative UI at SAGE: turning LLM output into live product"
slug: sage
summary: An LLM writes farm reports as live, interactive UI (32-component library, OpenUI Lang), plus an in-report AI advisor; covers context-window limits, prompt caching, prompt versioning and what broke.
date: 2026-11-02
---

# Generative UI at SAGE: turning LLM output into live product

*Case study by Cobus Meyer · Senior Full-Stack Engineer at SAGE, Sep 2025 – Sep 2026*

**In short:** SAGE turns soil, climate and farm data into reports for growers. I built the system that lets an LLM write those reports as live, interactive UI instead of text, and the in-report advisor that answers questions in the same components. The hard parts were not the model. They were designing components a model can use reliably, and keeping a growing report inside the model's context without losing what made replies work.

## The problem

Our reports started as long LLM-written documents. Every new report type meant either a wall of text the grower wouldn't read, or a new hand-built screen and an app release. We wanted the model to produce product: tables people sort, maps they click, charts they hover.

## The design: a vocabulary the model writes in

I built a component library of 32 React components: layout, narrative, KPI tiles, tables, charts, maps and status badges. The model never writes React. It writes a short spec in OpenUI Lang, a declarative UI language, one statement per line:

```
root = Section(title, kpis, callout)
kpis = KPIGrid([ph, organicMatter])
```

The same spec renders two ways: an interactive React view inside the grower app, and a self-contained HTML file that opens offline. A new report type became a new spec, not an app release.

```flow:genui-flow
Farm data ──▶ LLM ──▶ OpenUI Lang spec ──┬──▶ React app (interactive)
              ▲                          └──▶ standalone HTML (offline)
              └── prompt auto-generated from the 32 component definitions
```

## Designing components for a model, not a person

A component's description is the model's documentation, so I treated it as the interface:

- **The prompt is generated from the code.** Each component declares its name, typed props (Zod) and a description of when to use it. The system prompt is built from those definitions, so adding or changing a component updates what the model knows. Nobody edits the prompt by hand.
- **Line-by-line statements stream well.** The root is written first and data fills in after, so the report appears progressively instead of after one long wait.
- **Specs are validated against the renderer** before they reach a grower, so a malformed spec fails in review, not on a farmer's phone.

## The advisor: answering inside the report

The second piece was a chat advisor that sits beside the report. A grower asks "which fields need lime first?" and the answer can come back as prose or as the same components: a ranked table, a KPI tile, a callout. It streams over server-sent events, scopes each conversation to a report version, and supports voice questions from the field.

## What broke, and what I changed

**1. Reports outgrew the context window.** Reports started embedding images as base64. One 3.7 MB report, about three-quarters images, could overflow the model's context and break the advisor on every turn. I added a guard that strips inline images before anything reaches the model (the grower still sees them), caps the report's share of the prompt, and slides older chat history out first. When something is cut, the prompt tells the model so, so it says it can't see a value instead of inventing one.

My first version also blocked publishing any report too big for chat. We reversed that: report size should inform the person publishing, never stop a grower getting their report. It became a warning instead.

**2. The fix removed the model's best example.** To shrink prompts further I wrote a parser that turns the UI spec into a compact markdown digest: every table cell and number kept, all layout plumbing dropped. It cut estimated tokens by 22–41% on real reports. But the raw spec had also been the largest example in the prompt of *how to reply in components*. Remove it, and replies risk drifting back to plain text. I restated the reply format explicitly in the prompt and added telemetry that flags whether each reply still came back as UI, so we would see a regression in the data rather than hear about it from growers.

**3. Caching depends on determinism.** Prompt caching only pays off if the cached part is byte-identical every turn. The digest is deterministic by design and fails whole: if any line can't be parsed, the advisor falls back to the stripped raw spec rather than sending a digest that silently dropped a section.

**4. Prompts needed versions, not commits.** I moved every backend LLM prompt into PostHog's prompt management and tracked each generation as an `$ai_generation` event, including speech-to-text and a vision verifier that had been missing from cost tracking. Each reply could then be traced to the exact prompt version that produced it.

**5. The host app changed underneath us.** Upgrading the grower app to React 19 broke components in ways no unit test caught: a chart threw on an undefined prop that React 18 used to default, and a map report blanked whenever the chat panel collapsed. Each fix went into the shared library with a changelog entry, so every app that used it got the fix together.

## What I'd do differently

- **Measure reply quality, not just reply shape.** Telemetry told us whether a reply was UI; it did not tell us whether the answer was right. I'd add a small eval set of real grower questions with expected answers from day one.
- **Version the spec language explicitly.** The renderer accepts a larger language than our generator writes, which is why the digest parser had to fail whole. A versioned, smaller spec contract would have made that simpler.
- **Count tokens with the provider's tokenizer.** The context guard uses a deliberately conservative estimate. It was safe, but it left context unused.

## Stack

TypeScript, React, OpenUI Lang, Zod, Recharts, MapLibre · Python, FastAPI, PostgreSQL · Claude via OpenRouter · GCP, Terraform · PostHog (prompts, LLM analytics, error tracking)

*The code belongs to SAGE, so this write-up describes the work without sharing it.*
