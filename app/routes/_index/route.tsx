import type {LoaderFunctionArgs} from "react-router";
import {Form, redirect, useLoaderData} from "react-router";
import {login} from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({request}: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) throw redirect("/app?" + url.searchParams.toString());
  return {showForm: Boolean(login)};
};

export default function PublicHome() {
  const {showForm} = useLoaderData<typeof loader>();
  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1>EcoPack AI</h1>
        <p>L&apos;assistente sostenibilità per gli e-commerce italiani.</p>
        <ul>
          <li>Calcolo CO₂e automatico per ogni ordine</li>
          <li>Packaging riciclabile ed etichette ambientali</li>
          <li>Carbon Neutral al checkout e report merchant</li>
        </ul>
        {showForm && (
          <Form method="post" action="/auth/login">
            <label><span>Dominio del negozio</span><input name="shop" type="text" placeholder="negozio.myshopify.com" /></label>
            <button type="submit">Installa EcoPack AI</button>
          </Form>
        )}
      </div>
    </div>
  );
}
