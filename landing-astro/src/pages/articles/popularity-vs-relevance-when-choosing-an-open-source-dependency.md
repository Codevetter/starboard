---
layout: ../../layouts/Article.astro
title: "Popularity vs relevance when choosing an open-source dependency"
description: "When selecting an open-source dependency, GitHub stars only tell part of the story. Learn why relevance, evidence, and project context matter more than popularity."
date: "2026-09-20"
author: "Sarthak Agrawal"
readingMinutes: 6
---

## Introduction

Developers face a recurring challenge: deciding which open-source components to integrate into their work. The default behavior is often to look at the number of GitHub stars a project has accumulated. It is a highly visible number that feels like a proxy for quality. If thousands of developers have starred a repository, the assumption is that the project is robust, reliable, and worth using.

However, relying entirely on popularity as the primary filter introduces blind spots. Generic trending lists and raw star counts reflect historical momentum, marketing reach, and broad appeal, but they lack the context of what you are actually trying to build. A project might be massively popular in the broader ecosystem while being completely inappropriate for the specific architecture, language constraints, or deployment model of your current work.

A global popularity metric treats software as existing in a vacuum. But software is never written in a vacuum. It is written in the context of an existing stack, with specific constraints, running in a specific environment. When evaluating a new open-source dependency, the critical question is not "Is this popular?" but rather "Is this relevant to my project?" Understanding the difference between these two criteria is essential for making technical decisions that lead to maintainable architectures.

## The limitations of the star count heuristic

The star count on a GitHub repository is a measure of attention. While attention often correlates with quality, it is a trailing indicator that can mask underlying realities about a project's state and its suitability for your specific needs.

First, popularity obscures the difference between stagnation and maturity. A project that gained twenty thousand stars five years ago might sit at the top of generic search results, even if its maintainers have moved on and the issue tracker is filled with unresolved compatibility problems. The accumulated stars do not decay, meaning the metric fails to reflect recent velocity, active maintenance, or alignment with current practices.

Second, massive popularity implies a broad, general-purpose tool. While general-purpose tools are necessary, they come with significant overhead, complex configuration surfaces, and sprawling dependency trees. If your project has a specific need, a hyper-focused, less popular library might provide exactly the functionality required with a fraction of the footprint. By filtering only for the most popular options, developers often adopt complex solutions for relatively simple problems.

Third, popularity metrics lack ecosystem boundaries. A frontend testing framework might be trending globally, but if you are building a backend service in Go, that trend is useless noise. Even within the same language, an ORM might be wildly popular for monolithic applications but entirely unsuitable for the ephemeral, cold-start constrained environment of serverless edge functions. When discovery mechanisms are not aware of the project you are building, they surface recommendations that are statistically popular but contextually irrelevant.

## Defining relevance in open-source selection

If popularity is a measure of global attention, relevance is a measure of contextual fit. Relevance asks how well a potential dependency aligns with the technical reality of the project you are actively working on.

Evaluating relevance begins with understanding your own project's footprint. This includes factors like primary programming languages and core frameworks you are already using. But it also extends to architectural patterns. Are you building a statically exported site, a server-rendered application, or a raw API? Are you deploying to long-running containers or serverless environments? The answers to these questions act as strict filters for what tools can be considered.

Beyond technical compatibility, relevance involves looking at the specific problems a tool was designed to solve. A dependency is highly relevant if it was built to operate in the exact context you are working within. This is why discovering tools through the lens of similar projects is powerful. If you are building a React dashboard that utilizes WebGL for data visualization, the tools used by other React-based WebGL dashboards are inherently more relevant to you than whatever happens to be trending on Hacker News this week.

Relevance shifts the evaluation process from searching a global catalog to querying your immediate technical neighborhood. It requires a discovery mechanism that is "project-aware"—one that uses the identity and characteristics of your current repository as the starting point for exploration, rather than presenting a static list of the ecosystem's greatest hits.

## Using evidence to find what fits

Moving from a popularity-driven approach to a relevance-driven approach requires a change in how we evaluate open-source projects. We must move away from relying solely on top-level metrics or marketing claims in README files, and instead look for concrete, verifiable evidence of how a tool is actually used in the wild.

The strongest signal of a tool's viability for your project is evidence that it has successfully solved similar problems in similar environments. This evidence is rarely found in the star count; it is found in the configuration files, manifests, and source code of projects that share your technical context.

Consider the process of selecting a new state management library for a frontend application. A popularity search will yield the usual suspects. An evidence-based search starts by identifying open-source repositories that share your core stack—perhaps they also use the same UI component library, the same build tool, and have a similar scale. By inspecting the dependency trees, `package.json` files, or Software Bills of Materials (SBOMs) of these peer repositories, you uncover the tools they are actually using in production.

This approach provides a deterministic trail of evidence. When you see that several active, well-maintained projects with architectures identical to yours have chosen a specific library, you have gained a high-confidence recommendation grounded in reality. The recommendation is explainable: "Consider this library because it is used by these successful projects that share your technical constraints."

Relying on evidence from similar repositories surfaces robust tools that possess deep domain relevance. It filters out the noise of the broader ecosystem and focuses on what is proven to work in the specific context you care about.

## A balanced approach to open-source discovery

Advocating for relevance and evidence does not mean ignoring popularity. A project with zero adoption is always a risk, regardless of how perfectly it seems to align with your needs. The goal is not to discard popularity entirely, but to demote it from being the primary filter to being a secondary sanity check.

The ideal process for choosing an open-source dependency operates as a funnel. The top of the funnel should be strictly defined by relevance. Start by defining your project context and looking at the tools used by similar repositories in the ecosystem. This grounds your search in concrete evidence and ensures that every candidate considered is fundamentally compatible with your architecture.

Once you have a narrowed list of relevant candidates, apply metrics like popularity, update frequency, and community size to make the final selection. In this balanced approach, popularity serves its proper function: providing confidence that a highly relevant tool also has a sustainable community and sufficient momentum to be a safe long-term bet.

By prioritizing relevance and demanding evidence over raw popularity, developers build coherent stacks, avoid the overhead of ill-fitting tools, and make technical decisions that are uniquely suited to the software they are actually building.

## Practical next action

The next time you need to introduce a new tool or dependency to your project, pause before searching a global package registry or looking up trending repositories.

Identify three to five open-source projects that closely resemble what you are building—projects that share your primary language, core framework, and general architectural goals. Inspect their dependency manifests. Look for patterns in how they solve the problem you are facing.

By starting your search within projects that share your context, you will find tools backed by the concrete evidence of actual integration, leading to a much higher chance of long-term success.
