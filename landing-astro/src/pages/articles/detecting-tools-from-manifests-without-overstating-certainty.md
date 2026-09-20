---
layout: ../../layouts/Article.astro
title: "Detecting tools from manifests without overstating certainty"
description: "Learn how Starboard detects tools across repositories by using manifests and SBOMs while clearly defining confidence levels to avoid overstating certainty."
date: "2026-09-20"
author: "Sarthak Agrawal"
readingMinutes: 6
---

## Introduction

In modern software development, understanding the technology stack of a given project is crucial for discovery, comparison, and integration. But identifying exactly what tools a repository uses can be fraught with error. Between outdated READMEs, generic topic tags, and sprawling monorepos, algorithms that attempt to map a repository’s tooling can easily overstate their certainty, returning false positives that mislead developers.

When developers search for open-source tools to incorporate into their next large-scale migration, they do not just want keyword matches; they require definitive evidence that a library is actively built against, imported, and maintained within a project's ecosystem. At Starboard, the approach to Tool Intelligence is grounded in a core philosophy: evidence over inference. By prioritizing concrete dependency files—manifests, lockfiles, and SBOMs—Starboard builds a reliable picture of a project's stack. Critically, it does not pretend that this detection is flawless. Instead, it openly grades the confidence of its detections, ensuring users understand what is a definitive match and what is an educated guess based on metadata.

This article details how Starboard detects tools without overstating certainty, examining the hierarchy of evidence, the confidence scoring system, and how this data is surfaced to users navigating the public corpus.

## Evidence Over Inference: Manifests and SBOMs

The strongest indicator of a tool's presence is not a mention in a marketing paragraph within a README, but a hard requirement in the build process. Starboard’s enrichment engine actively scans for explicit declarations of dependencies across the catalog.

When analyzing a project, Starboard doesn't just look at the repository's description or topics. It fetches manifest files directly. For example, if a `package.json` explicitly lists `"react"`, or a `Cargo.toml` lists a Rust crate, the tool detection algorithm registers this with near certainty. Starboard's logic scans paths based on priority, looking for common files like `package.json`, `pom.xml`, `requirements.txt`, or `.tf` files. The detection algorithm intelligently prioritizes paths, ensuring it captures the root manifests first before traversing deeply nested examples or documentation folders, which can skew detection results.

Furthermore, Starboard integrates with GitHub's Software Bill of Materials (SBOM) API. If a project publishes an SBOM, Starboard can extract the dependency graph directly. An SBOM provides a comprehensive, often machine-generated, inventory of the exact software components utilized. This is critical in modern supply chain security and dependency analysis, enabling Starboard to definitively say, "This exact package version is relied upon by this repository."

By anchoring tool detection on these build-critical files, Starboard ensures that its highest-confidence recommendations are based on actual usage, not aspirations or outdated documentation.

## The Confidence Spectrum

Because repositories vary wildly in how they declare dependencies, a binary "uses tool X" or "does not use tool X" is insufficient. Relying purely on boolean states inevitably forces an engine to overstate its certainty. Starboard introduces a confidence spectrum, scoring detections on a scale that reflects the strength of the underlying evidence.

Here is how the confidence levels generally break down in Starboard's detection algorithm:

- **High Confidence (90-98%)**: Detections derived from an SBOM (`github-sbom`) or direct, explicit manifest inclusions (like finding `terraform` in a `.tf` file, or a known package in a `package.json`). These are the gold standard. The dependency is programmatically verified as part of the project's structure.
- **Medium Confidence (55%)**: Detections based on GitHub repository topics (`github-topic`). While maintainers apply topics intentionally, they are sometimes aspirational, broadly categorized, or fail to accurately represent the core runtime. For instance, a tutorial repository might be tagged with `react` without actually compiling any React code.
- **Low Confidence (35-45%)**: Detections based on text inference from the repository's description, cached README text, or AI-generated metadata (`ai-metadata`, `description`, `cached-readme`). If a README mentions "Next.js", it might mean the project *uses* Next.js, or it might mean the project is an *alternative* to Next.js, or perhaps it merely integrates with Next.js environments. Consequently, the confidence score reflects this ambiguity.

When multiple sources indicate the presence of a tool, Starboard doesn't just pick one at random. The system is designed to merge these detections, keeping the highest confidence score and compiling the sources. If a tool is detected in both a `package.json` (manifest) and the README, the final confidence score will be the higher of the two, while the user can clearly see that both sources provided evidence, yielding a comprehensive view of the tool's footprint.

## Handling Ambiguity and Ecosystem Quirks

No detection system is perfect, and acknowledging these limitations is key to not overstating certainty. Starboard's architecture explicitly accounts for ambiguity.

One of the most challenging areas is the C/C++ ecosystem. Unlike JavaScript with `npm` or Rust with `cargo`, C and C++ projects often rely on varying build systems (CMake, Make, Ninja, custom scripts) and system-level dependencies that are not cleanly declared in a standardized manifest. Starboard recognizes this limitation. The accuracy of tool detection varies significantly by ecosystem, and custom monorepos often hide dependencies deep within non-standard folder structures that are difficult to parse without executing arbitrary code.

Furthermore, it's important to distinguish between metadata and tooling. For instance, the primary programming language of a repository is classified as metadata, not as a detected "tool." A repository categorized as "TypeScript" does not count TypeScript as an explicit tool detection, ensuring analytical purity.

By recognizing that manifest detection has blind spots—like truncated GitHub file tree responses or complex monorepo layouts—Starboard maintains a defensive posture. It treats tool detection as an evidence-gathering exercise, not a comprehensive runtime audit. If a file tree response is truncated, the system logs the truncation and proceeds with the available data, never falsely extrapolating dependencies.

## Transparency in the UI

The value of a confidence-based detection system is lost if the end-user doesn't understand it. Starboard’s UI is built to expose the underlying reality of the data without overwhelming the developer.

The Tool Intelligence guide within the application specifically addresses the nature of the data. It informs users that detection confidence describes the strength of the evidence (e.g., manifest vs. README), not whether a tool is necessarily the right fit for the user's own project.

Crucially, Starboard displays an explicit accuracy disclaimer directly in the product:

> "Tool detection is evidence-based, not a full runtime audit. Package manifests, lockfiles, and SBOMs are high-confidence; README, topics, and AI metadata are lower-confidence signals. Repository language is metadata, not counted as a tool. Accuracy varies by ecosystem, especially for C/C++ and custom monorepos."

By placing this disclaimer front and center, Starboard empowers developers to make informed decisions. When they view a tool's adoption across the public catalog or their own library, they know exactly what that count represents: a compilation of concrete evidence, scored by reliability, with clear boundaries on its own accuracy.

## Next Action

Interested in seeing evidence-based tool intelligence in action? Head over to the public Discover page to explore the tools detected across popular repositories, or sign in to analyze the technology stack of your own saved library.
