# Solving the "Bus Number" Problem

### How AI Task Manager makes the loss of a key engineer a survivable event

_Prepared for the General Manager · Non-technical audience · AI Task Manager_

---

## Executive Summary

**We can put the "bus number" problem behind us.** AI Task Manager is a custom
skill we load into our AI coding assistants that captures the knowledge behind
every piece of work automatically, in plain writing, as the work happens — so no
critical understanding is ever trapped in any one person's head.

It is not a product we build; it is a reusable tool that extends our AI to enforce
a well-documented, repeatable engineering system. Once adopted, every task we
build — on any project — leaves a permanent, standardized, readable record of
_what_ was done, _why_, and _how to prove it still works_. The result is a
development organization that is fast **and** resilient:

- **Continuity is built in, not bolted on.** A qualified successor can open any
  project and continue in **hours, not months** — no tribal knowledge required.
- **Every deliverable is self-documenting.** Scope, plan, reasoning, and
  re-runnable proof live on each work item forever.
- **The discipline is automatic.** The system enforces fresh research, planning,
  and re-runnable proof on every task, even under deadline pressure — it cannot be
  skipped.
- **It pays for itself in plain dollars.** The same records produce an ROI report
  comparing AI-assisted cost against a conventional engineering team.

In short: we get the speed everyone expects from AI — **without** the hidden risk
of knowledge walking out the door. The detail that follows explains exactly how.

---

## What AI Task Manager is — and is not

**AI Task Manager is not a product we are building, and it is not the software our
business runs on.** It is a **tool** — a custom "skill" we load into our AI coding
assistants at the start of every session. Think of it as the operating discipline
we hand the AI before it touches any of our real work.

On its own, an AI assistant is a brilliant but forgetful contractor: fast,
capable, and gone without a trace when the session ends. AI Task Manager turns
that contractor into a **disciplined member of an engineering organization**.
Loaded as a skill, it requires the AI to bind every task to a tracked work ticket,
document its reasoning, prove its work, and hand off cleanly — on _whatever_
project the company chooses to build.

> **The distinction that matters.** The company's projects are the _cars_. AI Task
> Manager is the _seat belts, the service records, and the driver's manual_ — a
> reusable layer that makes **every** project we build well-documented, repeatable,
> and safe to inherit. Adopt it once, and the continuity benefits in this brief
> apply to all of our AI-assisted engineering, not to any single piece of software.

---

## The fear, in plain terms

Every executive who depends on software has had this thought at 2 a.m.:

> _"What if the person who built this gets hit by a bus? Do we lose everything?
> How long before someone new can take over — if they ever can?"_

Agile teams call this the **bus number** (or **bus factor**): the number of people
who would have to disappear before a project stalls. When the answer is **one**,
the company is one resignation, one illness, one bad day away from owning software
that nobody alive understands.

The fear is rational, because the belief behind it is usually **true**: in most
shops the real knowledge — _why_ the system was built this way, what was tried and
rejected, how to safely change it, how to prove it still works — lives **only in
the head of the person who wrote it**. The code is on a server, but the
understanding walked out the door.

This brief explains, without requiring any software background, how **AI Task
Manager** changes that — and why AI-assisted development done _this_ way makes the
bus-number problem **structurally smaller**, not larger.

---

## Why "AI coding" usually makes the problem worse

If you have watched the videos and read the blogs, the pitch for AI coding is
speed: _"Describe what you want, the AI writes it, ship it in an afternoon."_

That is real, and it is also a trap. The faster code is produced, the faster
**undocumented decisions** pile up. The AI made a hundred small judgment calls in
that afternoon — and then the chat window was closed. The reasoning evaporated.
You are left with more code, built faster, that **even fewer people understand**.
The bus number didn't improve. It got worse, and it got worse _quietly_.

**The core risk:** a chat session with an AI is the most fragile form of
institutional knowledge imaginable — it exists for one person, on one screen, for
one afternoon, and then it is gone. **AI Task Manager exists to fix exactly
this** — it takes the speed of AI development and forces every bit of it to leave a
permanent, standardized, readable trail that does not depend on any single person,
or any single chat session, surviving.

---

## The key idea: the bus already happens every day

Here is the insight that makes this approach different.

