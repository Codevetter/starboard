"use client";
import { SessionProvider } from 'next-auth/react';
import { AppShell } from '@/components/app-shell';
import { ProjectsWorkspace } from '@/components/projects-workspace';
const session = { expires: '2099-01-01', user: { name: 'Public fixture', githubId: 'preview' } };
export default function PreviewPage() { return <SessionProvider session={session}><AppShell><ProjectsWorkspace selectedSlug="1" initialRepository="" /></AppShell></SessionProvider>; }
