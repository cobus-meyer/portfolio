---
title: "SAGE · Senior Full-Stack Engineer"
slug: sage
summary: Senior Full-Stack Engineer at SAGE, working on LLM-driven product UI, in-product AI chat, an offline-capable web app, platform engineering and product analytics, with general lessons on building LLM products.
date: 2026-11-03
kind: Experience
org: SAGE
short: SAGE
role: Senior Full-Stack Engineer
dates: Aug 2025 – Aug 2026
where: Cape Town
start: 2025-08
end: 2026-08
lat: .09
ry: 112
note: "risk intelligence · generative UI"
tint: "#6FB193"
glyph: "M2 6c3-2 5 2 8 0s5 2 8 0M2 10c3-2 5 2 8 0s5 2 8 0M2 14c3-2 5 2 8 0s5 2 8 0"
scene: sage
article: true
cue: "What I worked on and learned"
highlights: What I worked on
---

# LLM products and the platform under them

*Cobus Meyer · Senior Full-Stack Engineer at SAGE, Aug 2025 – Aug 2026*

**In short:** SAGE reads the risk of agricultural land field by field, starting with crop insurance. I worked across the stack, from LLM-driven product UI to the platform it ran on. This page covers my role and what I learned in general terms.

## What I worked on

- **Generative UI.** I started work on React components that let LLM output appear as interactive UI, using OpenUI Lang, a public declarative UI language.
- **In-product AI chat.** I led work on a streaming AI chat inside the product, including context management for LLM conversations.
- **Web app for the field.** I led an offline-capable web app for growers, because signal on a farm can't be taken for granted.
- **Platform.** I worked on Python and FastAPI backend services on GCP, CI/CD and per-PR preview environments.
- **Product analytics.** I set up PostHog across the web and backend stack, and managed prompts and LLM analytics with it.
- **Internal tools.** I built internal operations tools, and used Claude Code with the PostHog MCP for error triage, with a person reviewing each fix.

## The problem

Long LLM-written text is hard to act on, and building a screen by hand for every new kind of answer is slow. The problem I worked on was how to let a model produce UI that people can use, and keep the result dependable.

## The approach, in general terms

Give the model a small vocabulary instead of free rein. It chooses from known components in a declarative language, and the product renders them. That keeps the model's output inspectable and keeps design decisions in the components.

## What I learned

- **Design components for a model as well as a person.** A component's name and description work as documentation for the model. Clear names and narrow props help it choose well.
- **Treat context as a budget.** Long LLM conversations need a deliberate plan for what stays in the prompt and what goes. The model should know when something is missing, so it doesn't guess.
- **Check quality as well as format.** A reply in the right format can still be wrong. A small eval set built from real questions is worth having early.
- **Version prompts like code.** When every LLM output can be traced to a prompt version, a change in behaviour is something you can investigate.
- **Make every change easy to see running.** A preview environment for each pull request lets a team review real behaviour, not only a diff.

## Stack

TypeScript, React, OpenUI Lang · Python, FastAPI, PostgreSQL · GCP · PostHog, MCP, Claude Code

*The code and the details of this work belong to SAGE, so this page stays at the level of my role and general lessons.*
