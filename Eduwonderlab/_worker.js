/**
 * _worker.js — EduWonderLab Cloudflare Pages Worker
 *
 * KV Binding required (set in Cloudflare Dashboard):
 *   Variable name : EWL_DATA
 *   (Workers & Pages → your project → Settings → Functions → KV namespace bindings)
 *
 * Routes handled:
 *   GET  /api/health
 *   GET  /api/assignments
 *   POST /api/assignments
 *   GET  /api/submissions          ?assignmentId=xxx  (optional filter)
 *   POST /api/submissions
 *
 * Storage layout in KV:
 *   assignment:{id}   → JSON object
 *   submission:{id}   → JSON object
 *   index:assignments → JSON array of ids  (keeps list ordered)
 *   index:submissions → JSON array of ids
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
  });
}

function err(msg, status = 400) {
  return json({ ok: false, error: msg }, status);
}

function uid() {
  // compact random ID — fine for classroom scale
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ---------- KV helpers ----------

async function kvGet(kv, key) {
  const v = await kv.get(key);
  if (!v) return null;
  try { return JSON.parse(v); } catch { return null; }
}

async function kvPut(kv, key, value) {
  await kv.put(key, JSON.stringify(value));
}

async function getIndex(kv, name) {
  return (await kvGet(kv, `index:${name}`)) || [];
}

async function pushIndex(kv, name, id) {
  const idx = await getIndex(kv, name);
  if (!idx.includes(id)) idx.push(id);
  await kvPut(kv, `index:${name}`, idx);
}

// ---------- Route handlers ----------

async function handleAssignmentsGet(kv) {
  const ids = await getIndex(kv, "assignments");
  const items = await Promise.all(
    ids.map((id) => kvGet(kv, `assignment:${id}`))
  );
  return json({ ok: true, items: items.filter(Boolean).reverse() }); // newest first
}

async function handleAssignmentsPost(kv, body) {
  const { title, prompt } = body || {};
  if (!title || !title.trim()) return err("title is required");
  if (!prompt || !prompt.trim()) return err("prompt is required");

  const id = uid();
  const record = {
    id,
    title: title.trim(),
    prompt: prompt.trim(),
    gradeBand: (body.gradeBand || "").trim(),
    classPin: (body.classPin || "").trim(),
    createdAt: body.createdAt || new Date().toISOString(),
  };

  await kvPut(kv, `assignment:${id}`, record);
  await pushIndex(kv, "assignments", id);

  return json({ ok: true, id, item: record }, 201);
}

async function handleSubmissionsGet(kv, url) {
  const filterId = url.searchParams.get("assignmentId") || "";
  const ids = await getIndex(kv, "submissions");
  let items = await Promise.all(
    ids.map((id) => kvGet(kv, `submission:${id}`))
  );
  items = items.filter(Boolean);

  if (filterId) {
    items = items.filter((s) => s.assignmentId === filterId);
  }

  return json({ ok: true, items: items.reverse() }); // newest first
}

async function handleSubmissionsPost(kv, body) {
  const { assignmentId, studentName, response } = body || {};
  if (!assignmentId) return err("assignmentId is required");
  if (!studentName || !studentName.trim()) return err("studentName is required");
  if (!response || !response.trim()) return err("response is required");

  // verify assignment exists
  const asgn = await kvGet(kv, `assignment:${assignmentId}`);
  if (!asgn) return err("assignment not found", 404);

  const id = uid();
  const record = {
    id,
    assignmentId,
    studentName: studentName.trim(),
    classPin: (body.classPin || "").trim(),
    response: response.trim(),
    steps: (body.steps || "").trim(),
    reflection: (body.reflection || "").trim(),
    submittedAt: body.submittedAt || new Date().toISOString(),
  };

  await kvPut(kv, `submission:${id}`, record);
  await pushIndex(kv, "submissions", id);

  return json({ ok: true, id, item: record }, 201);
}

// ---------- Main fetch handler ----------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    // CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Health check
    if (path === "/api" || path === "/api/health") {
      return json({ ok: true, service: "EduWonderLab API", ts: new Date().toISOString() });
    }

    // All other /api/* routes need KV
    if (path.startsWith("/api/")) {
      const kv = env.EWL_DATA;

      if (!kv) {
        return err(
          "KV namespace EWL_DATA not bound. Go to Cloudflare Dashboard → " +
          "Workers & Pages → your project → Settings → Functions → " +
          "KV namespace bindings and add EWL_DATA.",
          500
        );
      }

      // Parse JSON body for POST
      let body = null;
      if (method === "POST") {
        try {
          body = await request.json();
        } catch {
          return err("Invalid JSON body");
        }
      }

      // Assignments
      if (path === "/api/assignments") {
        if (method === "GET") return handleAssignmentsGet(kv);
        if (method === "POST") return handleAssignmentsPost(kv, body);
      }

      // Submissions
      if (path === "/api/submissions") {
        if (method === "GET") return handleSubmissionsGet(kv, url);
        if (method === "POST") return handleSubmissionsPost(kv, body);
      }

      return err("Not found", 404);
    }

    // Serve static assets for everything else
    return env.ASSETS.fetch(request);
  },
};
