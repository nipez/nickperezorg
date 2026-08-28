import { clearSessionCookie, createSessionCookie, hasValidSession, json, passwordMatches } from "./auth";

export interface Env {
  DB: D1Database;
  ADMIN_PASSWORD: string;
}

type CardRow = {
  id: number;
  name: string;
  description: string;
  url: string;
  badge: string;
  color: string;
  sort_order: number;
};

type AdminCardRow = CardRow & {
  clicks: number;
  clicks_7d: number;
};

const COLORS = ["#0e7a5f", "#b4552d", "#3d5a80", "#7a5f0e", "#5f3d80", "#80513d"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function badgeFromName(name: string): string {
  const letters = name.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase();
  return letters.length > 0 ? letters : "••";
}

function parseUrl(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "#") {
    return "";
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function requirePassword(env: Env): Response | null {
  if (!env.ADMIN_PASSWORD) {
    return json({ error: "Admin password is not configured." }, 503);
  }
  return null;
}

async function requireAdmin(request: Request, env: Env): Promise<Response | null> {
  const missing = requirePassword(env);
  if (missing) {
    return missing;
  }
  if (!(await hasValidSession(request, env.ADMIN_PASSWORD))) {
    return json({ error: "Unauthorized" }, 401);
  }
  return null;
}

function publicCard(row: CardRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    url: row.url,
    badge: row.badge,
    color: row.color,
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path === "/api/cards" && request.method === "GET") {
      const result = await env.DB.prepare(
        "SELECT id, name, description, url, badge, color, sort_order FROM cards ORDER BY sort_order, id",
      ).all<CardRow>();
      return json({ cards: (result.results ?? []).map(publicCard) });
    }

    if (path === "/api/clicks" && request.method === "POST") {
      const body = await readJson(request);
      if (!isRecord(body) || typeof body.id !== "number" || !Number.isInteger(body.id) || body.id < 1) {
        return json({ error: "Invalid card id" }, 400);
      }
      const card = await env.DB.prepare("SELECT id, url FROM cards WHERE id = ?").bind(body.id).first<{ id: number; url: string }>();
      if (!card) {
        return json({ error: "Card not found" }, 404);
      }
      if (!card.url) {
        return json({ ok: true, counted: false });
      }
      await env.DB.prepare("INSERT INTO clicks (card_id, created_at) VALUES (?, ?)").bind(card.id, Date.now()).run();
      return json({ ok: true, counted: true });
    }

    if (path === "/api/admin/login" && request.method === "POST") {
      const missing = requirePassword(env);
      if (missing) {
        return missing;
      }
      const body = await readJson(request);
      if (!isRecord(body) || typeof body.password !== "string") {
        return json({ error: "Password required" }, 400);
      }
      if (!passwordMatches(body.password, env.ADMIN_PASSWORD)) {
        return json({ error: "Wrong password" }, 401);
      }
      return json({ ok: true }, 200, {
        "set-cookie": await createSessionCookie(env.ADMIN_PASSWORD),
      });
    }

    if (path === "/api/admin/logout" && request.method === "POST") {
      return json({ ok: true }, 200, { "set-cookie": clearSessionCookie() });
    }

    if (path === "/api/admin/session" && request.method === "GET") {
      const denied = await requireAdmin(request, env);
      if (denied) {
        return denied;
      }
      return json({ ok: true });
    }

    if (path === "/api/admin/cards" && request.method === "GET") {
      const denied = await requireAdmin(request, env);
      if (denied) {
        return denied;
      }
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const result = await env.DB.prepare(
        `SELECT c.id, c.name, c.description, c.url, c.badge, c.color, c.sort_order,
                (SELECT COUNT(*) FROM clicks WHERE card_id = c.id) AS clicks,
                (SELECT COUNT(*) FROM clicks WHERE card_id = c.id AND created_at >= ?) AS clicks_7d
         FROM cards c
         ORDER BY c.sort_order, c.id`,
      )
        .bind(weekAgo)
        .all<AdminCardRow>();
      return json({ cards: result.results ?? [] });
    }

    if (path === "/api/admin/cards" && request.method === "POST") {
      const denied = await requireAdmin(request, env);
      if (denied) {
        return denied;
      }
      const parsed = parseCardBody(await readJson(request));
      if (!parsed.ok) {
        return json({ error: parsed.error }, 400);
      }
      const max = await env.DB.prepare("SELECT COALESCE(MAX(sort_order), 0) AS n FROM cards").first<{ n: number }>();
      const color = COLORS[(max?.n ?? 0) % COLORS.length];
      const inserted = await env.DB.prepare(
        "INSERT INTO cards (name, description, url, badge, color, sort_order) VALUES (?, ?, ?, ?, ?, ?) RETURNING id, name, description, url, badge, color, sort_order",
      )
        .bind(parsed.value.name, parsed.value.description, parsed.value.url, badgeFromName(parsed.value.name), color, (max?.n ?? 0) + 1)
        .first<CardRow>();
      return json({ card: inserted }, 201);
    }

    const cardMatch = path.match(/^\/api\/admin\/cards\/(\d+)$/);
    if (cardMatch) {
      const denied = await requireAdmin(request, env);
      if (denied) {
        return denied;
      }
      const id = Number(cardMatch[1]);
      if (request.method === "PUT") {
        const parsed = parseCardBody(await readJson(request));
        if (!parsed.ok) {
          return json({ error: parsed.error }, 400);
        }
        const updated = await env.DB.prepare(
          "UPDATE cards SET name = ?, description = ?, url = ?, badge = ? WHERE id = ? RETURNING id, name, description, url, badge, color, sort_order",
        )
          .bind(parsed.value.name, parsed.value.description, parsed.value.url, badgeFromName(parsed.value.name), id)
          .first<CardRow>();
        if (!updated) {
          return json({ error: "Card not found" }, 404);
        }
        return json({ card: updated });
      }
      if (request.method === "DELETE") {
        const existing = await env.DB.prepare("SELECT id FROM cards WHERE id = ?").bind(id).first<{ id: number }>();
        if (!existing) {
          return json({ error: "Card not found" }, 404);
        }
        await env.DB.prepare("DELETE FROM clicks WHERE card_id = ?").bind(id).run();
        await env.DB.prepare("DELETE FROM cards WHERE id = ?").bind(id).run();
        return json({ ok: true });
      }
    }

    return json({ error: "Not found" }, 404);
  },
};

function parseCardBody(body: unknown): { ok: true; value: { name: string; description: string; url: string } } | { ok: false; error: string } {
  if (!isRecord(body)) {
    return { ok: false, error: "Invalid JSON" };
  }
  if (typeof body.name !== "string" || body.name.trim().length === 0) {
    return { ok: false, error: "Name is required" };
  }
  if (typeof body.description !== "string") {
    return { ok: false, error: "Description is required" };
  }
  if (typeof body.url !== "string") {
    return { ok: false, error: "URL is required" };
  }
  const url = parseUrl(body.url);
  if (url === null) {
    return { ok: false, error: "URL must be http(s) or empty" };
  }
  return {
    ok: true,
    value: {
      name: body.name.trim().slice(0, 80),
      description: body.description.trim().slice(0, 280),
      url,
    },
  };
}
