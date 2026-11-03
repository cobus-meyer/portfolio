---
title: "Site Pulse: directing agents on safety-critical software"
slug: site-pulse
summary: An exercise in agentic coding for a friend, in the manufacturing and process industry, that grew into a permit-to-work product; covers how the work was directed and what agents and reviews caught or missed.
date: 2026-11-03
kind: Venture
org: Site Pulse
short: Site Pulse
role: Technical Lead
dates: Feb 2026 – Aug 2026
where:
start: 2026-02
end: 2026-08
lat: .25
ry: 38
standalone: true
nudge: -24
peak: .45
note: "agentic coding · plant safety"
tint: "#5E9C72"
glyph: "M5 9V6a5 5 0 0110 0v3M4 9h12v8H4zM10 12v2"
scene: plant
link_href: https://www.site-pulse.nl/
link_label: site-pulse.nl
article: true
cue: "How it was built"
---

# Site Pulse: directing agents on safety-critical software

*Cobus Meyer · Technical Lead on Site Pulse, Feb 2026 – Aug 2026*

**In short:** Site Pulse started as an exercise in agentic coding, to solve a business operational problem in the manufacturing and process industry for a friend. Before a contractor works on a machine in a plant, they need an approved permit and the machine locked out. A wrong state here is a safety problem, so the agents' work needed checking.

## How I worked

- **Rules before code.** My friend knows how permits and lockouts work on a real plant floor. I put questions to them, and their answers became the written business rules the agents worked from.
- **Standing instructions.** Hard rules live in the repo's agent instructions. One is that every state change must write an audit entry.
- **Feedback as the backlog.** Rounds of written feedback became releases, so the product was corrected against how a plant runs and not against my guesses.

Another developer also worked on the platform for about two months.

## What broke, and what I changed

**1. A lockout check that passed on nothing.** A permit that required a lockout, but had none assigned, could still go active, because a check over an empty list passes. It was found while dogfooding. I hardened both confirmation endpoints and added a second check on both activation endpoints.

**2. A second model found what the first missed.** A pre-merge Codex review of the offline work returned 15 findings. In one, a stale screen could resume a permit that someone else had since activated and suspended. A floor write is now checked against the status the person actually reviewed, captured when the dialog opened.

**3. A core concept was wrong.** Once the domain was better understood, Work Plans had to go. A recurring permit now has a small parent series, and a one-off permit has no parent at all.

## Stack

TypeScript, Next.js, React, Fastify, PostgreSQL, Prisma, Redis, BullMQ · Claude Code, Codex · PostHog · Railway

*The code belongs to the company, so this write-up describes the work without sharing it.*
