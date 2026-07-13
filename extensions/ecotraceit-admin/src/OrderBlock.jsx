import {useEffect, useState} from "react";
import {reactExtension, useApi, AdminBlock, Banner, BlockStack, Text, Badge} from "@shopify/ui-extensions-react/admin";

const TARGET = "admin.order-details.block.render";

export default reactExtension(TARGET, () => <OrderImpact />);

function OrderImpact() {
  const {data, query, i18n} = useApi(TARGET);
  const translate = i18n.translate;
  const [impact, setImpact] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadImpact() {
      try {
        const orderId = data.selected?.[0]?.id;
        if (!orderId) throw new Error("No Shopify order selected");
        const result = await query(`query EcoTraceITOrderImpact($id: ID!) {
          order(id: $id) {
            co2: metafield(namespace: "ecotraceit", key: "co2_kg") { value }
            packaging: metafield(namespace: "ecotraceit", key: "packaging") { value }
            label: metafield(namespace: "ecotraceit", key: "packaging_label") { value }
            material: metafield(namespace: "ecotraceit", key: "packaging_material") { value }
            neutral: metafield(namespace: "ecotraceit", key: "carbon_neutral") { value }
            method: metafield(namespace: "ecotraceit", key: "calculation_method") { value }
          }
        }`, {variables: {id: orderId}});
        if (result.errors?.length) throw new Error(result.errors[0].message);
        setImpact(result.data?.order || null);
      } catch {
        setError(translate("load_error"));
      }
    }
    loadImpact();
  }, [data.selected, query, translate]);

  return (
    <AdminBlock title="EcoTraceIT">
      <BlockStack gap="base">
        {error && <Banner tone="critical">{error}</Banner>}
        {!error && !impact && <Text>{translate("loading")}</Text>}
        {impact && !impact.co2 && <Banner tone="info">{translate("pending")}</Banner>}
        {impact?.co2 && (
          <>
            <Badge tone="success">{Number(impact.co2.value).toFixed(2)} kg CO₂e</Badge>
            <Text>{translate("packaging")}: {impact.packaging?.value || translate("unavailable")}</Text>
            <Text>{translate("material")}: {impact.material?.value || translate("unavailable")}</Text>
            <Text>{translate("label")}: {impact.label?.value || translate("unavailable")}</Text>
            <Text>{translate("method")}: {impact.method?.value || "formula"}</Text>
            <Badge tone={impact.neutral?.value === "true" ? "success" : "info"}>
              {impact.neutral?.value === "true" ? translate("neutral") : translate("not_offset")}
            </Badge>
          </>
        )}
      </BlockStack>
    </AdminBlock>
  );
}
