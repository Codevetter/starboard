export async function GET() { return Response.json({expires:'2099-01-01',user:{name:'Public fixture',githubId:'preview'}}); }
export async function POST() { return new Response(null,{status:405}); }
