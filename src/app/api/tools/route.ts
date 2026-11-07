export async function GET() { return Response.json({ scope: 'discover', minStars: 10000, minConfidence: 0, disclaimer: 'Detections are inferred from repository source evidence.', tools: [
{toolKey:'react',toolName:'React',category:'framework',url:'https://react.dev',repoCount:1605,avgConfidence:96,maxConfidence:100},
{toolKey:'docker',toolName:'Docker',category:'infrastructure',url:'https://docker.com',repoCount:2205,avgConfidence:88,maxConfidence:100},
{toolKey:'github-actions',toolName:'GitHub Actions',category:'ci',url:'https://github.com/features/actions',repoCount:4744,avgConfidence:99,maxConfidence:100}
] }); }
