import { publicConfig } from "../server/marketplaces.js";
import { decodeMercadoLivreTokenCookie } from "./_mercadolivre-oauth.js";

export default function handler(request, response) {
  const mercadoLivreAuth = decodeMercadoLivreTokenCookie(request);
  const config = publicConfig();
  if (mercadoLivreAuth?.accessToken || mercadoLivreAuth?.refreshToken) {
    config.mercadoLivreConfigured = true;
    config.mercadoLivreMode = "session";
    config.realSourcesReady = true;
    config.requiredEnv.mercadoLivre = [];
  }

  response.setHeader("Cache-Control", "no-store");
  response.status(200).json(config);
}
