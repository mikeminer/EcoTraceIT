import type {ActionFunctionArgs} from "react-router";
import prisma from "../db.server";
import {authenticate} from "../shopify.server";

export const action = async ({request}: ActionFunctionArgs) => {
  const {topic, shop} = await authenticate.webhook(request);
  if (topic === "SHOP_REDACT") {
    await prisma.shopSettings.deleteMany({where: {shop}});
    await prisma.session.deleteMany({where: {shop}});
  }
  console.info(JSON.stringify({event: "compliance_webhook", topic, shop}));
  return new Response(null, {status: 200});
};