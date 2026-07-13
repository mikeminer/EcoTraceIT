import type {LoaderFunctionArgs} from "react-router";
import prisma from "../db.server";

export const loader = async ({request}: LoaderFunctionArgs) => {
  if (request.method !== "GET") return new Response(null, {status: 405});
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({status: "ok", service: "ecotraceit"}, {
      headers: {"Cache-Control": "no-store"},
    });
  } catch {
    return Response.json({status: "error", service: "ecotraceit"}, {status: 503});
  }
};
