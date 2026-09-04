# TradeOS AI — Cloudflare full-stack PWA

Ta wersja działa bez klucza OpenAI i bez ręcznego adresu backendu.

- PWA i API są wdrażane razem jako jeden Cloudflare Worker.
- Endpoint AI: `/ai`
- Health: `/health`
- Vector retrieval: `@cf/baai/bge-m3` + cosine similarity.
- Model odpowiedzi: `@cf/zai-org/glm-4.7-flash`.
- Workers AI jest podłączone przez binding `AI` w `wrangler.toml`.
- Frontend komunikuje się z backendem same-origin, więc nie trzeba ustawiać CORS ani wklejać URL.
