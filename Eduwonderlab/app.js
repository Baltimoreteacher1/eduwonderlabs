/**
 * app.js  — EduWonderLab browser-side API client
 * Loaded by student.html and teacher.html via <script src="./app.js">
 * Defines window.EWL with apiGet / apiPost helpers.
 */
(function () {
  "use strict";

  const BASE = "/api";

  async function request(method, path, body) {
    const opts = {
      method,
      headers: { "Content-Type": "application/json" },
    };
    if (body !== undefined) {
      opts.body = JSON.stringify(body);
    }

    const res = await fetch(BASE + path, opts);

    let data;
    try {
      data = await res.json();
    } catch (_) {
      data = null;
    }

    if (!res.ok) {
      const msg =
        (data && data.error) || `Request failed: ${res.status} ${res.statusText}`;
      throw new Error(msg);
    }

    return data;
  }

  window.EWL = {
    /** GET /api{path}  →  parsed JSON */
    apiGet(path) {
      return request("GET", path);
    },

    /** POST /api{path} with JSON body  →  parsed JSON */
    apiPost(path, payload) {
      return request("POST", path, payload);
    },
  };
})();
