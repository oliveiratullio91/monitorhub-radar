import { publicConfig } from "../server/marketplaces.js";

export default function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.status(200).json(publicConfig());
}
