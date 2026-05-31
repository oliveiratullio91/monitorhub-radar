export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");

  if (request.method === "HEAD") {
    response.status(200).end();
    return;
  }

  if (!["GET", "POST"].includes(request.method)) {
    response.setHeader("Allow", "GET, POST, HEAD");
    response.status(405).json({ ok: false, error: "Metodo nao permitido" });
    return;
  }

  response.status(200).json({
    ok: true,
    source: "mercadolivre",
    message: "Endpoint de notificacoes ativo.",
    receivedAt: new Date().toISOString(),
  });
}
