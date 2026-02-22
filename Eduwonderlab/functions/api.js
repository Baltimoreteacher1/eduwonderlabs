export async function onRequest() {
  return new Response(JSON.stringify({
    status: "online",
    message: "EduWonderLab API running"
  }), {
    headers: { "content-type": "application/json" }
  });
}