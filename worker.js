const EMBEDDING_MODEL = "@cf/baai/bge-m3";
const CHAT_MODEL = "@cf/zai-org/glm-4.7-flash";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / ((Math.sqrt(na) * Math.sqrt(nb)) || 1);
}

function extractAIText(data) {
  if (typeof data?.response === "string" && data.response.trim()) return data.response.trim();
  const choice = data?.choices?.[0]?.message?.content;
  if (typeof choice === "string" && choice.trim()) return choice.trim();
  if (Array.isArray(choice)) {
    const text = choice.map(x => x?.text || x?.content || "").filter(Boolean).join("\n").trim();
    if (text) return text;
  }
  if (typeof data?.result?.response === "string") return data.result.response.trim();
  return "";
}

async function vectorSearch(env, query, documents) {
  const docs = (documents || [])
    .filter(d => d && typeof d.text === "string" && d.text.trim())
    .slice(0, 80)
    .map(d => ({
      id: String(d.id || crypto.randomUUID()),
      title: String(d.title || "Document"),
      text: d.text.slice(0, 2400)
    }));

  if (!query || !docs.length) return [];

  const embeddings = await env.AI.run(EMBEDDING_MODEL, {
    text: [query, ...docs.map(d => d.text)]
  });
  const vectors = embeddings?.data || [];
  const qv = vectors[0];
  if (!qv) throw new Error("No query embedding returned");

  return docs.map((doc, i) => ({
    ...doc,
    score: cosine(qv, vectors[i + 1] || [])
  })).sort((a, b) => b.score - a.score).slice(0, 5);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({
        ok: true,
        retrieval: "vector",
        embedding_model: EMBEDDING_MODEL,
        model: CHAT_MODEL,
        provider: "cloudflare-workers-ai"
      });
    }

    if (url.pathname === "/ai") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      try {
        const body = await request.json();
        const query = String(body.query || "").trim().slice(0, 4000);
        const documents = Array.isArray(body.documents) ? body.documents : [];
        if (!query) return json({ error: "Missing query" }, 400);

        const matches = await vectorSearch(env, query, documents);
        const context = matches.map((m, i) =>
          `[${i + 1}] ${m.title} | similarity=${m.score.toFixed(4)}\n${m.text}`
        ).join("\n\n");

        const ai = await env.AI.run(CHAT_MODEL, {
          messages: [
            {
              role: "system",
              content: "Jesteś TradeOS AI, osobistym copilotem tradingowym. Odpowiadaj po polsku, krótko i konkretnie. Korzystaj przede wszystkim z dostarczonego kontekstu. Nie przedstawiaj danych demonstracyjnych jako real-time. Nie obiecuj zysków ani pewnych sygnałów. Jeśli kontekst nie wystarcza, powiedz to jasno."
            },
            {
              role: "user",
              content: `Pytanie użytkownika:\n${query}\n\nNajbardziej podobny semantycznie kontekst:\n${context || "Brak pasującego kontekstu."}`
            }
          ],
          temperature: 0.2,
          max_completion_tokens: 600
        });

        const answer = extractAIText(ai) || "Nie udało się odczytać odpowiedzi modelu.";
        return json({
          answer,
          retrieval: "vector",
          provider: "cloudflare-workers-ai",
          embedding_model: EMBEDDING_MODEL,
          model: CHAT_MODEL,
          matches: matches.map(m => ({ id: m.id, title: m.title, score: m.score }))
        });
      } catch (e) {
        return json({ error: e?.message || "Backend error" }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  }
};
