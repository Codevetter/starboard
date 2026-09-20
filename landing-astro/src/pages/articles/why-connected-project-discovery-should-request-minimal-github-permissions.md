---
layout: ../../layouts/Article.astro
title: "Why connected-project discovery should request minimal GitHub permissions"
description: "Learn why developer tools integrating with GitHub projects should request minimal OAuth permissions and how Starboard implements this principle for secure discovery."
date: "2026-09-20"
author: "Sarthak Agrawal"
readingMinutes: 7
---

## Introduction: The Balancing Act Between Utility and Security

Developers are constantly evaluating open-source projects and tools for the software they are already building. GitHub serves as the canonical source of project identity, providing the metadata and dependency graphs necessary for deep, context-aware discovery. However, connecting developer tools to GitHub projects introduces a critical tension: the need for project context versus the imperative of maintaining strict security boundaries.

When a developer integrates a third-party discovery platform, that platform must authenticate with GitHub to read the repository's state. Historically, many tools have asked for sweeping permissions—often requesting full read and write access to all public and private repositories—just to perform read-only analysis. This over-permissioning creates an unnecessary attack surface, turning every connected tool into a potential vulnerability.

Connected-project discovery should not require developers to compromise on security. By requesting minimal GitHub permissions, discovery platforms can build trust, limit their blast radius, and still provide high-quality, evidence-backed tool recommendations. This article explores why minimal scopes are essential for developer tools and how project-aware discovery can operate effectively without overreaching into a user's sensitive source code.

## The Trust Gap in Developer Tools

The modern software supply chain is complex, and the tools developers use to navigate it have unprecedented access to sensitive intellectual property. When developers evaluate a new tool, the first interaction is often an OAuth authorization screen. If a tool claiming to provide read-only repository recommendations requests the ability to modify webhooks, commit code, or read private repositories, developers face a choice: abandon the tool or accept a disproportionate risk.

This creates a trust gap. Security-conscious developers—and the compliance frameworks their organizations adhere to—rightly view broad OAuth requests as a red flag. A tool that asks for more access than it needs demonstrates a lack of respect for the user's security posture and often points to lazy engineering practices where the developer chose a catch-all permission instead of identifying the exact API scopes required.

For a project-aware discovery tool, the goal is to understand a project's current technical context and find useful repositories to evaluate. This involves analyzing manifests, dependencies, and public repository metadata. None of these actions fundamentally require write access, nor do they inherently demand access to private, proprietary codebases in the initial evaluation phase. Bridging the trust gap requires tools to align their permission requests strictly with the value they provide.

## Understanding GitHub OAuth Scopes and Risks

To understand why minimal permissions matter, it is crucial to examine how GitHub structures its OAuth scopes. GitHub's permission model uses scopes to define exactly what an authenticated application can and cannot do.

The most common—and most dangerous—scope requested by developer tools is the generic `repo` scope. According to GitHub's documentation, granting the `repo` scope gives an application full control of private repositories. This includes read and write access to code, commit statuses, repository invitations, collaborators, deployment statuses, and webhooks. For a discovery tool that merely needs to read public metadata or analyze public dependencies, requesting the `repo` scope represents a massive overreach. If the tool is compromised, the attacker gains the ability to inject malicious code into the user's private repositories.

In contrast, the `public_repo` scope limits the application's access to public repositories, but it still grants write access to those public repositories. Even this can be too broad for a purely observational tool.

The most secure approach for read-only discovery is to use granular permissions, such as requesting only public repository access, or leveraging GitHub Apps instead of traditional OAuth apps. By understanding these scopes, development teams can better evaluate the tools they adopt, and tool builders can design systems that adhere to the principle of least privilege.

## The Principle of Least Privilege in Discovery

The principle of least privilege dictates that a system should have only the minimum access rights necessary to perform its intended function. In the context of connected-project discovery, this means asking: "What is the absolute minimum GitHub data required to generate useful, evidence-backed recommendations?"

