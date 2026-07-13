import type {ActionFunctionArgs} from "react-router";
import {authenticate} from "../shopify.server";
import db from "../db.server";

export const action = async ({request}: ActionFunctionArgs) => {
  const {shop, topic} = await authenticate.webhook(request);
  console.info(JSON.stringify({event: "app_uninstalled", topic, shop}));
  await db.$transaction([
    db.shopSettings.deleteMany({where: {shop}}),
    db.session.deleteMany({where: {shop}}),
  ]);
  return new Response(null, {status: 200});
};