An AI assistant has **no long-term memory**. Every new session, it wakes up
knowing nothing about yesterday. In effect, the AI engineer "gets hit by a bus"
**at the end of every working session** — and a brand-new, amnesiac engineer shows
up the next morning to continue the work.

A normal team would collapse under that. AI Task Manager doesn't, because it was
**engineered from the ground up on the assumption that the worker will lose all
memory and a stranger will take over.** Every safeguard that protects against that
daily amnesia is _the same safeguard_ that protects you against losing a human.

**Why this matters to you:** the bus scenario isn't a hypothetical disaster this
system hopes to avoid. It is the **normal operating condition the system is
designed to absorb** — many times a week, without anyone noticing. A tool hardened
by that daily stress test is exactly the tool you want standing between you and the
loss of a key person.

---

## What gets captured for every piece of work

In this system, no work happens "loose." Every task — every feature, every bug
fix — is attached to a numbered **work ticket** (a GitHub issue) that travels with
the work from idea to delivery. By the time the work is done, that ticket is a
**complete, self-contained record** a newcomer can read cold:

| What's captured           | In plain language                                                                                                   | Why it defeats the bus problem                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Scope**                 | What this work is — and explicitly what it is _not_                                                                 | A newcomer learns the boundaries without guessing                                                      |
| **Acceptance Criteria**   | The checklist of "what 'done' actually means"                                                                       | Success is defined in writing, not in someone's memory                                                 |
| **Deep-Dive Analysis**    | The investigation: which parts of the system are involved, what was checked, what the risks are                     | The _reasoning_ is preserved, not just the result                                                      |
| **Plan & Estimate**       | The plan of attack and how big the job was judged to be                                                             | A successor sees the intended approach, not just the outcome                                           |
| **Verification Commands** | The exact steps anyone can run to **prove the work still works**                                                    | Confidence is reproducible by anyone, forever                                                          |
| **Commit links**          | Pointers to the exact code that was changed                                                                         | The ticket and the code are permanently tied together                                                  |
| **Timing Log**            | A timestamped diary of the work's entire life                                                                       | Full audit trail of when and how it progressed                                                         |
| **Pickup Directive**      | The standing **rules** that tell the AI how to research and plan this item just in time, before any code is touched | Forces a fresh investigation of the live code every time — the plan reflects reality, not stale memory |

### The "Pickup Directive": rules that turn an idea into a researched plan

The Pickup Directive is easy to misread as a handoff document. It is **not a
document at all** — it is a standing set of **rules** attached to every work item
that governs how that item is researched and planned, just in time, the moment
real work begins.

It works in three stages:

- **Backlog.** A new item starts as a lightweight stub — a short description and
  rough scope of the work — nothing more.
- **Refine.** The item is fleshed out: the Pickup Directive is attached, along
  with an estimate, a size, a priority, and descriptive labels that categorize the
  type of work.
- **Plan.** The AI reads the item and **follows the Pickup Directive's rules to
  generate a just-in-time "deep-dive" investigation**: it examines the _current_
  state of the source code, identifies which files must be touched and what must
  change, determines what tests are needed to verify the work, and sets the
  acceptance and validation criteria that must be met before the "definition of
  done" checklist can be completed and the item closed.

So the Pickup Directive does not hand off work that is already finished. It
describes **how the work will be researched and planned** — and because the deep
dive is generated fresh against the live codebase every time, the plan always
reflects the system as it actually is today, not someone's memory of it. This
discipline is **mechanically enforced**: the system will refuse to advance an item
until the required research, plan, and proof exist. The rigor that normally depends
on a conscientious senior engineer is instead **baked into the tooling**, so it
happens every time, even under deadline pressure.

---

## The other half of the record: the source repository

The detailed backlog captures the _why_ behind each piece of work. A second
system — the **source repository** — captures the _how it changed over time_.
Together they are the two halves of a complete, permanent memory.

A source repository is a vault that stores **every version of every file** ever
created for a project. Nothing is ever truly overwritten or lost. Each time
anything changes, the repository records a dated, authored snapshot — _who_ changed
_what_, _when_, and (linked back to its work ticket) _why_. The result is a
complete, frame-by-frame history of how the software grew from its first line to
today.