For project-aware discovery, the core requirements are verifying identity and reading the public metadata, manifests, and dependencies of the specific project being evaluated.

Adhering to the principle of least privilege means designing the discovery engine so that it does not need to index private code or maintain long-lived write access. When a tool respects this boundary, it limits its own blast radius. If a vulnerability is discovered in the tool's infrastructure, the lack of write permissions ensures that user repositories cannot be directly altered or corrupted. Furthermore, by not storing private repository data unless explicitly required through a separate flow, the tool reduces the risk of exposing proprietary intellectual property.

This approach also simplifies compliance. Organizations subject to SOC 2 or ISO 27001 must rigorously audit third-party access to their codebases. Tools operating on minimal, read-only public scopes are significantly easier to approve through security reviews, ensuring developers can access the intelligence they need without bureaucratic delays.

## How Starboard Connects to Public Projects

Starboard is designed as project-aware tool intelligence. It connects a developer's GitHub projects to a catalog of open-source repositories to help them discover projects and tools relevant to their work. From its inception, Starboard has been architected to respect developer boundaries and operate with minimal access.

According to the product's foundational principles, the initial project-connection boundary is strictly limited to public GitHub repositories. Starboard utilizes the existing minimal OAuth permission required for authentication. It does not request the broad `repo` scope, nor does it require any new production dependencies or broader GitHub OAuth scopes for its connected-project workflow.

When a developer connects a project, Starboard reads the public repository's context to power its semantic discovery and evidence-aware tool detection. This detection relies on analyzing manifests, SBOMs, repository trees, and lower-confidence metadata inference—all of which can be performed on public repositories without intrusive permissions. Because the project connection is restricted to public data, users do not expose their private code to Starboard's indexing processes.

Private-repository access remains an open product and permission decision. By deferring private access, Starboard ensures that its core value—providing grounded, context-aware recommendations from a public Discover corpus—remains accessible, free, and secure. Developers can test the platform's utility without having to negotiate complex security approvals for private codebase access.

## Concrete Examples: Scope Abuse vs. Minimal Scopes

To illustrate the importance of this architectural choice, consider the contrast between a poorly scoped tool and one designed with minimal permissions.

**Example 1: The Over-Permissioned Linter**
A developer discovers an AI-powered code analysis tool. Upon clicking "Connect to GitHub," the OAuth screen requests the full `repo` scope. The tool explains it "needs access to read your code." However, the `repo` scope also grants the ability to write code, modify collaborators, and alter repository settings. If this tool's database is breached, attackers could use those tokens to push malicious commits to the developer's private repositories.

**Example 2: Minimal Scope Discovery with Starboard**
A developer signs into Starboard to find libraries similar to the ones they are using in an open-source project. Starboard authenticates the user using minimal OAuth permissions. It allows the user to connect a public repository via URL or a public-repository picker. Because Starboard relies on public metadata and its own stored repository embeddings, it generates precise, evidence-backed tool recommendations without requesting write access or private repository visibility. Their security posture remains entirely uncompromised.

## Practical Implications for Development Teams

For engineering leaders and developers, the lesson is clear: always audit the permissions requested by third-party integrations. The default stance should be skepticism toward any tool that requests more access than its stated purpose demands.

When adopting discovery tools, teams should prioritize platforms that explicitly document their required OAuth scopes, default to public-only access, do not require write permissions for read-only analysis, and provide clear mechanisms to disconnect projects.

By demanding minimal permissions, developers encourage tool builders to leverage modern integrations with fine-grained scopes rather than relying on legacy OAuth apps with sweeping privileges. Ultimately, this leads to a safer software supply chain where innovation does not come at the expense of security.

## Practical Next Action

Review the third-party OAuth applications authorized on your GitHub account. Navigate to Settings > Applications > Authorized OAuth Apps, and audit the permissions granted to each tool. Revoke access for any application that requests the broad `repo` scope but only provides read-only or public-facing utility. When exploring new repository intelligence tools, prioritize platforms like Starboard that default to public-repository boundaries and minimal OAuth scopes.