**What this means in plain terms:** imagine a filing cabinet that automatically
keeps **every draft** of every document, forever, each one stamped with the date,
the author, and a note explaining the change — and lets anyone scroll backward
through the entire history. That is what a source repository does for code. An
engineer or AI agent can read through the evolution of any file to understand
exactly what happened, where, and why — and can even return to any earlier version
if a change ever needs to be undone.

This is the backstop beneath everything else in this brief. Even if a document
were missing or a memory failed, the repository preserves the actual record of the
work itself. And because each snapshot links to the work ticket that prompted it, a
successor can move freely between the two: from a written decision in the backlog
to the exact code change that carried it out, and back again. The **generated
documents, the detailed backlog, and the source repository reinforce one
another** — three independent records of the same knowledge, none of them dependent
on a person's memory.

---

## Onboarding the next owner

The person who picks this up is not a lone code-mechanic. In an AI-driven shop the
key role is a **technical product owner** (sometimes called a prompt engineer) —
someone who understands software development, can build and maintain a detailed
backlog of features and defects, and directs a team of AI agents to define and
execute that backlog, making the decisions and validations along the way.

Onboarding that person does **not** mean reading the entire backlog cover to
cover. The backlog is a **reference book** — a record of work both completed and
planned for future iterations — consulted as needed, not memorized.

**Without this system** — the familiar nightmare:
A newcomer inherits a codebase and a list of half-finished work with no record of
_why_ anything was built the way it was. The only person who knew is gone. They
spend **weeks to months** reverse-engineering decisions, afraid to change anything
for fear of breaking what they don't understand. The business waits, and pays, the
whole time.

**With AI Task Manager** — the same first day:
The new owner boots an AI session and works _with_ the AI to consume the
source-code history, the product backlog, and the architectural documents in the
project. Together they get up to speed in **a few short hours** — ready to start
the next backlog item, or to add a new feature request or bug report.

The result is a fast, effective **owner-plus-AI collaboration** that can maintain
and extend _any_ software project managed with AI Task Manager — because the
knowledge needed to do so was never locked in a departed person's head; it lives in
the history, the backlog, and the documents, waiting to be read.

---

## The bus number, recalculated

|                          | Typical team                             | With AI Task Manager                                              |
| ------------------------ | ---------------------------------------- | ----------------------------------------------------------------- |
| Where the "why" lives    | In one person's head                     | In writing, on every work item                                    |
| If the key person leaves | Knowledge is lost; recovery takes months | Knowledge stays; a successor reads and resumes                    |
| Plan & research per task | Done in someone's head, lost afterward   | Generated fresh against live code, kept on the ticket             |
| Proof the software works | "Trust me, it works"                     | Re-runnable verification steps on every item                      |
| Effective bus number     | Often **1**                              | **Effectively unlimited** — any qualified person can pick up cold |

The goal of Agile's bus-number question is to drive that number **up** — to make
the organization resilient to the loss of any individual. AI Task Manager does
that not by asking people to be more diligent, but by making the resilient
behavior **the only way the system will let work proceed**.

---

## The bonus: it also proves its own value

Because every task records the time and effort it consumed against an up-front
estimate, the same system that protects you from the bus problem also produces a
**financial report in your language** — what the work would have cost a
conventional engineering team versus what it actually cost with AI assistance,
broken down by role and US region in fully-burdened dollars. The discipline that
keeps knowledge in the company is the same discipline that proves the spend was
worth it.

---

## The one-paragraph version for the board

> _Our software development is structured so that the knowledge behind every piece
> of work — why it was built, how it works, and how to prove it still works — is
> captured automatically, in a standard written form, on every task, as the work
> happens. These records span the **entire software lifecycle**: not just the
> code, but how to build it, test it, deploy it, and operate it in production —
> including cloud deployments and external API access. The same system scales from
> a single application to a **complete enterprise suite** — backend and frontend,
> web and mobile, with AI integrations — all documented to the same standard. No
> critical understanding lives only in one person's head. If any contributor were
> to leave tomorrow, a qualified successor could open the project, read the
> complete history of every item, and continue — in hours, not months. We are not
> exposed to the "bus factor," because the system is built to survive a worker
> disappearing; in fact, it does so routinely by design._
